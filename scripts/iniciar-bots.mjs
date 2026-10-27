import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { acquireLock, lockStatus } from '../instagram-publish/whatsapp-bot/src/bot-lock.js';
import { assertDashboardOwner } from '../instagram-publish/whatsapp-bot/src/runtime-health.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(project, 'whatsapp-bot');
const lock = path.join(root, 'bot.lock');
let launchLock, out, err;
try {
 if (Number(process.versions.node.split('.')[0]) < 24) throw Error('Use Node.js 24 ou superior.');
 const envFile = path.join(root, '.env');
 const entry = path.join(project, 'instagram-publish/whatsapp-bot/src/bootstrap.js');
 if (!fs.existsSync(envFile) || !fs.existsSync(entry)) throw Error('Arquivos do projeto ausentes. Mantenha o BAT na pasta original.');
 const env = { ...parseEnv(fs.readFileSync(envFile, 'utf8')), ...process.env, INSTAGRAM_PROJECT_ROOT: project, DASHBOARD_ENABLED: 'true' };
 const port = Number(env.DASHBOARD_PORT || 3210);
 if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw Error('DASHBOARD_PORT invalida.');
 const base = `http://127.0.0.1:${port}`;
 if (lockStatus(lock).state === 'running') {
  const response = await fetch(base + '/api/report', { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw Error('O bot esta ativo, mas seu painel nao esta disponivel.');
  assertDashboardOwner(await response.json(), lockStatus(lock).pid);
  console.log('O servico de WhatsApp e Instagram ja esta em execucao. Nenhuma instancia duplicada foi iniciada.');
 } else {
  launchLock = acquireLock(path.join(root, 'bot-start.lock'));
  if (lockStatus(lock).state === 'running') {
   const response = await fetch(base + '/api/report', { signal: AbortSignal.timeout(3000) });
   if (!response.ok) throw Error('O bot esta ativo, mas seu painel nao esta disponivel.');
   assertDashboardOwner(await response.json(), lockStatus(lock).pid);
   console.log('Os bots ja foram iniciados por outra janela.');
  } else {
   out = fs.openSync(path.join(root, 'bot-output.log'), 'a');
   err = fs.openSync(path.join(root, 'bot-error.log'), 'a');
   const child = spawn(process.execPath, [entry], { cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', out, err] });
   let failure;
   child.on('error', () => { failure = true; });
   child.on('exit', () => { failure = true; });
   child.unref();
   let started = false;
   for (let i = 0; i < 100; i++) {
    await wait(200);
    if (failure) break;
    const current = lockStatus(lock);
    if (current.state === 'running' && current.pid === child.pid) {
     try {
      const response = await fetch(base + '/api/report', { signal: AbortSignal.timeout(1000) });
      if (response.ok) { assertDashboardOwner(await response.json(), child.pid); started = true; break; }
     } catch { /* Wait for dashboard initialization. */ }
    }
   }
   if (!started) throw Error('Inicializacao nao confirmada. Consulte whatsapp-bot/bot-error.log antes de tentar novamente.');
   console.log('WhatsApp e Instagram iniciados juntos em segundo plano.');
  }
 }
 console.log('Painel: ' + base);
 console.log('Logs: whatsapp-bot/bot-output.log e bot-error.log');
} catch (error) {
 console.error(error.message);
 process.exitCode = 1;
} finally {
 if (out !== undefined) fs.closeSync(out);
 if (err !== undefined) fs.closeSync(err);
 launchLock?.release();
}
