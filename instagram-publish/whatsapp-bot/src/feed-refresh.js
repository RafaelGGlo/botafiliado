import { shopeeQuery } from './shopee-api.js';
import { instagramProductKey } from './instagram-catalog.js';
import { marketplaceUrl } from './affiliates.js';
export async function refreshFeedOffer(selected, { env=process.env, request=fetch, now=Date.now }={}) {
 const key=instagramProductKey(selected), match=/^shopee:(\d+):(\d+)$/.exec(key || '');
 if(!match) throw Error('Esta fonte não permite atualizar o produto para publicação manual.');
 let data;
 try { data=await shopeeQuery(`{ productOfferV2(itemId:${match[2]}, page:1, limit:30) { nodes { itemId shopId productName productLink imageUrl priceMin priceMax offerLink sales ratingStar } } }`,env,request); }
 catch { throw Error('Não foi possível atualizar a oferta na Shopee. Nada foi publicado. Confira acesso à fonte e tente novamente.'); }
 const p=data.productOfferV2?.nodes?.find(p=>String(p.shopId)===match[1]&&String(p.itemId)===match[2]);
 if(!p || !p.productName?.trim() || !Number.isFinite(Number(p.priceMin)) || Number(p.priceMin)<=0) throw Error('Oferta indisponível, expirada ou com preço inválido na fonte.');
 let productUrl,affiliateUrl,image;
 try { productUrl=marketplaceUrl(p.productLink,'shopee'); affiliateUrl=marketplaceUrl(p.offerLink,'shopee'); image=new URL(p.imageUrl); if(image.protocol!=='https:'||image.username||image.password) throw Error(); }
 catch { throw Error('A fonte retornou foto ou link de afiliado inválido.'); }
 return {id:selected.id,productKey:key,platform:'shopee',title:p.productName,price:Number(p.priceMin),fromPrice:Number(p.priceMax)>Number(p.priceMin),imageUrl:image.href,productUrl,affiliateUrl,refreshedAt:new Date(now()).toISOString(),active:true};
}
