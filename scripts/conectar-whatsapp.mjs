import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

if (process.argv.includes('--evolution')) {
  try { await import('./qr-evolution.mjs'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
} else {

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(project, 'whatsapp-bot');
try {
  if (Number(process.versions.node.split('.')[0]) < 24) throw Error('Use Node.js 24 ou superior.');
  const entry = path.join(project, 'instagram-publish/whatsapp-bot/src/bootstrap.js');
  const envFile = path.join(root, '.env');
  if (!fs.existsSync(entry) || !fs.existsSync(envFile)) throw Error('Arquivos ausentes. Mantenha o BAT na pasta original do projeto.');
  const env = { ...parseEnv(fs.readFileSync(envFile, 'utf8')), ...process.env, INSTAGRAM_PROJECT_ROOT: project, DASHBOARD_ENABLED: 'true' };
  // Reuse the cooperative shutdown before starting the same service in the terminal.
  await import('./encerrar-bots.mjs');
  if (process.exitCode) throw Error('Nao foi possivel encerrar o servico anterior.');
  if (process.argv.includes('--new-session')) {
    const auth = path.resolve(root, 'auth_info');
    if (path.dirname(auth) !== path.resolve(root)) throw Error('Pasta de sessao fora do projeto.');
    if (fs.existsSync(auth)) {
      if (fs.lstatSync(auth).isSymbolicLink()) throw Error('A pasta de sessao e um link. Verifique o caminho antes de renovar.');
      const backup = path.join(root, `auth_info.backup-${Date.now()}-${randomUUID()}`);
      fs.renameSync(auth, backup);
      console.log(`Sessao anterior preservada em: ${path.basename(backup)}`);
    }
    console.log('Nova sessao: aguarde o QR Code para conectar o celular.');
  }
  console.log('WhatsApp e Instagram serao iniciados juntos nesta janela.');
  console.log('No celular: WhatsApp > Aparelhos conectados > Conectar aparelho.');
  if (!process.argv.includes('--new-session')) console.log('Se ja estiver conectado, a sessao sera reutilizada sem novo QR Code.');
  console.log('Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.');
  const child = spawn(process.execPath, [entry], { cwd: root, env, stdio: 'inherit' });
  const forwardStop = () => { if (process.platform !== 'win32') child.kill('SIGINT'); };
  process.on('SIGINT', forwardStop);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 0 : 1)));
    });
  } finally {
    process.removeListener('SIGINT', forwardStop);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
}
