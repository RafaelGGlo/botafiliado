import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { instagramProductKey } from './instagram-catalog.js';
import { refreshFeedOffer } from './feed-refresh.js';
import { renderFeed } from './feed-image.js';
import { hostInstagramImage } from './instagram-host.js';
import { storyPrices } from './story-template.js';

export function feedCaption(offer) {
 return `${String(offer.title).slice(0,300)}\n${offer.fromPrice?'A partir de ':''}${storyPrices(offer).current}\n\n${offer.affiliateUrl}\n\nOferta de afiliado. Preço e disponibilidade podem mudar.`;
}
export function createManualFeed({db,mediaDir,env,getOffers,graph,canPublish,now=Date.now,request=fetch,refreshOffer=offer=>refreshFeedOffer(offer,{env,request,now}),render=renderFeed,host=bytes=>hostInstagramImage(bytes,env,request),sleep=ms=>new Promise(r=>setTimeout(r,ms))}) {
 db.exec(`CREATE TABLE IF NOT EXISTS ig_feed_jobs(id TEXT PRIMARY KEY,offer_id TEXT NOT NULL,product_key TEXT NOT NULL,dry_run INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,published_at TEXT,snapshot TEXT,caption TEXT,media TEXT,container_id TEXT,media_id TEXT,permalink TEXT,error TEXT,attempted INTEGER NOT NULL DEFAULT 0,UNIQUE(product_key,dry_run));`);
 db.exec("UPDATE ig_feed_jobs SET status=CASE WHEN attempted=1 THEN 'uncertain' ELSE 'failed' END,error='Processo interrompido; confira o resultado antes de tentar novamente.' WHERE status IN ('preparing','rendering','publishing')");
 let worker=null,closed=false;
 const get=id=>db.prepare('SELECT * FROM ig_feed_jobs WHERE id=?').get(id);
 const publicJob=p=>({...p,dry_run:Boolean(p.dry_run),snapshot:p.snapshot?JSON.parse(p.snapshot):null,previewUrl:p.media?`/api/instagram/feed/jobs/${p.id}/image`:null});
 const list=()=>db.prepare('SELECT * FROM ig_feed_jobs ORDER BY created_at DESC').all().map(publicJob);
 const update=(id,patch)=>{patch.updated_at=new Date(now()).toISOString();db.prepare(`UPDATE ig_feed_jobs SET ${Object.keys(patch).map(k=>k+'=?').join(',')} WHERE id=?`).run(...Object.values(patch),id);};
 async function processJob(job) {
  let reserved=false;
  try {
   update(job.id,{status:'preparing',error:null});
   const selected=getOffers().find(o=>o.id===job.offer_id);
   if(!selected) throw Error('Oferta não está mais disponível no catálogo.');
   const offer=await refreshOffer(selected);
   if(instagramProductKey(offer)!==job.product_key||offer.testOnly||offer.active===false||(offer.expiresAt&&(!Number.isFinite(Date.parse(offer.expiresAt))||Date.parse(offer.expiresAt)<=now()))) throw Error('Oferta expirada, inválida ou diferente do produto selecionado.');
   storyPrices(offer);
   if(!offer.title?.trim()||!offer.imageUrl||!/^https:\/\//.test(offer.affiliateUrl||'')) throw Error('Oferta sem título, foto ou link válido.');
   update(job.id,{status:'rendering',snapshot:JSON.stringify(offer),caption:feedCaption(offer)});
   const bytes=await render(offer),media='feed-'+job.id+'.jpg';
   fs.writeFileSync(path.join(mediaDir,media),bytes,{mode:0o600});update(job.id,{media});
   if(job.dry_run) {update(job.id,{status:'preview'});return;}
   if(!canPublish()) throw Error('Publicação manual bloqueada. Confira as credenciais Instagram e o modo de publicação do servidor.');
   const imageUrl=await host(bytes);
   const fingerprint=createHash('sha256').update(`${env.INSTAGRAM_ACCOUNT_ID}|${job.product_key}|feed`).digest('hex');
   db.exec('BEGIN IMMEDIATE');
   try {db.prepare("INSERT INTO ig_publications VALUES(?,?,'reserved')").run(fingerprint,job.id);update(job.id,{status:'publishing',attempted:1});db.exec('COMMIT');reserved=true;}
   catch {db.exec('ROLLBACK');throw Error('Produto já reservado ou publicado no feed. Duplicata bloqueada.');}
   const container=await graph(env.INSTAGRAM_ACCOUNT_ID+'/media','POST',{image_url:imageUrl,caption:feedCaption(offer)});
   if(!/^\d+$/.test(String(container.id))) throw Error('Resposta de criação sem confirmação.');
   update(job.id,{container_id:String(container.id)});
   let ready;
   for(let i=0;i<10;i++){ready=await graph(container.id+'?fields=status_code');if(ready.status_code!=='IN_PROGRESS')break;await sleep(2000);}
   if(ready?.status_code!=='FINISHED') throw Error('Container não confirmado como pronto.');
   const result=await graph(env.INSTAGRAM_ACCOUNT_ID+'/media_publish','POST',{creation_id:container.id});
   if(!/^\d+$/.test(String(result.id))) throw Error('Publicação sem confirmação.');
   update(job.id,{status:'published',media_id:String(result.id),published_at:new Date(now()).toISOString(),error:null});
   db.prepare("UPDATE ig_publications SET state='published' WHERE fingerprint=?").run(fingerprint);
   try {const info=await graph(result.id+'?fields=permalink');const url=new URL(info.permalink);if(url.protocol==='https:'&&['instagram.com','www.instagram.com'].includes(url.hostname))update(job.id,{permalink:url.href});} catch { /* Published media ID remains authoritative. */ }
  } catch(error) {
   // Network/API exceptions can contain credentials: expose only our known local messages.
   const safe=/^(Oferta|Esta fonte|Não foi possível atualizar|A fonte|Publicação manual bloqueada|Produto já reservado)/.test(error.message)?error.message:'Falha ao preparar a imagem ou acessar a integração. Confira a configuração.';
   update(job.id,{status:reserved?'uncertain':'failed',error:reserved?'Resultado incerto. Não reenviar: confira a conta e o container antes de reconciliar.':safe});
  }
 }
 function kick(){if(worker||closed)return;worker=(async()=>{while(!closed){const job=db.prepare("SELECT * FROM ig_feed_jobs WHERE status='queued' ORDER BY created_at LIMIT 1").get();if(!job)break;await processJob(job);}})().finally(()=>{worker=null;if(!closed&&db.prepare("SELECT 1 FROM ig_feed_jobs WHERE status='queued' LIMIT 1").get())kick();});}
 function enqueue(ids,dryRun) {
  if(!Array.isArray(ids)||!ids.length||ids.length>30||ids.some(id=>typeof id!=='string')||typeof dryRun!=='boolean') throw Error('Selecione de 1 a 30 produtos e informe o modo de prévia.');
  const offers=getOffers(),results=[];
  for(const id of [...new Set(ids)]) {
   const offer=offers.find(o=>o.id===id);
   if(!offer){results.push({offer_id:id,status:'failed',error:'Oferta não encontrada no catálogo.'});continue;}
   const key=instagramProductKey(offer),existing=db.prepare('SELECT * FROM ig_feed_jobs WHERE product_key=? AND dry_run=?').get(key,Number(dryRun));
   if(existing){results.push(publicJob(existing));continue;}
   const jobId=randomUUID(),at=new Date(now()).toISOString();
   db.prepare("INSERT INTO ig_feed_jobs(id,offer_id,product_key,dry_run,status,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?)").run(jobId,id,key,Number(dryRun),at,at);results.push(publicJob(get(jobId)));
  }
  kick();return results;
 }
 kick();
 function retry(id){const result=db.prepare("UPDATE ig_feed_jobs SET status='queued',error=NULL,updated_at=? WHERE id=? AND status='failed' AND attempted=0").run(new Date(now()).toISOString(),id);if(!result.changes)throw Error('Somente falhas anteriores à tentativa de publicação podem ser repetidas.');kick();return publicJob(get(id));}
 return {list,enqueue,retry,offerIds:()=>getOffers().map(o=>o.id),enabled:canPublish,async idle(){while(worker)await worker;},image(id){const p=get(id);if(!p?.media)throw Error('Prévia não disponível.');return fs.readFileSync(path.join(mediaDir,p.media));},async close(){closed=true;if(worker)await worker;}};
}
