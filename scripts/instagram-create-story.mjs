import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
Object.assign(process.env, parseEnv(fs.readFileSync('whatsapp-bot/.env', 'utf8')));
const { createInstagram } = await import('../instagram-publish/whatsapp-bot/src/instagram.js');
const { createShopeeSource } = await import('../instagram-publish/whatsapp-bot/src/shopee-offers.js');
const { captureInstagramOffers } = await import('../instagram-publish/whatsapp-bot/src/instagram-catalog.js');
const ig = createInstagram();
try {
 const offers = await createShopeeSource({ maxPages: 1 })({ limit: 30 });
 captureInstagramOffers(offers);
 const latest = ig.list().filter(p => p.status === 'published' && p.format === 'feed').at(-1);
 const used = new Set(ig.list().filter(p => p.format === 'story' && p.status !== 'cancelled').map(p => p.offer_id));
 const offer = offers.find(o => o.id === latest?.offer_id && !used.has(o.id)) || offers.find(o => !used.has(o.id));
 if (!offer) throw Error('Nenhuma oferta atual inédita para story.');
 const post = await ig.save({ offerId: offer.id, format: 'story', at: new Date(Date.now() + 60000).toISOString(), caption: `${offer.title}\n${offer.affiliateUrl}\nOferta de afiliado. Preço e disponibilidade podem mudar.` }, null, true);
 console.log(JSON.stringify({ id: post.id, image: path.resolve('instagram-publish/whatsapp-bot/instagram-media', post.media), status: post.status }));
} finally { await ig.close(); }
