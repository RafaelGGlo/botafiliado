import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { storyPrices, fitStoryTitle, storyFont } from '../src/story-template.js';
import { createBroadcaster } from '../src/broadcast.js';

test('prices never infer previous prices from reported discount rates', () => {
 for (const previousPrice of [undefined, null, '', 0, -1, 50, 49, Infinity, 'invalid']) {
  assert.deepEqual(storyPrices({ price: 50, previousPrice, discountRate: 80 }), { current: 'R$\u00a050,00', previous: null, discount: 0 });
 }
 assert.equal(storyPrices({ price: 66.99, previousPrice: 139.9 }).discount, 52);
 assert.equal(storyPrices({ price: 50, previousPrice: 100 }).previous, 'R$\u00a0100,00');
 for (const price of [0, -1, Infinity, undefined, 'invalid']) assert.throws(() => storyPrices({ price }));
});

test('long titles, XML characters and unbroken strings fit into two measured lines', async () => {
 for (const text of ['Carregador Portátil Mini Power Bank 10000mAh Com 02 Saídas Tipo-C / Lightning', 'A'.repeat(300), 'Produto <novo> & oferta '.repeat(20)]) {
  const title = await fitStoryTitle(text);
  assert.ok(title.lines.length <= 2);
  for (const line of title.lines) {
   const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
   const meta = await sharp({ text: { text: escaped, font: `${storyFont} Bold ${title.size}`, dpi: 72, rgba: true } }).metadata();
   assert.ok(meta.width <= 900);
  }
 }
});

test('a failed Story render cannot stop any WhatsApp group delivery', async () => {
 let sent = 0, confirmed = 0;
 const broadcast = createBroadcaster({ groups: ['a', 'b'], minMs: 0, maxMs: 0,
  store: { isDealSentToGroup: () => false, reserve() {}, markDealAsSent() { confirmed++; } },
  getSocket: () => ({ sendMessage: async () => { sent++; } }),
  logger: { info() {}, warn() {} }, sleep: async () => {},
  onPrepared: async () => { throw Error('Image rendering failed'); },
 });
 await broadcast({ id: 'real-offer' }, Buffer.from('photo'), 'caption');
 assert.equal(sent, 2); assert.equal(confirmed, 2);
});
