import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { projectRoot, stateRoot } from './runtime-paths.js';

if (Number(process.versions.node.split('.')[0]) < 24) throw Error('Use Node.js 24 ou superior.');
const legacy = path.join(projectRoot, 'instagram-publish/whatsapp-bot');
// Do not silently abandon old locks or delivery receipts when upgrading.
for (const name of ['.env', 'bot.lock', 'sent_deals.json', 'whatsapp_queue.json', 'whatsapp_groups.json', 'bot_control.json', 'send_schedule.json', 'failed_deals.json', 'auth_info', 'instagram.sqlite', 'instagram.sqlite-wal', 'instagram.sqlite-shm', 'instagram-media']) {
 if (fs.existsSync(path.join(legacy, name))) throw Error('Estado legado em instagram-publish/whatsapp-bot. Pare a instância antiga, faça backup e migre o estado antes de iniciar.');
}
const envFile = path.join(stateRoot, '.env');
if (fs.existsSync(envFile)) {
 const values = parseEnv(fs.readFileSync(envFile, 'utf8'));
 for (const [name, value] of Object.entries(values)) if (process.env[name] === undefined) process.env[name] = value;
}
process.env.INSTAGRAM_PROJECT_ROOT = projectRoot;
process.chdir(stateRoot);
