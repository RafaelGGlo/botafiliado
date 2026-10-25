import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBroadcaster } from '../src/broadcast.js';

test('Instagram is triggered once for confirmed groups, never for failed sends', async () => {
 for (const fail of [false, true]) {
  let synced = 0, sent = 0;
  const broadcast = createBroadcaster({
   groups: ['one', 'two'], minMs: 0, maxMs: 0,
   store: { isDealSentToGroup: () => false, reserve() {}, markDealAsSent() { sent++; } },
   getSocket: () => ({ sendMessage: async () => { if (fail) throw Error('offline'); } }),
   logger: { info() {}, warn() {} }, sleep: async () => {},
   onDelivered: async (offer, caption) => {
    synced++; assert.equal(offer.id, 'offer'); assert.equal(caption, 'caption');
    throw Error('Instagram unavailable');
   },
  });
  await broadcast({ id: 'offer' }, Buffer.from('image'), 'caption');
  assert.equal(synced, fail ? 0 : 1);
  assert.equal(sent, fail ? 0 : 2);
 }
});
