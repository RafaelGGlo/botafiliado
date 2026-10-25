import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createInstagram} from '../src/instagram.js';
import {refreshFeedOffer} from '../src/feed-refresh.js';
import {renderFeed} from '../src/feed-image.js';
import sharp from 'sharp';
import {startDashboard} from '../src/dashboard-server.js';
import {emptyReport} from '../src/report.js';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const offers=['1','2','3'].map(n=>({id:`shopee:10:${n}`,title:'Produto real '+n,price:31.99,imageUrl:'https://example.com/product.jpg',affiliateUrl:'https://s.shopee.com.br/real',productKey:`shopee:10:${n}`}));
function fixture(t,options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feed-queue-'));
 const calls=[],env={INSTAGRAM_ACCOUNT_ID:'123',INSTAGRAM_API_VERSION:'v25.0',INSTAGRAM_ACCESS_TOKEN:'secret',INSTAGRAM_LIVE_APPROVED:'true',INSTAGRAM_TEST_MODE:'false'};
 const graph=async(resource,method,data)=>{calls.push({resource,method,data});if(resource.includes('permalink'))return{permalink:'https://www.instagram.com/p/real/'};if(resource.includes('status_code'))return{status_code:'FINISHED'};return{id:resource.endsWith('media_publish')?'789':'456'};};
 const service=createInstagram({file:path.join(dir,'ig.sqlite'),mediaDir:dir,env,getOffers:()=>offers,feedOptions:{refreshOffer:async o=>({...o,price:42}),render:async()=>Buffer.from('jpeg'),host:async()=>{calls.push({host:true});return'https://res.cloudinary.com/photo.jpg';},graph,...options}});
 service.configure({manualPublish:true});
 t.after(async()=>{await service.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {service,calls,dir,env};
}
test('manual bulk previews refresh selected offers only, isolate failures, and never upload or publish',async t=>{
 const refreshed=[];const f=fixture(t,{refreshOffer:async o=>{refreshed.push(o.id);if(o.id===offers[0].id)throw Error('Oferta indisponível.');return {...o,price:44};}});
 f.service.manualFeed.enqueue([offers[0].id,offers[1].id,offers[1].id],true);
 await f.service.manualFeed.idle();
 const jobs=f.service.manualFeed.list();assert.equal(jobs.length,2);assert.equal(jobs.find(j=>j.offer_id===offers[0].id).status,'failed');
 const ok=jobs.find(j=>j.offer_id===offers[1].id);assert.equal(ok.status,'preview');assert.equal(ok.snapshot.price,44);assert.match(ok.caption,/44,00/);
 assert.equal(f.calls.length,0);assert.deepEqual(refreshed,[offers[0].id,offers[1].id]);assert.equal(f.service.list().length,0);
});
test('double selection publishes separate photos once; existing feed fingerprint blocks scheduled duplicates',async t=>{
 const f=fixture(t);f.service.configure({manualEnabled:false,manualPublish:false});assert.equal(f.service.manualFeed.enabled(),true);const first=f.service.manualFeed.enqueue([offers[0].id,offers[1].id],false);const second=f.service.manualFeed.enqueue([offers[0].id],false);assert.equal(first[0].id,second[0].id);
 await f.service.manualFeed.idle();const jobs=f.service.manualFeed.list();assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.status==='published'&&j.media_id==='789'&&j.published_at&&j.permalink));
 const creations=f.calls.filter(c=>c.resource==='123/media');assert.equal(creations.length,2);assert.ok(creations.every(c=>!c.data.media_type&&!c.data.children));
 f.service.manualFeed.enqueue([offers[0].id],false);await f.service.manualFeed.idle();assert.equal(f.calls.filter(c=>c.resource==='123/media_publish').length,2);
});
test('uncertain publishing response is persisted and cannot be blindly resubmitted',async t=>{
 const f=fixture(t,{graph:async()=>{throw Error('timeout with secret');}});f.service.manualFeed.enqueue([offers[0].id,offers[1].id],false);await f.service.manualFeed.idle();
 assert.ok(f.service.manualFeed.list().every(j=>j.status==='uncertain'&&!j.error.includes('secret')));
 assert.throws(()=>f.service.manualFeed.retry(f.service.manualFeed.list()[0].id),/Somente falhas/);
 f.service.manualFeed.enqueue([offers[0].id],false);await f.service.manualFeed.idle();assert.equal(f.service.manualFeed.list().length,2);
 const reopened=createInstagram({file:path.join(f.dir,'ig.sqlite'),mediaDir:f.dir,env:f.env,getOffers:()=>offers,feedOptions:{refreshOffer:async()=>{throw Error('Uncertain job must not refresh or retry');}}});
 try {reopened.manualFeed.enqueue([offers[0].id],false);await reopened.manualFeed.idle();assert.equal(reopened.manualFeed.list().length,2);assert.ok(reopened.manualFeed.list().every(j=>j.status==='uncertain'));} finally {await reopened.close();}
});
test('live source refresh checks exact product identity, never reuses cached price or infers previous price',async()=>{
 const request=async(url,init)=>{assert.match(JSON.parse(init.body).query,/itemId:1/);return{ok:true,status:200,json:async()=>({data:{productOfferV2:{nodes:[{itemId:1,shopId:10,productName:'Nome atualizado',priceMin:75,priceMax:100,productLink:'https://shopee.com.br/product/10/1',offerLink:'https://s.shopee.com.br/abc',imageUrl:'https://example.com/photo.jpg'}]}}})};};
 const current=await refreshFeedOffer(offers[0],{env:{SHOPEE_APP_ID:'app',SHOPEE_SECRET:'secret'},request});assert.equal(current.price,75);assert.equal(current.previousPrice,undefined);assert.equal(current.title,'Nome atualizado');
 await assert.rejects(()=>refreshFeedOffer(offers[1],{env:{SHOPEE_APP_ID:'app',SHOPEE_SECRET:'secret'},request:async()=>({ok:true,status:200,json:async()=>({data:{productOfferV2:{nodes:[]}}})})}),/indisponível/);
});
test('feed renderer exports portrait JPEG without Story CTA, handles long titles and large prices',async()=>{
 const image=await sharp({create:{width:1200,height:400,channels:3,background:'white'}}).png().toBuffer();
 for(const offer of [{...offers[0],title:('Produto longo <novo> & original ').repeat(8)},{...offers[0],price:7800,previousPrice:9000}]){
  const bytes=await renderFeed(offer,image),meta=await sharp(bytes).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1350);assert.equal(meta.format,'jpeg');
 }
});
test('manual feed shares permanent duplicate reservations with the existing feed publisher',async t=>{
 const f=fixture(t),db=new DatabaseSync(path.join(f.dir,'ig.sqlite'));
 const fingerprint=createHash('sha256').update(`123|${offers[0].productKey}|feed`).digest('hex');
 db.prepare("INSERT INTO ig_publications VALUES(?,?,'published')").run(fingerprint,'existing-scheduled-post');db.close();
 f.service.manualFeed.enqueue([offers[0].id,offers[1].id],false);await f.service.manualFeed.idle();
 assert.equal(f.service.manualFeed.list().find(j=>j.offer_id===offers[0].id).status,'failed');
 assert.equal(f.calls.filter(c=>c.resource==='123/media_publish').length,1);
});
test('explicit retry refreshes a failed preparation but cannot repeat successful jobs',async t=>{
 let fail=true;const f=fixture(t,{refreshOffer:async o=>{if(fail)throw Error('Oferta indisponível.');return o;}});
 f.service.manualFeed.enqueue([offers[0].id],true);await f.service.manualFeed.idle();const job=f.service.manualFeed.list()[0];assert.equal(job.status,'failed');
 fail=false;f.service.manualFeed.retry(job.id);await f.service.manualFeed.idle();assert.equal(f.service.manualFeed.list()[0].status,'preview');assert.equal(f.calls.length,0);
 assert.throws(()=>f.service.manualFeed.retry(job.id),/Somente falhas/);
});
test('manual feed HTTP selection validates IDs, requires same origin/token and keeps dry runs separate',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feed-http-'));
 const server=await startDashboard({port:0,getReport:()=>emptyReport(),instagramOptions:{file:path.join(dir,'db.sqlite'),mediaDir:dir,env:{},getOffers:()=>offers,feedOptions:{refreshOffer:async o=>o,render:async()=>Buffer.from('jpeg'),host:async()=>{throw Error('Unexpected upload');}}}});
 t.after(async()=>{await server.stop();fs.rmSync(dir,{recursive:true,force:true});});
 const url=server.url+'/api/instagram/feed',state=await(await fetch(url)).json();
 assert.deepEqual(state.offerIds,offers.map(o=>o.id));assert.equal(state.liveEnabled,false);
 const post=(body,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:server.url,'X-Control-Token':state.controlToken,...headers},body:JSON.stringify(body)});
 assert.equal((await post({offerIds:[offers[0].id],dryRun:true},{Origin:'https://external.example'})).status,403);
 assert.equal((await post({offerIds:[offers[0].id],dryRun:true},{'X-Control-Token':''})).status,403);
 assert.equal((await post({offerIds:[],dryRun:true})).status,400);
 assert.equal((await post({offerIds:[offers[0].id]})).status,400);
 const first=await(await post({offerIds:[offers[0].id,offers[1].id],dryRun:true})).json();
 const second=await(await post({offerIds:[offers[0].id],dryRun:true})).json();assert.equal(first.jobs[0].id,second.jobs[0].id);
 for(let i=0;i<20;i++){const jobs=(await(await fetch(url)).json()).jobs;if(jobs.every(j=>j.status==='preview'))break;await new Promise(r=>setTimeout(r,5));}
 const final=await(await fetch(url)).json();assert.equal(final.jobs.length,2);assert.ok(final.jobs.every(j=>j.status==='preview'));assert.equal(JSON.stringify(final).includes('INSTAGRAM_ACCESS_TOKEN'),false);
 assert.equal((await fetch(server.url+final.jobs[0].previewUrl)).headers.get('content-type'),'image/jpeg');
});
