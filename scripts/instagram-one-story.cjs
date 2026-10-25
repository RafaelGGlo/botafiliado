'use strict';
// One explicitly requested Story. Persistent reservation prevents duplicate writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseEnv } = require('node:util');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'output/instagram-story');
const statePath = path.join(dir, 'attempt.json');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
async function main() {
 const env = parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8'));
 const version = env.INSTAGRAM_API_VERSION || 'v25.0';
 if (!/^v\d+\.0$/.test(version) || !env.INSTAGRAM_ACCESS_TOKEN) throw Error('Invalid Instagram configuration');
 async function graph(resource, data) {
  const r = await fetch(`https://graph.instagram.com/${version}/${resource}`, {
   method: data ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(25000),
   headers: { Authorization: 'Bearer ' + env.INSTAGRAM_ACCESS_TOKEN, ...(data ? {'Content-Type':'application/x-www-form-urlencoded'} : {}) },
   ...(data ? {body: new URLSearchParams(data)} : {})
  });
  const b = await r.json();
  if (!r.ok || b.error) throw Error(`Meta HTTP ${r.status}; code ${Number(b.error?.code || 0)}; subcode ${Number(b.error?.error_subcode || 0)}`);
  return b;
 }
 const account = await graph('me?fields=id,user_id,username,account_type');
 if (account.username !== 'garimpoo__ofertas' || String(account.user_id) !== '17841454176827517') throw Error('Unexpected account');
 if (process.argv[2] === 'verify') {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (!state.mediaId) throw Error('No published Story ID; inspect existing reservation before retrying');
  const media = await graph(state.mediaId + '?fields=id,media_type,media_product_type,timestamp,permalink');
  console.log(JSON.stringify(media)); return;
 }
 if (process.argv[2] !== 'publish') throw Error('Use publish or verify');
 if (fs.existsSync(statePath)) throw Error('Existing reservation; do not publish again');
 const { shopeeQuery } = await import('../instagram-publish/whatsapp-bot/src/shopee-api.js');
 const data = await shopeeQuery('{ productOfferV2(shopId: 1509818453, itemId: 23298363231, limit: 1) { nodes { productName priceMin priceDiscountRate imageUrl } } }', env, fetch, {maxAttempts:1});
 const product = JSON.parse(fs.readFileSync(path.join(root, 'output/instagram-one-post/product.json'), 'utf8'));
 const fresh = data.productOfferV2?.nodes?.[0];
 if (!fresh || Number(fresh.priceMin) !== 69.9 || Number(fresh.priceDiscountRate) !== 65 || fresh.productName !== product.productName || fresh.imageUrl !== product.imageUrl) throw Error('Offer changed; prepare updated artwork');
 const bytes = await sharp(path.join(dir, 'story-no-link.png')).resize(1080,1920,{fit:'contain',background:'#fffaf4'}).flatten({background:'#fffaf4'}).jpeg({quality:95}).toBuffer();
 fs.writeFileSync(path.join(dir,'story-no-link.jpg'),bytes);
 let cloud=env.CLOUDINARY_CLOUD_NAME,key=env.CLOUDINARY_API_KEY,secret=env.CLOUDINARY_API_SECRET;
 if(env.CLOUDINARY_URL){const u=new URL(env.CLOUDINARY_URL);if(u.protocol!=='cloudinary:')throw Error('Invalid Cloudinary configuration');cloud=u.hostname;key=decodeURIComponent(u.username);secret=decodeURIComponent(u.password);}
 if(!cloud||!key||!secret||!/^[a-zA-Z0-9_-]+$/.test(cloud))throw Error('Missing Cloudinary credentials');
 const publicId='garimpo-story-'+hash(bytes).slice(0,24), timestamp=String(Math.floor(Date.now()/1000));
 const signature=crypto.createHash('sha256').update(`overwrite=false&public_id=${publicId}&timestamp=${timestamp}`+secret).digest('hex');
 const form=new FormData();form.set('file',new Blob([bytes],{type:'image/jpeg'}),'story.jpg');
 for(const [k,v] of Object.entries({api_key:key,timestamp,public_id:publicId,overwrite:'false',signature}))form.set(k,v);
 const uploaded=await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`,{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!uploaded.ok)throw Error('Cloudinary HTTP '+uploaded.status);
 const hosting=await uploaded.json(), url=new URL(hosting.secure_url);
 if(url.protocol!=='https:'||url.hostname!=='res.cloudinary.com')throw Error('Unexpected image host');
 const delivered=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!delivered.ok||hash(Buffer.from(await delivered.arrayBuffer()))!==hash(bytes))throw Error('Image delivery verification failed');
 fs.writeFileSync(path.join(dir,'hosting.json'),JSON.stringify({secureUrl:url.href,imageHash:hash(bytes)},null,2));
 const quota=await graph(account.id+'/content_publishing_limit?fields=quota_usage,config');
 const q=quota.data?.[0];if(!q||!Number.isFinite(q.config?.quota_total)||q.quota_usage>=q.config.quota_total)throw Error('Publishing quota unavailable');
 const state={stage:'reserved',accountId:account.id,imageHash:hash(bytes),at:new Date().toISOString()};
 fs.writeFileSync(statePath,JSON.stringify(state,null,2),{flag:'wx'});
 const save=()=>fs.writeFileSync(statePath,JSON.stringify(state,null,2));
 try {
  state.stage='creating';save();
  const container=await graph(account.id+'/media',{media_type:'STORIES',image_url:url.href});
  if(!/^\d+$/.test(String(container.id)))throw Error('Missing container ID');
  state.containerId=container.id;state.stage='processing';save();
  let ready=false;
  for(let i=0;i<12;i++){
   const status=await graph(container.id+'?fields=status_code');
   if(status.status_code==='FINISHED'){ready=true;break;}
   if(['ERROR','EXPIRED','PUBLISHED'].includes(status.status_code))throw Error('Container status '+status.status_code);
   await new Promise(r=>setTimeout(r,5000));
  }
  if(!ready)throw Error('Container not ready; retain reservation');
  state.stage='publishing';save();
  const published=await graph(account.id+'/media_publish',{creation_id:container.id});
  if(!/^\d+$/.test(String(published.id)))throw Error('Missing Story ID');
  state.mediaId=published.id;state.stage='published';save();
  const media=await graph(published.id+'?fields=id,media_type,media_product_type,timestamp,permalink');
  state.verification=media;state.verifiedAt=new Date().toISOString();save();
  if(media.media_product_type!=='STORY')throw Error('Unexpected media product type');
  console.log('[SUCCESS] Story published and verified: '+published.id);
  if(typeof media.permalink==='string'&&/^https:\/\/(www\.)?instagram\.com\//.test(media.permalink))console.log(media.permalink);
 } catch(e){state.needsReconciliation=true;save();throw e;}
}
main().catch(e=>{const safe=/^(Meta HTTP|Invalid |Unexpected |Use |Existing |Offer changed|Missing |Cloudinary HTTP|Image delivery|Publishing quota|Container |No published)/.test(e.message);console.error('[ERROR] '+(safe?e.message:'Operation failed; check local state before any retry'));process.exitCode=1;});
