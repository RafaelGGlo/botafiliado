import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStoryPublisher, pythonPublisher } from '../src/instagrapi-stories.js';
import { downloadImage } from '../src/media.js';
import { WhatsAppQueue } from '../src/whatsapp-queue.js';
import { startDashboard } from '../src/dashboard-server.js';
import { projectRoot, stateRoot } from '../src/runtime-paths.js';
import { health } from '../../../scripts/health-check.mjs';
import { cleanPublishedMedia } from '../../../scripts/maintain-story-media.mjs';
import { DatabaseSync } from 'node:sqlite';

test('Story gates block confirmed jobs, recovery and retries without consuming attempts', async t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'story-gates-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let calls=0;const env={INSTAGRAM_TEST_MODE:'true',INSTAGRAPI_LIVE_APPROVED:'false'};
 const options={dir,env,publish:async()=>{calls++;return {status:'published'};},makeImage:async()=>Buffer.from('mock')};
 let p=createStoryPublisher(options);const offer={id:'one',affiliateUrl:'https://shope.ee/test'};
 await p.stage(offer,Buffer.from('mock'),'caption');await p.confirmed(offer);await p.retry();assert.equal(calls,0);assert.equal(p.list()[0].attempts,0);await p.close();
 p=createStoryPublisher({...options,recoverInterrupted:true});p.recoverConfirmed({hasConfirmedDelivery:()=>true});await p.retry();assert.equal(calls,0);
 env.INSTAGRAPI_LIVE_APPROVED='true';await p.retry();assert.equal(calls,0);
 env.INSTAGRAM_TEST_MODE='false';await p.retry();assert.equal(calls,1);await p.close();
 assert.equal((await pythonPublisher({}, {env:{INSTAGRAPI_LIVE_APPROVED:'true',INSTAGRAM_TEST_MODE:'true'}})).status,'disabled');
});
test('bot downloader rejects internal addresses and arbitrary ports before transport', async () => {
 let calls=0;
 for(const url of ['https://127.0.0.1/x','https://[::1]/x','https://[::ffff:127.0.0.1]/x','https://10.0.0.1/x','https://example.com:8443/x','https://metadata.internal/x','http://example.com/x']) await assert.rejects(downloadImage(url,async()=>{calls++;return Buffer.from([255,216,255]);}));
 assert.equal(calls,0);
 assert.deepEqual(await downloadImage('https://example.com/x',async()=>Buffer.from([255,216,255])),Buffer.from([255,216,255]));
});
test('dashboard refuses forwarded control access even with local Host', async t => {
 const server=await startDashboard({port:0,getReport:()=>({}),onControl:()=>({})});t.after(server.stop);
 assert.equal((await fetch(server.url+'/api/report',{headers:{'x-forwarded-for':'203.0.113.10'}})).status,403);
});
test('queue bounds bytes, preserves uncertain receipts and removes terminal media', async t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-budget-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'queue.json');const options={store:{isDealSentToGroup:()=>false},ttlMs:999999,maxBytes:2048};
 const q=new WhatsAppQueue(file,options);
 assert.throws(()=>q.enqueue({id:'big'},Buffer.alloc(3000),'caption',['a']),/bytes/);assert.equal(q.jobs.length,0);
 q.enqueue({id:'small'},Buffer.from('tiny'),'caption',['a']);
 await q.drain({canSend:()=>true,selected:()=>['a'],deliver:async()=>({type:'failed'})});
 const resumed=new WhatsAppQueue(file,options);assert.equal(resumed.jobs[0].state,'uncertain');assert.equal(resumed.jobs[0].image,undefined);
 resumed.enqueue({id:'small'},Buffer.from('tiny'),'caption',['a']);assert.equal(resumed.jobs.length,1);
});
test('all working directories resolve the same runtime and lock directory', () => {
 const entry=fileURLToPath(new URL('../src/runtime-env.js',import.meta.url));
 for(const cwd of [projectRoot,path.join(projectRoot,'instagram-publish/whatsapp-bot')]) {
  const result=execFileSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(new URL('../src/runtime-env.js',import.meta.url).href)});console.log(process.cwd())`],{cwd,encoding:'utf8'}).trim();
  assert.equal(result,stateRoot);
 }
 assert.ok(fs.existsSync(entry));
});
test('ExcelJS still serializes an XLSX after patched uuid override', async () => {
 const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Test');sheet.addRow(['offer',19]);
 sheet.addConditionalFormatting({ref:'B1',rules:[{type:'dataBar',minLength:0,maxLength:100,cfvo:[{type:'min'},{type:'max'}],color:{argb:'FF008800'}}]});
 const bytes=await book.xlsx.writeBuffer();const restored=new ExcelJS.Workbook();await restored.xlsx.load(bytes);assert.equal(restored.worksheets[0].getCell('A1').value,'offer');
});
test('health reports stale/offline/security stops without revealing payloads', () => {
 const report={heartbeatAt:100000,connection:'online',status:'idle'};
 assert.equal(health(report,100010).healthy,true);
 assert.ok(health(report,140000).reasons.includes('heartbeat_stale'));
 assert.ok(health({...report,instagramStories:[{key:'a',status:'blocked'}]},100010).reasons.includes('instagram_requires_review'));
 assert.equal(health({...report,instagramStories:[{key:'a',status:'published'},{key:'a',status:'failed'}]},100010).healthy,true);
});
test('media maintenance removes only old published JPEGs, never receipts or uncertain jobs', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'story-retention-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const db=new DatabaseSync(path.join(dir,'outbox.sqlite'));db.exec('CREATE TABLE stories (key TEXT PRIMARY KEY,status TEXT)');
 for(const [key,status] of [['a'.repeat(64),'published'],['b'.repeat(64),'uncertain']]) {
  db.prepare('INSERT INTO stories VALUES(?,?)').run(key,status);const image=path.join(dir,key+'.jpg');fs.writeFileSync(image,'mock');fs.utimesSync(image,1,1);
 }
 db.close();assert.equal(cleanPublishedMedia(dir,{now:86400000*60}).eligible,1);assert.ok(fs.existsSync(path.join(dir,'a'.repeat(64)+'.jpg')));
 assert.equal(cleanPublishedMedia(dir,{now:86400000*60,apply:true}).removed,1);assert.ok(fs.existsSync(path.join(dir,'b'.repeat(64)+'.jpg')));
 const check=new DatabaseSync(path.join(dir,'outbox.sqlite'));assert.equal(check.prepare('SELECT COUNT(*) AS n FROM stories').get().n,2);check.close();
});
