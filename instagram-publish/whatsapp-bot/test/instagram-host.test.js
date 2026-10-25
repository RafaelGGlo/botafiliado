import test from 'node:test';
import assert from 'node:assert/strict';
import { hostInstagramImage } from '../src/instagram-host.js';

test('Cloudinary hosting signs upload and returns only HTTPS delivery URL', async () => {
 const env = { CLOUDINARY_CLOUD_NAME: 'test-cloud', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' };
 let calls = 0;
 const request = async (url, options) => {
  calls++;
  assert.equal(url, 'https://api.cloudinary.com/v1_1/test-cloud/image/upload');
  assert.equal(options.body.get('overwrite'), 'false');
  assert.match(options.body.get('signature'), /^[a-f0-9]{64}$/);
  assert.equal(options.body.get('file').type, 'image/jpeg');
  return { ok: true, json: async () => ({ secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/offer.jpg' }) };
 };
 assert.match(await hostInstagramImage(Buffer.from('jpeg'), env, request), /^https:/);
 await assert.rejects(hostInstagramImage(Buffer.from('jpeg'), {}, request), /Credenciais/);
 assert.equal(calls, 1);
 await assert.rejects(hostInstagramImage(Buffer.from('jpeg'), env, async () => ({ ok: true, json: async () => ({ secure_url: 'http://example.com/image' }) })), /inválido/);
});
