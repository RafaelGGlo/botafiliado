import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EvolutionClient } from '../src/evolution.js';
import { WhatsAppQueue } from '../src/whatsapp-queue.js';
import { SentStore } from '../src/store.js';
import { startDashboard } from '../src/dashboard-server.js';
const group = '123@g.us';
const env = { EVOLUTION_API_KEY: 'secret-test', EVOLUTION_INSTANCE: 'ofertas' };
test('Evolution verifies release, creates missing instance and sends media with exact affiliate caption', async () => {
 const calls = []; let missing = true;
 const api = new EvolutionClient({ env, request: async (url, options) => {
  calls.push({ url: String(url), ...options });
  if (url.pathname === '/') return Response.json({ version: '2.3.7' });
  if (url.pathname.includes('connectionState') && missing) { missing = false; return Response.json({}, { status: 404 }); }
  if (url.pathname.includes('sendMedia')) return Response.json({ key: { id: 'message-1' } });
  return Response.json({ base64: 'data:image/png;base64,AAAA' });
 } });
 await api.connect();
 const caption = 'Oferta R$ 10 https://meli.la/afiliado';
 await api.sendMessage(group, { image: Buffer.from([255,216,255]), caption });
 assert.equal(JSON.parse(calls.at(-1).body).caption, caption);
 assert.equal(JSON.parse(calls.at(-1).body).number, group);
 assert.equal(calls.at(-1).headers.apikey, 'secret-test');
 assert.equal(calls.find(c => c.url.endsWith('/instance/create')).method, 'POST');
});
test('incompatible versions and upstream errors are blocked without leaking response secrets', async () => {
 const api = new EvolutionClient({ env, request: async () => Response.json({ version: '2.1.1' }) });
 await assert.rejects(api.verify(), { code: 'EVOLUTION_VERSION' });
 api.request = async () => Response.json({ secret: 'do-not-expose' }, { status: 401 });
 await assert.rejects(api.state(), error => error.code === 'EVOLUTION_HTTP_401' && !error.message.includes('do-not-expose'));
});
test('queue persists multi-group jobs, deduplicates and recovers interrupted sends without retry', async t => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolution-queue-'));
 t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
 const store = new SentStore(path.join(dir,'sent.json'), 10000);
 const file = path.join(dir,'queue.json');
 const queue = new WhatsAppQueue(file, { store, ttlMs: 10000 });
 const deal = { id: 'ml-1', title: 'Produto' };
 queue.enqueue(deal, Buffer.from('image'), 'caption', [group, '456@g.us']);
 queue.enqueue(deal, Buffer.from('image'), 'caption', [group]);
 assert.equal(queue.jobs.length, 2);
 let sends = 0;
 await queue.drain({ canSend: () => true, selected: () => [group], deliver: async job => { sends++; store.markDealAsSent(job.deal.id, job.group); return { type: 'sent' }; } });
 assert.equal(sends, 1); assert.deepEqual(queue.jobs.map(j => j.state), ['sent','cancelled']);
 queue.jobs[0].state = 'sending'; queue.save();
 const restored = new WhatsAppQueue(file, { store, ttlMs: 10000 });
 assert.equal(restored.jobs[0].state, 'uncertain');
 await restored.drain({ canSend: () => true, selected: () => [group], deliver: async () => { sends++; } });
 assert.equal(sends, 1);
 assert.equal('image' in restored.history()[0], false);
});
test('queued work waits while paused and failures remain uncertain', async t => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolution-paused-'));
 t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
 const queue = new WhatsAppQueue(path.join(dir,'queue.json'), { store: { isDealSentToGroup: () => false }, ttlMs: 10000 });
 queue.enqueue({ id:'one' },Buffer.from('image'),'caption',[group]);
 const options = { selected: () => [group], deliver: async () => ({ type:'send_failed',reason:'SEND_TIMEOUT' }) };
 await queue.drain({ ...options, canSend: () => false }); assert.equal(queue.jobs[0].state,'queued');
 await queue.drain({ ...options, canSend: () => true }); assert.equal(queue.jobs[0].state,'uncertain');
});
test('panel protects QR and group mutations with origin and token and serves the new UI', async t => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolution-panel-'));
 let connects = 0;
 const server = await startDashboard({ port: 0, getReport: () => ({}),
  instagramOptions: { file: ':memory:', mediaDir: dir, env: {} },
  whatsapp: { status: () => ({ provider:'evolution',online:false,selected:[],history:[] }),
   connect: async () => { connects++; return { base64:'data:image/png;base64,AAAA' }; },
   groups: async () => [{ id:group,name:'Grupo' }], select: async ids => ({ selected:ids }) } });
 t.after(async () => { await server.stop(); fs.rmSync(dir,{ recursive:true,force:true }); });
 assert.equal((await fetch(server.url+'/whatsapp.js')).status,200);
 assert.match(await (await fetch(server.url)).text(), /whatsapp.js/);
 const { controlToken } = await (await fetch(server.url+'/api/whatsapp')).json();
 assert.equal((await fetch(server.url+'/api/whatsapp/connect',{method:'POST',body:'{}'})).status,403);
 assert.equal(connects,0);
 const result = await fetch(server.url+'/api/whatsapp/connect',{method:'POST',headers:{Origin:server.url,'X-Control-Token':controlToken},body:'{}'});
 assert.equal(result.status,200); assert.equal(connects,1);
 const groups = await (await fetch(server.url+'/api/whatsapp/groups')).json(); assert.equal(groups.groups[0].id,group);
});
