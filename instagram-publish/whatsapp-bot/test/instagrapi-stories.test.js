import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createStoryPublisher, pythonPublisher } from '../src/instagrapi-stories.js';
import { createBroadcaster } from '../src/broadcast.js';
import { SentStore } from '../src/store.js';
import { promotionalImage } from '../src/instagram-image.js';

const offer = { id: 'product-1', title: 'Produto', price: 19.9, affiliateUrl: 'https://shope.ee/example' };
function fixture(t, { groups = ['a'], fail = false, results = [{ status: 'published', storyId: '123', linkVerified: true }] } = {}) {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-story-'));
 let clock = 0, sends = 0, publications = 0;
 const publish = async payload => { publications++; assert.equal(payload.affiliateUrl, offer.affiliateUrl); assert.equal(payload.price, offer.price); return results.shift() || { status: 'published', storyId: '456' }; };
 const makeImage = async (_offer, format, image) => { assert.equal(format, 'story'); assert.equal(image.toString(), 'same-image'); return image; };
 let stories = createStoryPublisher({ env: { INSTAGRAPI_LIVE_APPROVED: "true", INSTAGRAM_TEST_MODE: "false" }, dir, publish, makeImage, now: () => clock });
 const store = new SentStore(path.join(dir, 'sent.json'), 1000000, () => clock);
 const broadcaster = () => createBroadcaster({ store, groups, minMs: 0, maxMs: 0,
  getSocket: () => ({ sendMessage: async () => { sends++; if (fail) throw Error('offline'); if (sends > 1 && groups.length > 1) assert.equal(publications, 1, 'Story attempted before next group'); return { key: { id: 'ack' } }; } }),
  logger: { info() {}, warn() {} }, sleep: async () => {},
  onPrepared: (...args) => stories.stage(...args), onConfirmed: deal => stories.confirmed(deal) });
 t.after(async () => { await stories.close(); fs.rmSync(dir, { recursive: true, force: true }); });
 return { send: () => broadcaster()(offer, Buffer.from('same-image'), 'same-caption'),
  counts: () => ({ sends, publications }), stories: () => stories, advance: () => { clock += 300000; },
  restart: async () => { await stories.close(); stories = createStoryPublisher({ env: { INSTAGRAPI_LIVE_APPROVED: "true", INSTAGRAM_TEST_MODE: "false" }, dir, publish, makeImage, now: () => clock }); } };
}
test('1. confirmed WhatsApp send immediately publishes one Story', async t => {
 const f = fixture(t); await f.send(); assert.deepEqual(f.counts(), { sends: 1, publications: 1 });
 assert.equal(f.stories().list()[0].status, 'published');
});
test('2. multiple group deliveries publish once, immediately after first confirmation', async t => {
 const f = fixture(t, { groups: ['a','b','c'] }); await f.send();
 assert.deepEqual(f.counts(), { sends: 3, publications: 1 });
});
test('3. total WhatsApp failure publishes no Story, including after restart', async t => {
 const f = fixture(t, { groups: ['a','b'], fail: true }); await f.send(); await f.restart(); await f.stories().retry();
 assert.deepEqual(f.counts(), { sends: 2, publications: 0 });
});
test('4. safe Instagram retry survives restart and never resends WhatsApp', async t => {
 const f = fixture(t, { results: [{ status: 'retryable', error: 'pre_upload_connection' }] });
 await f.send(); await f.restart(); f.advance(); await f.stories().retry(); await f.send();
 assert.deepEqual(f.counts(), { sends: 1, publications: 2 });
 assert.equal(f.stories().list()[0].status, 'published');
});
test('5. reprocessing after persistent WhatsApp TTL expires still cannot duplicate Story', async t => {
 const f = fixture(t); await f.send(); await f.restart();
 for (let n=0;n<4;n++) f.advance();
 await f.send();
 assert.deepEqual(f.counts(), { sends: 2, publications: 1 });
});
test('uncertain upload and security stop cannot be retried automatically', async t => {
 for (const status of ['uncertain','blocked']) {
  const f = fixture(t, { results: [{ status, error: 'stop' }] }); await f.send(); await f.restart(); f.advance();
  await f.stories().retry(); await f.stories().confirmed(offer);
  assert.deepEqual(f.counts(), { sends: 1, publications: 1 });
 }
});
test('prepared offer recovers only from a persisted confirmed WhatsApp send', async t => {
 const f = fixture(t); await f.stories().stage(offer, Buffer.from('same-image'), 'same-caption');
 f.stories().recoverConfirmed({ hasConfirmedDelivery: () => false }); await f.stories().retry();
 assert.equal(f.counts().publications, 0);
 f.stories().recoverConfirmed({ hasConfirmedDelivery: () => true }); await f.stories().retry();
 assert.equal(f.counts().publications, 1);
});
test('Story artwork is 9:16 with visual CTA aligned to native link geometry', async () => {
 const image = await sharp({ create: { width: 600, height: 600, channels: 3, background: 'white' } }).jpeg().toBuffer();
 const bytes = await promotionalImage(offer, 'story', image, 'promotional', { nativeLink: true });
 const meta = await sharp(bytes).metadata(); assert.equal(meta.width,1080); assert.equal(meta.height,1920);
 const layout = JSON.parse(fs.readFileSync(new URL('../../../instagram-publisher/story-layout.json', import.meta.url), 'utf8'));
 const x = Math.round(layout.x * 1080), y = Math.round(layout.y * 1920);
 const { data } = await sharp(bytes).extract({ left: x - 300, top: y - 50, width: 600, height: 100 }).raw().toBuffer({ resolveWithObject: true });
 let yellow = 0, navy = 0;
 for (let i = 0; i < data.length; i += 3) {
  if (data[i] > 230 && data[i + 1] > 190 && data[i + 2] < 30) yellow++;
  if (data[i] < 30 && data[i + 1] < 50 && data[i + 2] < 90) navy++;
 }
 assert.ok(yellow > 20000, 'yellow CTA is inside clickable area');
 assert.ok(navy > 2000, 'CTA label remains legible');
});
test('missing Python reports safe retry without exposing environment secrets', async () => {
 const result = await pythonPublisher({}, { env: { INSTAGRAPI_LIVE_APPROVED: 'true', INSTAGRAM_TEST_MODE: 'false', INSTAGRAM_PYTHON: 'missing-python-command-for-test' } });
 assert.deepEqual(result, { status: 'retryable', error: 'python_unavailable' });
});
