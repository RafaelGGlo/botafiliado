// One additional live Story explicitly authorized by the account owner. No WhatsApp calls.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { promotionalImage } from '../instagram-publish/whatsapp-bot/src/instagram-image.js';
import { pythonPublisher } from '../instagram-publish/whatsapp-bot/src/instagrapi-stories.js';
import { shopeeQuery } from '../instagram-publish/whatsapp-bot/src/shopee-api.js';

const root = path.resolve(import.meta.dirname, '..');
const state = path.join(root, 'instagram-publisher/state');
const offer = JSON.parse(fs.readFileSync(path.join(state, 'live-offer.json'), 'utf8'));
const ids = /^shopee:(\d+):(\d+)$/.exec(offer.id);
if (!ids || !offer.affiliateUrl) throw Error('Current Shopee offer with affiliate URL required');
const env = parseEnv(fs.readFileSync(path.join(root, 'whatsapp-bot/.env'), 'utf8'));
const data = await shopeeQuery(`{ productOfferV2(shopId: ${ids[1]}, itemId: ${ids[2]}, limit: 1) { nodes { productName priceMin imageUrl } } }`, env, fetch, { maxAttempts: 1 });
const fresh = data.productOfferV2?.nodes?.[0];
if (!fresh || !(Number(fresh.priceMin) > 0)) throw Error('Offer no longer available');
const label = 'TESTE BOTÃO 1/1';
console.log(label);
const current = { ...offer, title: `${label} — ${fresh.productName}`, price: Number(fresh.priceMin), imageUrl: fresh.imageUrl, previousPrice: null, discountRate: 0 };
const imagePath = path.join(state, 'live-tests/button-test-1.jpg');
fs.mkdirSync(path.dirname(imagePath), { recursive: true });
fs.writeFileSync(imagePath, await promotionalImage(current, 'story', null, 'promotional', { nativeLink: true }), { mode: 0o600 });
const key = createHash('sha256').update('authorized-visible-button-live-test-1').digest('hex');
const result = await pythonPublisher({ key, imagePath, affiliateUrl: offer.affiliateUrl, caption: `${label}\n${fresh.productName}\nR$ ${current.price.toFixed(2)}\n${offer.affiliateUrl}` });
fs.writeFileSync(path.join(state, 'live-tests/button-test-1-result.json'), JSON.stringify({ label, ...result }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ label, ...result }));
if (result.status !== 'published') process.exitCode = 1;
