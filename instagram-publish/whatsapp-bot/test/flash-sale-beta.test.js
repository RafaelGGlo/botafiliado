import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createFlashSaleBeta,classifyFlashSale} from '../src/flash-sale-beta.js';
import {formatDeal} from '../src/format.js';
import {startDashboard} from '../src/dashboard-server.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const time=Date.parse('2026-10-15T03:00:00Z');
const offer={id:'shopee:10:20',title:'Produto real',price:38.55,affiliateUrl:'https://s.shopee.com.br/test',imageUrl:'https://example.com/product.jpg'};
const evidence={kind:'FLASH_SALE',confirmed:true,promotionId:'100',shopId:'10',itemId:'20',startAt:time,endAt:time+3600000};
function fixture(t,patch={}){const db=new DatabaseSync(':memory:');t.after(()=>db.close());let clock=time,calls=0;const service=createFlashSaleBeta({db,getOffers:()=>[offer],now:()=>clock,source:{name:'Test fixture — not a live source',permitted:true,confirmsProductMembership:true,fetch:async()=>{calls++;return [evidence];}},priceRefresh:async o=>({...o,price:37}),...patch});return{service,db,calls:()=>calls,advance:ms=>clock+=ms};}
test('scheduled, active and expired use UTC boundaries with exact product evidence',()=>{
 assert.equal(classifyFlashSale(offer,evidence,time-1).status,'SCHEDULED');assert.equal(classifyFlashSale(offer,evidence,time).status,'ACTIVE');assert.equal(classifyFlashSale(offer,evidence,time+3600000).status,'EXPIRED');
 assert.equal(classifyFlashSale(offer,{...evidence,startAt:'2026-10-15T00:00:00-03:00',endAt:'2026-10-15T01:00:00-03:00'},time).status,'ACTIVE');
 for(const wrong of [{...evidence,shopId:'11'},{...evidence,itemId:'21'},{...evidence,startAt:undefined},{...evidence,confirmed:false},{discountRate:90,periodStartTime:time,periodEndTime:time+3600000}])assert.equal(classifyFlashSale(offer,wrong,time).status,'UNVERIFIED');
});
test('variation-specific evidence never leaks to another variation or unspecified product',()=>{
 assert.equal(classifyFlashSale(offer,{...evidence,modelId:'5'},time).status,'UNVERIFIED');
 assert.equal(classifyFlashSale({...offer,modelId:'6'},{...evidence,modelId:'5'},time).status,'UNVERIFIED');
 assert.equal(classifyFlashSale({...offer,modelId:'5'},{...evidence,modelId:'5'},time).status,'ACTIVE');
});
test('disabled by default, toggle survives service recreation and disabled checks do no work',async t=>{
 const f=fixture(t);assert.equal(f.service.status().enabled,false);await assert.rejects(()=>f.service.test([offer.id]),/Ative/);assert.equal(f.calls(),0);
 f.service.configure(true);const reopened=createFlashSaleBeta({db:f.db,getOffers:()=>[offer],now:()=>time});assert.equal(reopened.status().enabled,true);reopened.configure(false);assert.equal(f.service.status().enabled,false);
});
test('cache avoids repeated source calls, ACTIVE expires safely, and testing never changes captions',async t=>{
 const f=fixture(t);f.service.configure(true);const before=formatDeal(offer,offer.affiliateUrl);
 const first=await f.service.test([offer.id]);assert.equal(first.results[0].status,'ACTIVE');assert.equal(first.results[0].currentPrice,37);assert.equal(first.results[0].publishLabel,false);assert.equal(first.publicationLabelsEnabled,false);
 await f.service.test([offer.id]);assert.equal(f.calls(),1);assert.equal(formatDeal({...offer,flashSale:first.results[0]},offer.affiliateUrl),before);
 f.advance(60001);assert.equal(f.service.status().results[0].status,'UNVERIFIED');await f.service.test([offer.id]);assert.equal(f.calls(),2);
});
test('unavailable or forbidden sources stay UNVERIFIED without retrying restrictions or leaking errors',async t=>{
 let calls=0;const f=fixture(t,{source:{name:'restricted source',permitted:true,confirmsProductMembership:true,fetch:async()=>{calls++;throw Object.assign(Error('private secret'),{status:403,retryable:true});}}});f.service.configure(true);const result=await f.service.test([offer.id]);assert.equal(result.results[0].status,'UNVERIFIED');assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes('private secret'));
 const noSource=fixture(t,{source:null});noSource.service.configure(true);assert.equal((await noSource.service.test([offer.id])).results[0].status,'UNVERIFIED');assert.equal(noSource.calls(),0);
});
test('transient failures retry once; active price revalidation failures downgrade to UNVERIFIED',async t=>{
 let attempts=0;const f=fixture(t,{sleep:async()=>{},source:{name:'fixture',permitted:true,confirmsProductMembership:true,fetch:async()=>{if(++attempts===1)throw Object.assign(Error(),{retryable:true});return[evidence];}},priceRefresh:async()=>{throw Error('source unavailable');}});f.service.configure(true);assert.equal((await f.service.test([offer.id])).results[0].status,'UNVERIFIED');assert.equal(attempts,2);
});
test('uncached tests are rate-limited, and mismatched product remains UNVERIFIED',async t=>{
 const f=fixture(t,{cacheMs:1,source:{name:'fixture',permitted:true,confirmsProductMembership:true,fetch:async()=>[{...evidence,itemId:999}]}});f.service.configure(true);assert.equal((await f.service.test([offer.id])).results[0].status,'UNVERIFIED');f.advance(2);await assert.rejects(()=>f.service.test([offer.id]),/60 segundos/);
});
test('dashboard BETA API persists OFF/ON, rejects external writes, and never creates publications',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flash-http-'));const server=await startDashboard({port:0,getReport:()=>({}),instagramOptions:{file:path.join(dir,'db.sqlite'),mediaDir:dir,env:{},getOffers:()=>[offer],request:async()=>{throw Error('No network allowed');}}});t.after(async()=>{await server.stop();fs.rmSync(dir,{recursive:true,force:true});});
 const base=server.url+'/api/instagram/flash-sale',initial=await(await fetch(base)).json();assert.equal(initial.enabled,false);
 const post=(route,data,origin=server.url)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Control-Token':initial.controlToken},body:JSON.stringify(data)});
 assert.equal((await post('/test',{offerIds:[offer.id]})).status,400);assert.equal((await post('/settings',{enabled:true},'https://external.example')).status,403);
 assert.equal((await post('/settings',{enabled:true})).status,200);const result=await(await post('/test',{offerIds:[offer.id]})).json();assert.equal(result.results[0].status,'UNVERIFIED');
 const ig=await(await fetch(server.url+'/api/instagram')).json();assert.equal(ig.posts.length,0);assert.equal((await(await fetch(server.url+'/api/instagram/feed')).json()).jobs.length,0);
 assert.equal((await post('/settings',{enabled:false})).status,200);assert.equal((await post('/test',{offerIds:[offer.id]})).status,400);
});
