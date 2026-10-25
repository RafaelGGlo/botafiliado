import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { lockStatus } from '../instagram-publish/whatsapp-bot/src/bot-lock.js';
import { BotControl } from '../instagram-publish/whatsapp-bot/src/control.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(project, 'whatsapp-bot');
const lock = path.join(root, 'bot.lock');
try {
 const current = lockStatus(lock);
 if (current.state !== 'running') {
  console.log('Os bots ja estao encerrados.');
 } else {
  if (!current.token) throw Error('Processo antigo sem identificador seguro. Encerre pelo terminal original.');
  new BotControl(path.join(root, 'bot_control.json')).requestStop(current.token);
  console.log('Encerrando WhatsApp e Instagram. Aguardando as tarefas em andamento...');
  let stopped = false;
  for (let i = 0; i < 300; i++) {
   await wait(200);
   const status = lockStatus(lock);
   if (status.state !== 'running' || status.token !== current.token) { stopped = true; break; }
  }
  if (!stopped) throw Error('Parada solicitada, mas o servico ainda esta encerrando. Aguarde e consulte novamente; nenhum processo foi encerrado a forca.');
  console.log('WhatsApp e Instagram encerrados. Para ligar novamente, use INICIAR-BOTS.bat.');
 }
} catch (error) {
 console.error(error.message);
 process.exitCode = 1;
}
