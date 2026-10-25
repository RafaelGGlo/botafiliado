import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
Object.assign(process.env, parseEnv(fs.readFileSync(path.join(root, 'whatsapp-bot/.env'), 'utf8')));
const { createInstagram } = await import('../instagram-publish/whatsapp-bot/src/instagram.js');
const { createShopeeSource } = await import('../instagram-publish/whatsapp-bot/src/shopee-offers.js');
const { captureInstagramOffers } = await import('../instagram-publish/whatsapp-bot/src/instagram-catalog.js');
const ig = createInstagram();
try {
 const offers = await createShopeeSource({ maxPages: 1 })({ limit: 10 });
 if (!offers.length) throw Error('Nenhuma oferta atual disponível.');
 captureInstagramOffers(offers);
 ig.configure({ autoEnabled: true, autoPublish: false, autoDays: 1, autoHour: 12, autoMinute: 0, autoFormat: 'feed' });
 const existing = ig.list().find(p => p.mode === 'auto' && p.status === 'scheduled');
 if (existing) { console.log(JSON.stringify({ id: existing.id, image: existing.media, status: existing.status })); }
 else {
  const used = new Set(ig.list().filter(p => p.status !== 'cancelled').map(p => p.offer_id));
  const offer = offers.find(o => !used.has(o.id));
  if (!offer) throw Error('Nenhuma oferta inédita.');
  const caption = `${offer.title}\n\n${offer.fromPrice ? 'A partir de ' : ''}${offer.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n${offer.discountRate ? `${offer.discountRate}% de desconto informado pela Shopee.\n` : ''}\nConfira a oferta: ${offer.affiliateUrl}\n\nOferta de afiliado: podemos receber comissão. Preço e disponibilidade podem mudar; confira na loja.\n#ofertas #shopee #afiliado`;
  const post = await ig.save({ offerId: offer.id, format: 'feed', at: new Date(Date.now() + 60000).toISOString(), caption }, null, true);
  console.log(JSON.stringify({ id: post.id, image: path.resolve('instagram-publish/whatsapp-bot/instagram-media', post.media), title: offer.title, status: post.status }));
 }
} finally { await ig.close(); }
