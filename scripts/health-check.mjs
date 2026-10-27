import fs from 'node:fs';
import path from 'node:path';
import { stateRoot } from '../instagram-publish/whatsapp-bot/src/runtime-paths.js';
export function health(report, now = Date.now()) {
 const reasons = [];
 if (!Number.isFinite(report.heartbeatAt) || now - report.heartbeatAt > 30000 || report.heartbeatAt > now + 5000) reasons.push('heartbeat_stale');
 if (report.connection !== 'online') reasons.push('whatsapp_offline');
 if (['stopped','stopping','control_error','not_started'].includes(report.status)) reasons.push('bot_not_ready');
 const latest = new Map();
 for (const event of report.instagramStories || []) if (!latest.has(event.key)) latest.set(event.key,event);
 if ([...latest.values()].some(e=>['blocked','uncertain','failed'].includes(e.status))) reasons.push('instagram_requires_review');
 return { healthy: reasons.length === 0, reasons };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
 try {
  const result = health(JSON.parse(fs.readFileSync(path.join(stateRoot,'bot_report.json'),'utf8')));
  console.log(JSON.stringify(result));process.exitCode = result.healthy ? 0 : 1;
 } catch { console.log(JSON.stringify({healthy:false,reasons:['report_unavailable']}));process.exitCode=1; }
}
