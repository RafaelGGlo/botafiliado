import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env={...process.env,...parseEnv(fs.readFileSync(path.join(root,'whatsapp-bot/.env'),'utf8')),INSTAGRAM_PROJECT_ROOT:root};
process.env.INSTAGRAM_PROJECT_ROOT=root;
const {readInstagramOffers}=await import('../instagram-publish/whatsapp-bot/src/instagram-catalog.js');
const {createInstagram}=await import('../instagram-publish/whatsapp-bot/src/instagram.js');
const offers=readInstagramOffers().filter(o=>!o.testOnly&&o.affiliateUrl);
const first=offers.find(o=>/power bank/i.test(o.title))||offers[0];
const selected=[first,[...offers].filter(o=>o.id!==first?.id).sort((a,b)=>b.title.length-a.title.length)[0]].filter(Boolean);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manual-feed-preview-')),output=path.join(root,'output/instagram-feed');fs.mkdirSync(output,{recursive:true});
const service=createInstagram({file:path.join(dir,'preview.sqlite'),mediaDir:dir,env,getOffers:()=>offers,feedOptions:{host:async()=>{throw Error('Dry run attempted an upload');},graph:async()=>{throw Error('Dry run attempted a publication');}}});
try{
 service.manualFeed.enqueue(selected.map(o=>o.id),true);await service.manualFeed.idle();
 const jobs=service.manualFeed.list();
 for(const job of jobs){if(job.status!=='preview')throw Error(`${job.offer_id}: ${job.error}`);const name=job.offer_id===selected[0].id?'feed.jpg':'feed-long-title.jpg';job.previewFile=name;fs.writeFileSync(path.join(output,name),service.manualFeed.image(job.id));console.log(`${name}: ${job.snapshot.title} — R$ ${job.snapshot.price}`);}
 fs.writeFileSync(path.join(output,'dry-run-results.json'),JSON.stringify(jobs,null,2));
 console.log('Prévia local: dados atualizados na fonte; nenhum upload ou publicação.');
}finally{await service.close();fs.rmSync(dir,{recursive:true,force:true});}
