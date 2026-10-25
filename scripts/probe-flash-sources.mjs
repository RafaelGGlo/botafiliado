// Read-only capability probe. Never sends Affiliate credentials to storefront endpoints.
import fs from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {shopeeQuery} from '../instagram-publish/whatsapp-bot/src/shopee-api.js';
const env={...process.env,...parseEnv(await fs.readFile(new URL('../whatsapp-bot/.env',import.meta.url),'utf8'))};
const report={checkedAt:new Date().toISOString(),sources:[]};
try {
 const schema=await shopeeQuery('{ __schema { types { name fields { name } } } }',env,fetch,{maxAttempts:1});
 const types=schema.__schema?.types||[];
 report.sources.push({source:'Shopee Affiliate API (introspection)',accessible:types.length>0,flashTypes:types.filter(t=>/flash/i.test(t.name)),productTypes:types.filter(t=>/productoffer/i.test(t.name)),confirmedProductFlashSource:false});
}catch(error){report.sources.push({source:'Shopee Affiliate API (introspection)',accessible:false,error:error.code||'UNAVAILABLE',confirmedProductFlashSource:false});}
try {
 const response=await fetch('https://shopee.com.br/api/v2/flash_sale/flash_sale_get_items',{signal:AbortSignal.timeout(12000),redirect:'error'});
 const contentType=response.headers.get('content-type')||'';
 let body=null;if(response.ok&&contentType.includes('json'))body=await response.json();
 report.sources.push({source:'/api/v2/flash_sale/flash_sale_get_items',httpStatus:response.status,contentType,accessible:response.ok,confirmedProductFlashSource:false,result:response.ok?'Response requires documented parameters and verified schema; not used as evidence.':'Access denied or unavailable; no bypass attempted.',jsonKeys:body?Object.keys(body):[]});
}catch{report.sources.push({source:'/api/v2/flash_sale/flash_sale_get_items',accessible:false,error:'UNAVAILABLE_OR_REDIRECT',confirmedProductFlashSource:false});}
await fs.mkdir(new URL('../output/flash-sale/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../output/flash-sale/source-probe.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
