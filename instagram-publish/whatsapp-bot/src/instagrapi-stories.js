import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { promotionalImage } from './instagram-image.js';

const project = path.resolve(import.meta.dirname, '../../..');
export function pythonPublisher(payload, { env = process.env } = {}) {
 return new Promise(resolve => {
  const child = spawn(env.INSTAGRAM_PYTHON || path.join(project, 'instagram-publisher/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
   [path.join(project, 'instagram-publisher/publisher.py'), 'publish'],
   { cwd: project, env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  let output = '', completed = false;
  const finish = result => { if (!completed) { completed = true; clearTimeout(timer); resolve(result); } };
  const timer = setTimeout(() => { child.kill(); finish({ status: 'uncertain', error: 'publisher_timeout' }); }, 180000);
  child.on('error', () => finish({ status: 'retryable', error: 'python_unavailable' }));
  child.stdout.on('data', data => { output += data; if (output.length > 65536) child.kill(); });
  child.on('close', () => { try { finish(JSON.parse(output)); } catch { finish({ status: 'uncertain', error: 'publisher_result_missing' }); } });
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify(payload));
 });
}

export function createStoryPublisher({ dir = path.join(project, 'instagram-publisher/state'), publish = pythonPublisher,
 makeImage = promotionalImage, now = Date.now, onStatus = () => {}, recoverInterrupted = false } = {}) {
 fs.mkdirSync(dir, { recursive: true });
 const db = new DatabaseSync(path.join(dir, 'outbox.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS stories (key TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, error TEXT, story_id TEXT, link_verified INTEGER);`);
 if (recoverInterrupted) db.exec("UPDATE stories SET status='uncertain',error='interrupted_publication' WHERE status='publishing'");
 const keyFor = offer => createHash('sha256').update(String(offer.id)).digest('hex');
 let active = Promise.resolve();
 function serial(fn) { const task = active.then(fn); active = task.catch(() => {}); return task; }
 async function stage(offer, image, caption) {
  const key = keyFor(offer);
  if (db.prepare('SELECT key FROM stories WHERE key=?').get(key)) return key;
  if (!offer.affiliateUrl) throw Error('Affiliate URL required for Story');
  // Reuse the exact downloaded WhatsApp product image. Leave the native sticker area clear.
  const bytes = await makeImage({ ...offer, affiliateUrl: null, affiliate_link: null }, 'story', image, 'promotional', { nativeLink: true });
  const imagePath = path.join(dir, key + '.jpg');
  fs.writeFileSync(imagePath, bytes, { mode: 0o600 });
  const payload = { key, offerId: offer.id, imagePath, affiliateUrl: offer.affiliateUrl, caption, title: offer.title, price: offer.price };
  db.prepare("INSERT OR IGNORE INTO stories(key,payload,status) VALUES(?,?,'prepared')").run(key, JSON.stringify(payload));
  return key;
 }
 async function attempt(key) {
  const row = db.prepare('SELECT * FROM stories WHERE key=?').get(key);
  if (!row || !['pending','retryable'].includes(row.status) || row.next_at > now() || row.attempts >= 3) return row;
  const claimed = db.prepare("UPDATE stories SET status='publishing',attempts=attempts+1 WHERE key=? AND status IN ('pending','retryable')").run(key);
  if (!claimed.changes) return;
  let result;
  try { result = await publish(JSON.parse(row.payload)); }
  catch { result = { status: 'uncertain', error: 'publisher_exception' }; }
  if (!['published','retryable','blocked','uncertain','failed'].includes(result?.status)) result = { status: 'uncertain', error: 'invalid_result' };
  db.prepare('UPDATE stories SET status=?,error=?,story_id=?,link_verified=?,next_at=? WHERE key=?')
   .run(result.status, result.error || null, result.storyId || null, result.linkVerified ? 1 : 0, now() + 60000 * 2 ** row.attempts, key);
  onStatus({ key, ...result });
  return result;
 }
 function confirmed(offer) {
  const key = keyFor(offer);
  db.prepare("UPDATE stories SET status='pending' WHERE key=? AND status='prepared'").run(key);
  return serial(() => attempt(key));
 }
 function retry() { return serial(async () => {
  for (const row of db.prepare("SELECT key FROM stories WHERE status IN ('pending','retryable') AND next_at<=? AND attempts<3").all(now())) await attempt(row.key);
 }); }
 function recoverConfirmed(store) {
  for (const row of db.prepare("SELECT key,payload FROM stories WHERE status='prepared'").all()) {
   if (store.hasConfirmedDelivery(JSON.parse(row.payload).offerId)) db.prepare("UPDATE stories SET status='pending' WHERE key=? AND status='prepared'").run(row.key);
  }
 }
 function resetSafeRetries() { db.prepare("UPDATE stories SET attempts=0,next_at=0 WHERE status='retryable'").run(); }
 return { stage, confirmed, retry, recoverConfirmed, resetSafeRetries, list: () => db.prepare('SELECT key,status,attempts,error,story_id,link_verified FROM stories').all(), close: async () => { await active; db.close(); } };
}
