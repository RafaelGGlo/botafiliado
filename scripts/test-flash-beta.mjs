// Isolated fallback test against an actual catalog product. Does not publish.
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
process.env.INSTAGRAM_PROJECT_ROOT=fileURLToPath(new URL('../',import.meta.url));
const {readInstagramOffers}=await import('../instagram-publish/whatsapp-bot/src/instagram-catalog.js');
const {createFlashSaleBeta}=await import('../instagram-publish/whatsapp-bot/src/flash-sale-beta.js');
const offers=readInstagramOffers().filter(o=>!o.testOnly&&/^shopee:\d+:\d+$/.test(o.id));
if(!offers.length)throw Error('Nenhum produto real disponível no catálogo.');
const db=new DatabaseSync(':memory:');
try{
 const beta=createFlashSaleBeta({db,getOffers:()=>offers});beta.configure(true);
 const result=await beta.test([offers[0].id]);
 fs.mkdirSync(new URL('../output/flash-sale/',import.meta.url),{recursive:true});
 fs.writeFileSync(new URL('../output/flash-sale/beta-test-result.json',import.meta.url),JSON.stringify(result,null,2));
 console.log(JSON.stringify({product:result.results[0].title,status:result.results[0].status,source:result.results[0].source,testOnly:result.testOnly,published:false},null,2));
}finally{db.close();}
