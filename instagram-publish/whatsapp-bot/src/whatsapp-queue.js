import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function saveJson(file, data) {
 fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
 const fd = fs.openSync(file + '.tmp', 'w', 0o600);
 try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
 fs.renameSync(file + '.tmp', file);
}
export class WhatsAppQueue {
 constructor(file, { store, ttlMs, now = Date.now }) {
  this.file = file; this.store = store; this.ttlMs = ttlMs; this.now = now; this.busy = false;
  this.jobs = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  if (!Array.isArray(this.jobs)) throw Error('Invalid WhatsApp queue');
  for (const job of this.jobs) if (job.state === 'sending') { job.state = 'uncertain'; job.reason = 'INTERRUPTED'; }
  this.save();
 }
 save() { saveJson(this.file, this.jobs); }
 enqueue(deal, image, caption, groups) {
  const at = this.now();
  this.jobs = this.jobs.filter(j => ['queued','sending','uncertain'].includes(j.state) || at - j.createdAt < this.ttlMs);
  for (const group of groups) {
   if (this.store.isDealSentToGroup(deal.id, group) || this.jobs.some(j => j.deal.id === deal.id && j.group === group && (j.state === 'uncertain' || at-j.createdAt < this.ttlMs))) continue;
   if (this.jobs.filter(j => j.state === 'queued').length >= 200) throw Error('Fila WhatsApp cheia.');
   this.jobs.push({ id: randomUUID(), deal, image: image.toString('base64'), caption, group, state: 'queued', createdAt: at });
  }
  this.save();
 }
 history() { return this.jobs.slice(-200).reverse().map(({ image, deal, caption, ...job }) => ({ ...job, dealId: deal.id, title: deal.title, price: deal.price })); }
 async drain({ canSend, selected, deliver }) {
  if (this.busy) return; this.busy = true;
  try {
   for (const job of this.jobs) {
    if (job.state !== 'queued') continue;
    if (!selected().includes(job.group)) { job.state = 'cancelled'; this.save(); continue; }
    if (this.now() - job.createdAt >= this.ttlMs || (job.deal.expiresAt && Date.parse(job.deal.expiresAt) <= this.now())) { job.state = 'expired'; this.save(); continue; }
    if (this.store.isDealSentToGroup(job.deal.id, job.group)) { job.state = 'skipped'; this.save(); continue; }
    if (!canSend()) break;
    job.state = 'sending'; this.save();
    try {
     const result = await deliver(job, Buffer.from(job.image, 'base64'));
     job.state = result?.type === 'sent' ? 'sent' : result ? 'uncertain' : 'queued';
     job.reason = result?.reason; job.updatedAt = this.now();
    } catch { job.state = 'uncertain'; job.reason = 'DELIVERY_ERROR'; }
    this.save();
   }
  } finally { this.busy = false; }
 }
}
