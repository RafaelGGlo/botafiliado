// Authorized Instagram-only tests. Never connects to WhatsApp.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pythonPublisher } from '../instagram-publish/whatsapp-bot/src/instagrapi-stories.js';
import { promotionalImage } from '../instagram-publish/whatsapp-bot/src/instagram-image.js';
const root = path.resolve(import.meta.dirname, '..');
const python = process.env.INSTAGRAM_PYTHON || path.join(root, 'instagram-publisher/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const check = spawnSync(python, [path.join(root, 'instagram-publisher/publisher.py'), 'check'], { encoding: 'utf8', windowsHide: true });
let configuration;
try { configuration = JSON.parse(check.stdout); } catch { throw Error('Python/dependencies unavailable. Follow instagram-publisher/README.md. No Story published.'); }
console.log(JSON.stringify(configuration)); // Booleans only.
if ((!configuration.credentialsConfigured && !configuration.savedSessionPresent) || configuration.accountBlocked) throw Error('Local credentials/session missing or account blocked. No Story published.');
if (!process.argv[2]) throw Error('Provide a local JSON file with a current offer: id,title,price,affiliateUrl,imageFile or imageUrl.');
const offer = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
if (!offer.id || !offer.title || !Number.isFinite(offer.price) || !offer.affiliateUrl || (!offer.imageFile && !offer.imageUrl)) throw Error('Incomplete current offer');
if (offer.expiresAt && Date.parse(offer.expiresAt) <= Date.now()) throw Error('Offer expired');
const dir = path.join(root, 'instagram-publisher/state/live-tests'); fs.mkdirSync(dir, { recursive: true });
// Fixed, durable keys cap this runner at five publications for this repository/account.
for (let n = 1; n <= 5; n++) {
 const label = `TESTE ${n}/5`; console.log(label);
 const key = createHash('sha256').update(`authorized-instagrapi-live-test-${n}`).digest('hex');
 const imagePath = path.join(dir, `${n}.jpg`);
 const bytes = await promotionalImage({ ...offer, title: `${label} — ${offer.title}` }, 'story', null, 'promotional', { nativeLink: true });
 fs.writeFileSync(imagePath, bytes, { mode: 0o600 });
 const result = await pythonPublisher({ key, imagePath, affiliateUrl: offer.affiliateUrl, caption: `${label}\n${offer.title}\n${offer.affiliateUrl}` });
 console.log(JSON.stringify({ label, ...result, tapVerified: false }));
 if (result.status !== 'published') { console.log('Stopped. Remaining tests were not attempted.'); break; }
}
