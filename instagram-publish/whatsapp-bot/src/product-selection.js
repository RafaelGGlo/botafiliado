import { marketplaceUrl } from './affiliates.js';
export const CATEGORY_WEIGHTS = { home: 30, electronics: 25, automotive_tools: 15, fashion_beauty: 15, computers_others: 15 };
const rules = [
 ['automotive_tools', /\b(automotiv\w*|carro|veicular|furadeira|parafusadeira|ferramentas?|lanterna|drill|tool kit|flashlight)\b/],
 ['computers_others', /\b(ssd|teclado|mouse|hub usb|usb hub|keyboard|comedouro|bebedouro|pet|pets|cachorro|gato)\b/],
 ['home', /\b(organizador\w*|panela\w*|frigideira|lampada led|air fryer|airfryer|fritadeira|cookware|organizer)\b/],
 ['electronics', /\b(carregador\w*|charger|cabo usb|usb.c|fone\w*|earbuds|power bank|caixa de som|speaker)\b/],
 ['fashion_beauty', /\b(camiseta\w*|camisa\w*|bermuda\w*|calca\w*|meia\w*|tenis|sapato\w*|barbeador|aparador|depilador|shoe\w*|grooming)\b/],
];
export function selectionConfig(env = process.env) {
 const weights = env.SHOPEE_SELECTION_WEIGHTS ? JSON.parse(env.SHOPEE_SELECTION_WEIGHTS) : CATEGORY_WEIGHTS;
 if (Object.keys(weights).some(k => !(k in CATEGORY_WEIGHTS)) || Object.values(weights).some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0) || !Object.values(weights).some(v => v > 0)) throw Error('Invalid SHOPEE_SELECTION_WEIGHTS');
 const allowed = (env.SHOPEE_ALLOWED_CATEGORIES || Object.keys(CATEGORY_WEIGHTS).join(',')).split(',').map(v => v.trim());
 if (allowed.some(k => !(k in CATEGORY_WEIGHTS))) throw Error('Invalid SHOPEE_ALLOWED_CATEGORIES');
 return { weights, allowed };
}
const numeric = v => v !== null && v !== undefined && String(v).trim() !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v)) ? Number(v) : null;
export function evaluateProduct(deal, config = selectionConfig()) {
 const reasons = [], title = typeof deal?.title === 'string' ? deal.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';
 const category = rules.find(([, pattern]) => pattern.test(title))?.[0];
 if (!category || !config.allowed.includes(category)) reasons.push('category_not_allowed');
 if (title.length < 4 || /\b(replica|falso|milagroso|cura|sorteio|somente caixa|apenas embalagem|400000mah|1000000mah)\b/.test(title)) reasons.push('suspicious_title');
 const rating = numeric(deal?.rating), price = numeric(deal?.price), sales = numeric(deal?.sales), discount = numeric(deal?.discountRate);
 if (rating === null || rating < 4.5 || rating > 5) reasons.push('rating_missing_or_below_4_5');
 if (price === null || price <= 0) reasons.push('invalid_price');
 if (discount === null || discount <= 0 || discount >= 100) reasons.push('discount_unconfirmed');
 if (deal?.active === false || deal?.testOnly || (deal?.expiresAt && (!Number.isFinite(Date.parse(deal.expiresAt)) || Date.parse(deal.expiresAt) <= Date.now()))) reasons.push('inactive_or_test');
 try { marketplaceUrl(deal.productUrl, 'shopee'); marketplaceUrl(deal.affiliateUrl, 'shopee'); if (deal.platform !== 'shopee') throw Error(); } catch { reasons.push('invalid_product_or_affiliate_url'); }
 try { const u = new URL(deal.imageUrl); if (u.protocol !== 'https:' || u.username || u.password) throw Error(); } catch { reasons.push('invalid_image_url'); }
 const score = 20 + (rating === null ? 0 : rating * 6) + (sales !== null && sales >= 100 ? 20 : 0) + (discount !== null && discount >= 20 ? 20 : 0) + (price >= 15 && price <= 150 ? 10 : 0);
 return { accepted: reasons.length === 0, reasons: reasons.length ? reasons : ['allowed_useful_product', 'rating_verified', 'api_discount_present'], category, score };
}
// Deficit allocation approximates configured shares when qualified stock is available.
export function rankProducts(deals, config = selectionConfig(), counts = {}, limit = deals.length) {
 const pool = deals.map(deal => ({ deal, ...evaluateProduct(deal, config) })).filter(v => v.accepted), result = [], current = { ...counts };
 while (pool.length && result.length < limit) {
  const total = Object.values(current).reduce((a,b) => a+b, 0) + 1;
  pool.sort((a,b) => ((config.weights[b.category] || 0) * total / 100 - (current[b.category] || 0)) - ((config.weights[a.category] || 0) * total / 100 - (current[a.category] || 0)) || b.score-a.score || String(a.deal.id).localeCompare(String(b.deal.id)));
  const next = pool.shift(); result.push(next.deal); current[next.category] = (current[next.category] || 0) + 1;
 }
 return result;
}
