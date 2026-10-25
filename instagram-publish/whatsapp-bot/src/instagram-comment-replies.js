import { createHmac, timingSafeEqual } from 'node:crypto';
import { marketplaceUrl } from './affiliates.js';

const id = value => typeof value === 'string' && /^\d+$/.test(value);
const equal = (a, b) => { const x=Buffer.from(a), y=Buffer.from(b); return x.length === y.length && timingSafeEqual(x,y); };
export const wantsLink = text => typeof text === 'string' && /^[\s"'\u201c\u201d\u2018\u2019]*q+uero[\s!.,?"'\u201c\u201d\u2018\u2019]*$/iu.test(text.trim());
export function privateReplyText(productLink, groupLink = '') {
 const link = marketplaceUrl(productLink, 'shopee');
 let text = 'Aqui esta o link de afiliado do produto que voce pediu:\n' + link;
 if (groupLink) {
  const group = new URL(groupLink);
  if (group.protocol !== 'https:' || group.hostname !== 'chat.whatsapp.com' || group.port || group.username || group.password || !/^\/[a-zA-Z0-9]{10,64}\/?$/.test(group.pathname) || group.hash || group.search) throw Error('Invalid WhatsApp group invite URL');
  text += '\n\nQuer receber mais ofertas? Entre no nosso grupo do WhatsApp:\n' + group.href;
 }
 if (text.length > 1000) throw Error('Private reply too long');
 return text;
}
export function validWebhookSignature(bytes, signature, secret) {
 if (!secret || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
 return equal(signature, 'sha256=' + createHmac('sha256',secret).update(bytes).digest('hex'));
}

// No credentials or external subscriptions are changed here. Activation is explicit.
export function createCommentReplies({ db, env = process.env, graph, now = Date.now, onEvent = () => {} }) {
 db.exec(`CREATE TABLE IF NOT EXISTS ig_comment_replies (
  comment_id TEXT PRIMARY KEY, media_id TEXT NOT NULL, received_at INTEGER NOT NULL,
  state TEXT NOT NULL, reason TEXT, message_id TEXT
 );`);
 db.prepare("UPDATE ig_comment_replies SET state='uncertain',reason='process_interrupted' WHERE state='reserved'").run();
 let busy = false, closed = false;
 const enabled = () => env.INSTAGRAM_COMMENT_DM_ENABLED === 'true';
 const configured = () => Boolean(env.INSTAGRAM_APP_SECRET && env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN && env.INSTAGRAM_ACCESS_TOKEN && id(env.INSTAGRAM_ACCOUNT_ID) && /^v\d+\.0$/.test(env.INSTAGRAM_API_VERSION || '') && env.INSTAGRAM_LOGIN_TYPE === 'instagram');
 const live = () => enabled() && configured() && env.INSTAGRAM_LIVE_APPROVED === 'true' && env.INSTAGRAM_TEST_MODE === 'false';
 const status = () => ({ blockers: [
  !enabled() && 'feature_disabled',
  !env.INSTAGRAM_APP_SECRET && 'app_secret_missing',
  !env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN && 'verify_token_missing',
  !env.INSTAGRAM_ACCESS_TOKEN && 'access_token_missing',
  !id(env.INSTAGRAM_ACCOUNT_ID) && 'account_id_invalid',
  !/^v\d+\.0$/.test(env.INSTAGRAM_API_VERSION || '') && 'api_version_invalid',
  env.INSTAGRAM_LOGIN_TYPE !== 'instagram' && 'instagram_login_required',
  env.INSTAGRAM_LIVE_APPROVED !== 'true' && 'live_not_approved',
  env.INSTAGRAM_TEST_MODE !== 'false' && 'test_mode'
 ].filter(Boolean), enabled: enabled(), configured: configured(), live: live(), loginSupported: env.INSTAGRAM_LOGIN_TYPE === 'instagram', counts: db.prepare('SELECT state, count(*) AS count FROM ig_comment_replies GROUP BY state').all() });
 function challenge(params) {
  if (!enabled() || !configured() || params.get('hub.mode') !== 'subscribe' || !equal(params.get('hub.verify_token') || '',env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN)) return null;
  const value=params.get('hub.challenge'); return value && value.length <= 512 ? value : null;
 }
 function receive(bytes, signature) {
  if (!enabled() || !configured()) return { code: 503 };
  if (!validWebhookSignature(bytes,signature,env.INSTAGRAM_APP_SECRET)) return { code: 403 };
  let payload; try { payload=JSON.parse(bytes.toString('utf8')); } catch { return { code: 400 }; }
  if (payload?.object !== 'instagram' || !Array.isArray(payload.entry)) return { code: 400 };
  // Persist before acknowledging Meta. Replayed events cannot enqueue twice.
  db.exec('BEGIN IMMEDIATE');
  try {
   let pending=db.prepare("SELECT count(*) AS n FROM ig_comment_replies WHERE state='queued'").get().n;
   for (const entry of payload.entry) {
    if (entry?.id !== env.INSTAGRAM_ACCOUNT_ID || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
     const v=change?.value;
     if (change?.field !== 'comments' || !id(v?.id) || !id(v?.media?.id) || !wantsLink(v?.text) || v?.from?.id === env.INSTAGRAM_ACCOUNT_ID || v?.parent_id) continue;
     if (!db.prepare('SELECT 1 FROM ig_posts WHERE published_id=? AND status=\'published\' AND format=\'feed\'').get(v.media.id)) continue;
     if (db.prepare('SELECT 1 FROM ig_comment_replies WHERE comment_id=?').get(v.id)) continue;
     if (pending >= 1000) throw Error('queue_full');
     const result=db.prepare("INSERT OR IGNORE INTO ig_comment_replies VALUES(?,?,?,'queued',NULL,NULL)").run(v.id,v.media.id,now()); pending+=result.changes;
    }
   }
   db.exec('COMMIT'); return { code: 200 };
  } catch (error) { db.exec('ROLLBACK'); if (error.message === 'queue_full') return { code: 503 }; throw error; }
 }
 function finish(commentId,state,reason,messageId=null) {
  db.prepare('UPDATE ig_comment_replies SET state=?,reason=?,message_id=? WHERE comment_id=?').run(state,reason,messageId,commentId);
  onEvent({ commentId, state, reason });
 }
 async function processNext() {
  if (busy || closed || !live()) return;
  busy=true;
  try {
   const row=db.prepare("SELECT * FROM ig_comment_replies WHERE state='queued' ORDER BY received_at LIMIT 1").get();
   if (!row) return;
   if (!db.prepare("UPDATE ig_comment_replies SET state='reserved' WHERE comment_id=? AND state='queued'").run(row.comment_id).changes) return;
   try {
    const post=db.prepare("SELECT snapshot FROM ig_posts WHERE published_id=? AND status='published' AND format='feed'").get(row.media_id);
    if (!post) { finish(row.comment_id,'skipped','post_unavailable'); return; }
    const offer=JSON.parse(post.snapshot);
    if (offer.testOnly || (offer.expiresAt && (!Number.isFinite(Date.parse(offer.expiresAt)) || Date.parse(offer.expiresAt)<=now()))) { finish(row.comment_id,'skipped','offer_unavailable'); return; }
    const link=marketplaceUrl(offer.affiliateUrl,'shopee');
    const text=privateReplyText(link, env.INSTAGRAM_DM_GROUP_URL || '');
    // Read current comment from Meta: webhook receipt time is NOT comment creation time.
    const comment=await graph(row.comment_id+'?fields=id,text,timestamp,media');
    const created=Date.parse(comment.timestamp);
    if (comment.id !== row.comment_id || comment.media?.id !== row.media_id || !wantsLink(comment.text) || !Number.isFinite(created) || created>now() || now()-created>=7*86400000) { finish(row.comment_id,'skipped','comment_invalid_or_expired'); return; }
    if (!live()) { finish(row.comment_id,'skipped','disabled'); return; }
    const result=await graph(env.INSTAGRAM_ACCOUNT_ID+'/messages','POST',{recipient:{comment_id:row.comment_id},message:{text}});
    if (typeof result.message_id !== 'string' || !result.message_id.trim() || result.message_id.length > 512) throw Error('invalid_confirmation');
    finish(row.comment_id,'sent',null,result.message_id);
   } catch { finish(row.comment_id,'uncertain','verify_in_meta_before_retry'); }
  } finally { busy=false; }
 }
 const timer=setInterval(()=>{ void processNext().catch(()=>{}); },5000); timer.unref();
 return { status, challenge, receive, processNext, async close() { closed=true; clearInterval(timer); while(busy) await new Promise(resolve=>setTimeout(resolve,20)); } };
}
