'use strict';

// Isolated one-post workflow. Does not start bots, schedulers or WhatsApp.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseEnv } = require('node:util');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'output/instagram-one-post');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const caption = `🧹 Um garimpo para facilitar a limpeza!

Mop Giratório 360° com cabo de 140 cm, balde centrífuga de 14 L, cesto inox e 2 refis de microfibra.

💰 R$ 69,90
🏷️ 65% de desconto informado pela Shopee.

👉 Confira o link na bio para acessar a oferta.

Oferta de afiliado: podemos receber comissão pela compra. Preço, desconto, frete e disponibilidade podem mudar; confira as condições na loja antes de comprar.

#GarimpoDeOfertas #OfertasShopee #MopGiratorio #CasaOrganizada #LimpezaDaCasa #Achadinhos`;

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const product = JSON.parse(fs.readFileSync(path.join(dir, 'product.json'), 'utf8'));
  if (product.productKey !== 'shopee:1509818453:23298363231' || Number(product.priceMin) !== 69.9 || Number(product.priceDiscountRate) !== 65) throw Error('Product snapshot differs from the preview. Prepare a new preview.');
  if (command === 'prepare') {
    if (fs.existsSync(path.join(dir, 'attempt.json'))) throw Error('Publication attempt already exists. Do not overwrite the approved preview.');
    if (!args[0]) throw Error('Usage: prepare <generated-image-path>');
    const bytes = await sharp(args[0]).rotate().resize(1080, 1350, { fit: 'contain', background: '#fffaf4' }).flatten({ background: '#fffaf4' }).jpeg({ quality: 95 }).toBuffer();
    fs.writeFileSync(path.join(dir, 'feed.jpg'), bytes);
    fs.writeFileSync(path.join(dir, 'caption.txt'), caption, 'utf8');
    const digest = hash(Buffer.concat([bytes, Buffer.from(caption), Buffer.from(product.productKey)]));
    fs.writeFileSync(path.join(dir, 'preview.json'), JSON.stringify({ digest, imageHash: hash(bytes), productKey: product.productKey, createdAt: new Date().toISOString() }, null, 2));
    console.log('[SUCCESS] Prepared JPEG 1080x1350 and caption. Approval fingerprint: ' + digest);
    return;
  }
  if (command === 'upload') {
    const env = parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8'));
    let cloud = env.CLOUDINARY_CLOUD_NAME, key = env.CLOUDINARY_API_KEY, secret = env.CLOUDINARY_API_SECRET;
    if (env.CLOUDINARY_URL) {
      const config = new URL(env.CLOUDINARY_URL);
      if (config.protocol !== 'cloudinary:') throw Error('Invalid Cloudinary configuration.');
      cloud = config.hostname; key = decodeURIComponent(config.username); secret = decodeURIComponent(config.password);
    }
    if (!cloud || !key || !secret || !/^[a-zA-Z0-9_-]+$/.test(cloud)) throw Error('Missing Cloudinary credentials in local .env.');
    const bytes = fs.readFileSync(path.join(dir, 'feed.jpg'));
    const preview = JSON.parse(fs.readFileSync(path.join(dir, 'preview.json'), 'utf8'));
    if (hash(bytes) !== preview.imageHash) throw Error('Public image must match the preview.');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const publicId = 'garimpo-instagram-' + preview.imageHash.slice(0, 24);
    const params = 'overwrite=false&public_id=' + publicId + '&timestamp=' + timestamp;
    const signature = crypto.createHash('sha256').update(params + secret).digest('hex');
    const form = new FormData();
    form.set('file', new Blob([bytes], { type: 'image/jpeg' }), 'feed.jpg');
    for (const [name, value] of Object.entries({ api_key: key, timestamp, public_id: publicId, overwrite: 'false', signature })) form.set(name, value);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    if (!response.ok) throw Error('Public image upload failed; Cloudinary HTTP ' + response.status + '. Response body hidden.');
    const url = new URL(result.secure_url);
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') throw Error('Unexpected Cloudinary delivery URL.');
    const delivered = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!delivered.ok || hash(Buffer.from(await delivered.arrayBuffer())) !== preview.imageHash) throw Error('Public image delivery differs from approved preview.');
    fs.writeFileSync(path.join(dir, 'hosting.json'), JSON.stringify({ secureUrl: url.href, imageHash: preview.imageHash }, null, 2));
    console.log('[SUCCESS] Public HTTPS JPEG verified: ' + url.href);
    return;
  }
  if (command !== 'publish') throw Error('Use prepare, upload or publish. No API write was made.');
  const [approvedDigest, publicUrl, bioConfirmation] = args;
  const preview = JSON.parse(fs.readFileSync(path.join(dir, 'preview.json'), 'utf8'));
  const image = fs.readFileSync(path.join(dir, 'feed.jpg'));
  const approvedCaption = fs.readFileSync(path.join(dir, 'caption.txt'), 'utf8');
  const digest = hash(Buffer.concat([image, Buffer.from(approvedCaption), Buffer.from(product.productKey)]));
  if (!approvedDigest || approvedDigest !== preview.digest || digest !== approvedDigest) throw Error('Explicit approval must match the unchanged image and caption fingerprint.');
  if (bioConfirmation !== '--bio-link-confirmed') throw Error('Confirm that the approved offer is reachable through the link in bio first.');
  const url = new URL(publicUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('Public image must use HTTPS without embedded credentials.');
  const remote = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!remote.ok || !/^image\/jpeg\b/i.test(remote.headers.get('content-type') || '')) throw Error('Public URL must return HTTP 200 and image/jpeg directly.');
  const remoteBytes = Buffer.from(await remote.arrayBuffer());
  if (remoteBytes.length > 8 * 1024 * 1024 || hash(remoteBytes) !== preview.imageHash) throw Error('Public JPEG differs from the approved preview or exceeds 8 MB.');
  const env = parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8'));
  if (!env.INSTAGRAM_ACCESS_TOKEN) throw Error('Missing local Instagram token.');
  const version = env.INSTAGRAM_API_VERSION || 'v25.0';
  if (!/^v\d+\.0$/.test(version)) throw Error('Invalid API version.');
  async function graph(resource, data) {
    const response = await fetch(`https://graph.instagram.com/${version}/${resource}`, {
      method: data ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(25000),
      headers: { Authorization: 'Bearer ' + env.INSTAGRAM_ACCESS_TOKEN, ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      ...(data ? { body: new URLSearchParams(data) } : {}),
    });
    const body = await response.json();
    if (!response.ok || body.error) throw Error(`Meta HTTP ${response.status}; code ${Number(body.error?.code || 0)}; subcode ${Number(body.error?.error_subcode || 0)}. Response body hidden.`);
    return body;
  }
  const account = await graph('me?fields=id,user_id,username,account_type');
  if (account.username !== 'garimpoo__ofertas' || String(account.user_id) !== '17841454176827517') throw Error('Unexpected Instagram account.');
  // Refresh this exact catalog product without touching existing bot storage.
  const { shopeeQuery } = await import('../instagram-publish/whatsapp-bot/src/shopee-api.js');
  const live = await shopeeQuery('{ productOfferV2(shopId: 1509818453, itemId: 23298363231, limit: 1) { nodes { productName priceMin priceDiscountRate imageUrl } } }', env, fetch, { maxAttempts: 1 });
  const fresh = live.productOfferV2?.nodes?.[0];
  if (!fresh || Number(fresh.priceMin) !== 69.9 || Number(fresh.priceDiscountRate) !== 65 || fresh.productName !== product.productName || fresh.imageUrl !== product.imageUrl) throw Error('Offer changed or became unavailable. New preview and approval required.');
  let resource = account.id + '/media?fields=id,caption&limit=100';
  for (let page = 0; ; page++) {
    if (page >= 100) throw Error('Duplicate check incomplete.');
    const posts = await graph(resource);
    if (!Array.isArray(posts.data)) throw Error('Cannot verify existing posts.');
    if (posts.data.some(p => /mop|23298363231/i.test(p.caption || ''))) throw Error('Possible duplicate product exists on Instagram.');
    if (!posts.paging?.next) break;
    if (!posts.paging.cursors?.after) throw Error('Missing pagination cursor.');
    resource = account.id + '/media?fields=id,caption&limit=100&after=' + encodeURIComponent(posts.paging.cursors.after);
  }
  const { DatabaseSync } = require('node:sqlite');
  const history = path.join(root, 'instagram-publish/whatsapp-bot/instagram.sqlite');
  if (fs.existsSync(history)) {
    const db = new DatabaseSync(history, { readOnly: true });
    try {
      if (db.prepare('SELECT snapshot FROM ig_posts WHERE attempted = 1 OR status = ?').all('published').some(p => p.snapshot.includes(product.productKey))) throw Error('Product already reserved or published by the existing Instagram module.');
    } finally { db.close(); }
  }
  const quota = await graph(account.id + '/content_publishing_limit?fields=quota_usage,config');
  const q = quota.data?.[0];
  if (!q || !Number.isFinite(q.config?.quota_total) || q.quota_usage >= q.config.quota_total) throw Error('Publishing quota unavailable or exhausted.');
  // Exclusive persistent reservation BEFORE any write; never automatically retry a write.
  const statePath = path.join(dir, 'attempt.json');
  const state = { digest, productKey: product.productKey, accountId: account.id, stage: 'reserved', at: new Date().toISOString() };
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), { flag: 'wx' });
  const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  try {
    state.stage = 'creating'; save();
    const container = await graph(account.id + '/media', { image_url: url.href, caption: approvedCaption });
    if (!/^\d+$/.test(String(container.id))) throw Error('No container ID returned. Manual reconciliation required.');
    state.containerId = container.id; state.stage = 'processing'; save();
    let ready = false;
    for (let i = 0; i < 6; i++) {
      const status = await graph(container.id + '?fields=status_code');
      if (status.status_code === 'FINISHED') { ready = true; break; }
      if (['ERROR', 'EXPIRED', 'PUBLISHED'].includes(status.status_code)) throw Error('Unexpected container status: ' + status.status_code);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    if (!ready) throw Error('Container still processing. Reservation retained; do not create another.');
    state.stage = 'publishing'; save();
    const published = await graph(account.id + '/media_publish', { creation_id: container.id });
    if (!/^\d+$/.test(String(published.id))) throw Error('No media ID returned. Manual reconciliation required.');
    state.mediaId = published.id; state.stage = 'published'; save();
    const post = await graph(published.id + '?fields=id,permalink,media_type,timestamp');
    state.permalink = post.permalink; state.verifiedAt = new Date().toISOString(); save();
    console.log('[SUCCESS] Published exactly one feed post. Media ID: ' + published.id);
    if (typeof post.permalink === 'string' && /^https:\/\/(www\.)?instagram\.com\//.test(post.permalink)) console.log('[SUCCESS] ' + post.permalink);
  } catch (error) {
    state.needsReconciliation = true; save();
    throw error;
  }
}

main().catch(error => {
  // Never dump stack traces, request headers, URLs or remote response messages.
  const allowed = /^(Product |Publication |Usage:|Use prepare|Explicit |Confirm |Public |Missing |Invalid |Unexpected |Offer |Duplicate |Cannot |Possible |Publishing |Meta HTTP|No container|No media|Container |Missing pagination)/;
  console.error('[ERROR] ' + (allowed.test(error.message) ? error.message : 'Operation failed. Check local configuration/connectivity; any existing reservation must be reconciled before retrying.'));
  process.exitCode = 1;
});
