import {instagramProductKey} from './instagram-catalog.js';
import {refreshFeedOffer} from './feed-refresh.js';
const timestamp=value=>typeof value==='number'&&Number.isFinite(value)?(value<1e12?value*1000:value):typeof value==='string'&&/Z$|[+-]\d\d:\d\d$/.test(value)?Date.parse(value):NaN;
export function classifyFlashSale(offer,evidence,now=Date.now()) {
 const base={status:'UNVERIFIED',startAt:null,endAt:null,promotionId:null,error:'Evidência insuficiente para confirmar oferta relâmpago.'};
 const match=/^shopee:(\d+):(\d+)$/.exec(instagramProductKey(offer)||'');
 if(!match||evidence?.kind!=='FLASH_SALE'||evidence.confirmed!==true||!evidence.promotionId)return base;
 if(String(evidence.shopId)!==match[1]||String(evidence.itemId)!==match[2])return {...base,error:'Promoção não corresponde ao shopId + itemId selecionado.'};
 if((offer.modelId!=null&&String(offer.modelId)!==String(evidence.modelId))||(offer.modelId==null&&evidence.modelId!=null&&evidence.allVariations!==true))return {...base,error:'A promoção não confirma a variação selecionada.'};
 const start=timestamp(evidence.startAt),end=timestamp(evidence.endAt);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return {...base,error:'Janela da promoção ausente ou inválida.'};
 return {status:now<start?'SCHEDULED':now>=end?'EXPIRED':'ACTIVE',startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),promotionId:String(evidence.promotionId),error:null};
}

// No production source is installed: Affiliate schema lacks membership evidence and
// storefront probe returned 403. Only a reviewed, permitted adapter may replace null.
// This service is deliberately NOT imported by any publisher or message formatter.
export function createFlashSaleBeta({db,getOffers,now=Date.now,source=null,priceRefresh=refreshFeedOffer,cacheMs=60000,rateLimitMs=60000,sleep=ms=>new Promise(r=>setTimeout(r,ms))}) {
 db.exec(`CREATE TABLE IF NOT EXISTS flash_beta_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 0,last_attempt INTEGER);
 INSERT OR IGNORE INTO flash_beta_settings(id) VALUES(1);
 CREATE TABLE IF NOT EXISTS flash_beta_results(product_key TEXT PRIMARY KEY,offer_id TEXT NOT NULL,title TEXT NOT NULL,result TEXT NOT NULL,checked_at INTEGER NOT NULL);`);
 let busy=false,generation=0;
 const cacheKey=o=>instagramProductKey(o)+(o.modelId!=null?':model:'+String(o.modelId):'');
 const settings=()=>db.prepare('SELECT * FROM flash_beta_settings WHERE id=1').get();
 const status=()=>({enabled:Boolean(settings().enabled),testOnly:true,publicationLabelsEnabled:false,busy,sourceAvailable:Boolean(source?.permitted&&source?.confirmsProductMembership),source:source?.name||'Shopee Affiliate API / storefront indisponível',limitation:'Esquema Affiliate sem confirmação Flash Sale; endpoint storefront respondeu HTTP 403. Nenhum bloqueio é contornado.',timezone:'America/Sao_Paulo',results:db.prepare('SELECT * FROM flash_beta_results ORDER BY checked_at DESC LIMIT 100').all().map(row=>{
  const result=JSON.parse(row.result);
  if(result.status==='ACTIVE'||result.status==='SCHEDULED'){
   if(now()-row.checked_at>cacheMs)return {...result,status:'UNVERIFIED',error:'Verificação em cache venceu. Teste novamente.'};
   const at=now(),start=Date.parse(result.startAt),end=Date.parse(result.endAt);
   return {...result,status:at>=end?'EXPIRED':at<start?'SCHEDULED':'ACTIVE'};
  }return result;
 })});
 function configure(enabled){if(typeof enabled!=='boolean')throw Error('Informe ON ou OFF.');db.prepare('UPDATE flash_beta_settings SET enabled=? WHERE id=1').run(Number(enabled));generation++;return status();}
 async function test(ids){
  if(!settings().enabled)throw Error('Ative Ofertas Relâmpago (BETA) para testar. Nenhuma consulta foi realizada.');
  if(busy)throw Error('Já existe um teste em andamento.');
  if(!Array.isArray(ids)||!ids.length||ids.length>5||ids.some(id=>typeof id!=='string'))throw Error('Selecione de 1 a 5 produtos.');
  const offers=getOffers(),selected=[...new Set(ids)].map(id=>{const o=offers.find(o=>o.id===id);if(!o)throw Error('Produto indisponível no catálogo.');return o;});
  const token=generation;busy=true;
  try{
   const old=selected.map(o=>db.prepare('SELECT checked_at FROM flash_beta_results WHERE product_key=?').get(cacheKey(o)));
   if(old.every(row=>row&&now()-row.checked_at<cacheMs))return status();
   const last=settings().last_attempt;
   if(last!=null&&now()-last<rateLimitMs)throw Error('Aguarde 60 segundos entre novos testes.');
   db.prepare('UPDATE flash_beta_settings SET last_attempt=? WHERE id=1').run(now());
   let records=[],error=null;
   const usable=source?.permitted===true&&source?.confirmsProductMembership===true;
   if(!usable)error='Fonte confiável inacessível: Affiliate API não comprova participação; storefront HTTP 403. Verificação não realizada.';
   else {
    for(let attempt=0;attempt<2;attempt++){
     if(!settings().enabled||token!==generation)throw Error('Teste cancelado: BETA foi desligada.');
     try{records=await source.fetch(selected,{signal:AbortSignal.timeout(12000)});if(!Array.isArray(records))throw Error();break;}
     catch(e){records=[];if(e.retryable===true&&![401,403,429].includes(e.status)&&attempt===0){await sleep(1000);continue;}error='Fonte indisponível ou acesso restrito; não foi possível confirmar a promoção.';break;}
    }
   }
   for(const offer of selected){
    if(!settings().enabled||token!==generation)throw Error('Teste cancelado: BETA foi desligada.');
    const key=instagramProductKey(offer),parts=/^shopee:(\d+):(\d+)$/.exec(key||'');
    const candidates=records.filter(r=>parts&&String(r.shopId)===parts[1]&&String(r.itemId)===parts[2]);
    const ranked=candidates.map(r=>classifyFlashSale(offer,r,now())).sort((a,b)=>['ACTIVE','SCHEDULED','EXPIRED','UNVERIFIED'].indexOf(a.status)-['ACTIVE','SCHEDULED','EXPIRED','UNVERIFIED'].indexOf(b.status));
    let result=ranked[0]||classifyFlashSale(offer,records[0],now());
    let currentPrice=null;
    if(result.status==='ACTIVE'){
     try{const current=await priceRefresh(offer);if(instagramProductKey(current)!==key||(offer.modelId!=null&&String(current.modelId)!==String(offer.modelId))||current.active===false||!Number.isFinite(current.price)||current.price<=0||(current.expiresAt&&(!Number.isFinite(Date.parse(current.expiresAt))||Date.parse(current.expiresAt)<=now())))throw Error();currentPrice=current.price;}
     catch{result={...result,status:'UNVERIFIED',error:'Não foi possível revalidar o preço atual do produto.'};}
    }
    if(!settings().enabled||token!==generation)throw Error('Teste cancelado: BETA foi desligada.');
    if(result.status==='ACTIVE'&&now()>=Date.parse(result.endAt))result={...result,status:'EXPIRED'};
    const checkedAt=now();result={...result,error:error||result.error,offerId:offer.id,productKey:key,title:offer.title,source:source?.name||'Shopee Affiliate API / storefront HTTP 403',checkedAt:new Date(checkedAt).toISOString(),currentPrice,testOnly:true,publishLabel:false};
    db.prepare('INSERT OR REPLACE INTO flash_beta_results VALUES(?,?,?,?,?)').run(cacheKey(offer),offer.id,offer.title,JSON.stringify(result),checkedAt);
   }
   return status();
  }finally{busy=false;}
 }
 return {status,configure,test};
}
