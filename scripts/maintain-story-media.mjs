import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { projectRoot, stateRoot } from '../instagram-publish/whatsapp-bot/src/runtime-paths.js';
import { lockStatus } from '../instagram-publish/whatsapp-bot/src/bot-lock.js';
export function cleanPublishedMedia(dir, { now = Date.now(), retentionDays = 30, apply = false } = {}) {
 const file=path.join(dir,'outbox.sqlite');
 if(!fs.existsSync(file)) return {eligible:0,removed:0};
 const db=new DatabaseSync(file,{readOnly:true});let eligible=0,removed=0;
 try {
  // Receipts, payloads and idempotency keys are never removed.
  for(const row of db.prepare("SELECT key FROM stories WHERE status='published'").all()) {
   if(!/^[a-f0-9]{64}$/.test(row.key)) continue;
   const image=path.join(dir,row.key+'.jpg');if(!fs.existsSync(image)) continue;
   const stat=fs.lstatSync(image);
   if(stat.isSymbolicLink() || !stat.isFile() || now-stat.mtimeMs < retentionDays*86400000) continue;
   eligible++;if(apply){fs.unlinkSync(image);removed++;}
  }
  return {eligible,removed};
 } finally {db.close();}
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
 if(lockStatus(path.join(stateRoot,'bot.lock')).state==='running') throw Error('Pare o bot antes da manutenção.');
 console.log(JSON.stringify(cleanPublishedMedia(path.join(projectRoot,'instagram-publisher/state'),{apply:process.argv.includes('--apply')})));
}
