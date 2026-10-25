import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { createCommentReplies, wantsLink, validWebhookSignature, privateReplyText } from '../src/instagram-comment-replies.js';
const now=Date.parse('2026-10-13T15:00:00Z');
const env={INSTAGRAM_COMMENT_DM_ENABLED:'true',INSTAGRAM_APP_SECRET:'test-secret',INSTAGRAM_WEBHOOK_VERIFY_TOKEN:'verify-test',INSTAGRAM_ACCESS_TOKEN:'test-token',INSTAGRAM_ACCOUNT_ID:'123',INSTAGRAM_API_VERSION:'v25.0',INSTAGRAM_LOGIN_TYPE:'instagram',INSTAGRAM_LIVE_APPROVED:'true',INSTAGRAM_TEST_MODE:'false'};
const payload=(value={})=>({object:'instagram',entry:[{id:'123',changes:[{field:'comments',value:{id:'456',text:'QUERO!',media:{id:'789'},from:{id:'999'},...value}}]}]});
const bytes=p=>Buffer.from(JSON.stringify(p));
const signature=b=>'sha256='+createHmac('sha256',env.INSTAGRAM_APP_SECRET).update(b).digest('hex');
function fixture(t,options={}) {
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE ig_posts (published_id TEXT,status TEXT,format TEXT,snapshot TEXT)');
 db.prepare('INSERT INTO ig_posts VALUES(?,?,?,?)').run('789','published','feed',JSON.stringify({affiliateUrl:'https://s.shopee.com.br/abc',...options.offer}));
 const calls=[],localEnv={...env,...options.env};
 const replies=createCommentReplies({db,env:localEnv,now:()=>now,graph:async(...args)=>{
  calls.push(args);
  if(options.failure) throw Error('remote secret');
  return args[1]==='POST' ? {message_id:'aWdfZ-message-id'} : {id:'456',text:'quero',media:{id:'789'},timestamp:new Date(now-1000).toISOString(),...options.comment};
 }});
 t.after(async()=>{await replies.close();db.close();});
 return {db,replies,calls,enqueue(p=payload()){const b=bytes(p);return replies.receive(b,signature(b));}};
}
test('matches explicit QUERO requests and verifies signature on raw bytes',()=>{
 for(const text of ['QUERO','quero!',' Quero. ','qquero','QQUERO!','qqquero','"QUERO"',"'QUERO"]) assert.equal(wantsLink(text),true);
 for(const text of ['nao quero','quero saber','qualquer','QUERO outro',null]) assert.equal(wantsLink(text),false);
 const b=bytes(payload());assert.equal(validWebhookSignature(b,signature(b),env.INSTAGRAM_APP_SECRET),true);
 assert.equal(validWebhookSignature(Buffer.concat([b,Buffer.from(' ')]),signature(b),env.INSTAGRAM_APP_SECRET),false);
 assert.equal(validWebhookSignature(b,'bad',env.INSTAGRAM_APP_SECRET),false);
});
test('webhook verification, account isolation and invalid signatures never enqueue',t=>{
 const f=fixture(t);
 assert.equal(f.replies.challenge(new URLSearchParams({'hub.mode':'subscribe','hub.verify_token':'verify-test','hub.challenge':'1234'})),'1234');
 assert.equal(f.replies.challenge(new URLSearchParams({'hub.mode':'subscribe','hub.verify_token':'wrong'})),null);
 assert.equal(f.replies.receive(bytes(payload()),'bad').code,403);
 const p=payload();p.entry[0].id='other';assert.equal(f.enqueue(p).code,200);
 for(const v of [{text:'nao quero'},{media:{id:'888'}},{from:{id:'123'}},{parent_id:'111'}]) assert.equal(f.enqueue(payload(v)).code,200);
 assert.equal(f.db.prepare('SELECT count(*) n FROM ig_comment_replies').get().n,0);
});
test('sends one private reply for the exact published product and deduplicates replay',async t=>{
 const f=fixture(t);assert.equal(f.enqueue().code,200);assert.equal(f.enqueue().code,200);
 await Promise.all([f.replies.processNext(),f.replies.processNext()]);await f.replies.processNext();
 assert.equal(f.calls.length,2);assert.equal(f.calls[0][0],'456?fields=id,text,timestamp,media');
 assert.deepEqual(f.calls[1][2].recipient,{comment_id:'456'});assert.ok(f.calls[1][2].message.text.endsWith('https://s.shopee.com.br/abc'));
 assert.equal(f.db.prepare('SELECT state FROM ig_comment_replies').get().state,'sent');
});
test('disabled, test mode and unsupported login produce zero calls',async t=>{
 for(const patch of [{INSTAGRAM_COMMENT_DM_ENABLED:'false'},{INSTAGRAM_TEST_MODE:'true'},{INSTAGRAM_LIVE_APPROVED:'false'},{INSTAGRAM_LOGIN_TYPE:'facebook'},{INSTAGRAM_APP_SECRET:''}]) {
  const f=fixture(t,{env:patch});f.enqueue();await f.replies.processNext();assert.equal(f.calls.length,0);
 }
});
test('old, edited, foreign and missing timestamp comments cannot receive a DM',async t=>{
 for(const comment of [{timestamp:new Date(now-7*86400000).toISOString()},{timestamp:undefined},{timestamp:new Date(now+1000).toISOString()},{text:'nao quero'},{media:{id:'888'}}]) {
  const f=fixture(t,{comment});f.enqueue();await f.replies.processNext();assert.equal(f.calls.length,1);assert.equal(f.db.prepare('SELECT state FROM ig_comment_replies').get().state,'skipped');
 }
});
test('expired, test or invalid-link offers never call Meta',async t=>{
 for(const offer of [{expiresAt:new Date(now-1).toISOString()},{testOnly:true},{affiliateUrl:'https://evil.com'}]) {
  const f=fixture(t,{offer});f.enqueue();await f.replies.processNext();assert.equal(f.calls.length,0);
 }
});
test('uncertain sends stay reserved without automatic retries across worker recreation',async t=>{
 const f=fixture(t,{failure:true});f.enqueue();await f.replies.processNext();await f.replies.processNext();assert.equal(f.calls.length,1);
 assert.equal(f.db.prepare('SELECT state FROM ig_comment_replies').get().state,'uncertain');
 await f.replies.close();const worker=createCommentReplies({db:f.db,env,now:()=>now,graph:async()=>{throw Error('No retry allowed');}});
 await worker.processNext();await worker.close();
});

 test('repeated q is accepted both in webhook and current Meta comment',async t=>{
  const f=fixture(t,{comment:{text:'qquero!'}});f.enqueue(payload({text:'QQUERO'}));await f.replies.processNext();
  assert.equal(f.calls.length,2);assert.equal(f.db.prepare('SELECT state FROM ig_comment_replies').get().state,'sent');
 });
 test('status explains missing setup without exposing secrets',t=>{
  const f=fixture(t,{env:{INSTAGRAM_COMMENT_DM_ENABLED:'false',INSTAGRAM_APP_SECRET:'',INSTAGRAM_WEBHOOK_VERIFY_TOKEN:''}});
  const state=f.replies.status();assert.equal(state.live,false);
  assert.deepEqual(state.blockers,['feature_disabled','app_secret_missing','verify_token_missing']);
  assert.ok(!JSON.stringify(state).includes('test-token'));
 });

 test('private reply combines requested product and optional group invitation in one message',async t=>{
  const group='https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv';
  const f=fixture(t,{env:{INSTAGRAM_DM_GROUP_URL:group}});f.enqueue();await f.replies.processNext();
  const posts=f.calls.filter(c=>c[1]==='POST');assert.equal(posts.length,1);
  const text=posts[0][2].message.text;assert.ok(text.includes('https://s.shopee.com.br/abc'));assert.ok(text.includes(group));assert.ok(text.includes('Quer receber mais ofertas?'));
  assert.ok(!privateReplyText('https://s.shopee.com.br/abc').includes('grupo'));
  for(const invalid of ['http://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv','https://evil.com/invite','https://chat.whatsapp.com.evil.com/AbCdEfGhIjKlMnOpQrStUv']) assert.throws(()=>privateReplyText('https://s.shopee.com.br/abc',invalid));
 });
 test('invalid configured group invite prevents sending incorrect links',async t=>{
  const f=fixture(t,{env:{INSTAGRAM_DM_GROUP_URL:'https://evil.com'}});f.enqueue();await f.replies.processNext();assert.equal(f.calls.length,0);
 });
