import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { parseEnv } from 'node:util';
import { execFile } from 'node:child_process';
import { EvolutionClient } from '../instagram-publish/whatsapp-bot/src/evolution.js';

const project = path.resolve(import.meta.dirname, '..');
const readEnv = file => fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {};
const botEnv = readEnv(path.join(project, 'whatsapp-bot/.env'));
const infraEnv = readEnv(path.join(project, 'infra/evolution/.env'));
const api = new EvolutionClient({ env: { ...process.env, ...botEnv,
 EVOLUTION_API_KEY: botEnv.EVOLUTION_API_KEY || infraEnv.EVOLUTION_API_KEY || process.env.EVOLUTION_API_KEY } });
await api.verify();
let png = null, connected = false, busy = false, stopped = false, timer, lastQrAt = 0;
let message = 'Preparando o QR Code...';
async function update() {
 if (busy || stopped) return;
 busy = true;
 try {
  let state;
  try { state = await api.state(); } catch (error) { if (error.status !== 404) throw error; }
  connected = state === 'open';
  if (connected) { png = null; message = 'WhatsApp conectado na Evolution! Nenhuma oferta foi enviada.'; }
  else if (!png || Date.now() - lastQrAt >= 25000) {
   const data = await api.connect();
   const base64 = data.base64 || data.qrcode?.base64;
   if (typeof base64 === 'string' && /^data:image\/png;base64,[a-zA-Z0-9+/=\r\n]+$/.test(base64)) {
    png = Buffer.from(base64.split(',')[1], 'base64'); lastQrAt = Date.now();
    message = 'No celular: WhatsApp > Aparelhos conectados > Conectar aparelho.';
   } else { png = null; message = 'Aguardando a Evolution gerar o QR Code. Esta pagina atualiza automaticamente.'; }
  }
 } catch (error) { png = null; message = 'Nao foi possivel gerar o QR Code. Confira se a Evolution esta funcionando.'; console.error(error.code || 'EVOLUTION_ERROR'); }
 finally { busy = false; }
}
const server = http.createServer((req, res) => {
 const port = server.address()?.port;
 if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host)) { res.writeHead(403); res.end(); return; }
 res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'");
 if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
 if (req.url === '/qr.png' && png) { res.writeHead(200,{'Content-Type':'image/png'}); res.end(png); return; }
 if (req.url === '/status') { res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ connected, qrAvailable:!!png })); return; }
 if (req.url !== '/') { res.writeHead(404); res.end(); return; }
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
 res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="8"><title>Conectar WhatsApp - Evolution</title><body><h1>WhatsApp - Evolution API</h1><p>${message}</p>${png ? '<img src="/qr.png" width="320" height="320" alt="QR Code para conectar WhatsApp">' : ''}<p>Mantenha o terminal aberto. A pagina atualiza automaticamente.</p><p>Este gerador nao inicia os bots nem envia ofertas.</p></body></html>`);
});
await new Promise((resolve,reject) => { server.once('error',reject); server.listen(3211,'127.0.0.1',resolve); });
await update(); timer = setInterval(update,5000);
console.log('QR da Evolution: http://127.0.0.1:3211');
console.log('Mantenha esta janela aberta. Ctrl+C encerra somente o gerador, sem desconectar o WhatsApp.');
if (process.platform === 'win32' && !process.argv.includes('--no-browser')) {
 execFile('powershell.exe',['-NoProfile','-Command',"Start-Process 'http://127.0.0.1:3211'"],{ windowsHide:true },() => {});
}
function stop() { stopped = true; clearInterval(timer); server.close(); server.closeAllConnections(); }
process.once('SIGINT',stop); process.once('SIGTERM',stop);
