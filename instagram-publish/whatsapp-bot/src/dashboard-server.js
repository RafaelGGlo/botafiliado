import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInstagram } from './instagram.js';
const directory = fileURLToPath(new URL('../dashboard/', import.meta.url));
const assets = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']], ['/filters.js', ['filters.js', 'text/javascript; charset=utf-8']]]);
assets.set('/whatsapp.js', ['whatsapp.js', 'text/javascript; charset=utf-8']);
assets.set('/instagram.js', ['instagram.js', 'text/javascript; charset=utf-8']);
assets.set('/instagram.css', ['instagram.css', 'text/css; charset=utf-8']);
assets.set('/feed.js', ['feed.js', 'text/javascript; charset=utf-8']);
assets.set('/feed.css', ['feed.css', 'text/css; charset=utf-8']);
assets.set('/flash-sale.js', ['flash-sale.js', 'text/javascript; charset=utf-8']);
export async function startDashboard({ getReport, port = 3210, now = Date.now, onControl, onStop, instagramOptions, whatsapp } = {}) {
 const controlToken = randomBytes(32).toString('hex');
 let instagram;
 try { instagram = createInstagram(instagramOptions); } catch { /* optional module must not block existing dashboard */ }
 const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
  // Only this signed webhook is public; all dashboard controls keep their local access checks.
  if (String(request.url).split('?')[0] === '/webhooks/instagram') {
   try {
    if (!instagram) { response.writeHead(503); response.end(); return; }
    if (request.method === 'GET') {
     const challenge = instagram.commentReplies.challenge(new URL(request.url,'http://localhost').searchParams);
     response.writeHead(challenge === null ? 403 : 200, {'Content-Type':'text/plain'}); response.end(challenge || ''); return;
    }
    if (request.method !== 'POST') { response.writeHead(405); response.end(); return; }
    const chunks=[]; let size=0;
    for await (const chunk of request) { size+=chunk.length; if(size>1048576) { response.writeHead(413); response.end(); return; } chunks.push(chunk); }
    const result=instagram.commentReplies.receive(Buffer.concat(chunks),request.headers['x-hub-signature-256']);
    response.writeHead(result.code); response.end();
   } catch { response.writeHead(503); response.end(); }
   return;
  }
  const activePort = server.address()?.port;
  const mediaMatch = /^\/instagram-media\/([a-f0-9-]{36}\.jpg)$/.exec(String(request.url).split('?')[0]);
  if (mediaMatch && ['GET','HEAD'].includes(request.method)) {
   try { const bytes = instagram.publicImage(mediaMatch[1]); response.writeHead(200, { 'Content-Type': 'image/jpeg' }); response.end(request.method === 'HEAD' ? undefined : bytes); }
   catch { response.writeHead(404); response.end(); } return;
  }
  if (['forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-real-ip'].some(h => request.headers[h] !== undefined)) { response.writeHead(403); response.end(); return; }
  if (!['127.0.0.1:' + activePort, 'localhost:' + activePort].includes(request.headers.host)) { response.writeHead(403); response.end('Acesso local necessário.'); return; }
  try {
   const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
   if (pathname.startsWith('/api/whatsapp')) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!whatsapp) { response.writeHead(503); response.end(JSON.stringify({ error: 'Inicie o bot para gerenciar o WhatsApp.' })); return; }
    try {
     let result;
     if (request.method === 'GET' && pathname === '/api/whatsapp') result = { ...whatsapp.status(), controlToken };
     else if (request.method === 'GET' && pathname === '/api/whatsapp/groups') result = { groups: await whatsapp.groups() };
     else if (request.method === 'POST' && ['/api/whatsapp/connect','/api/whatsapp/groups'].includes(pathname)) {
      if (request.headers.origin !== 'http://' + request.headers.host || request.headers['x-control-token'] !== controlToken) { response.writeHead(403); response.end(); return; }
      let text = '', size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 16384) throw Error('Requisição grande demais.'); text += chunk.toString(); }
      const body = JSON.parse(text || '{}');
      result = pathname.endsWith('/connect') ? await whatsapp.connect() : await whatsapp.select(body.selected);
     } else { response.writeHead(404); response.end('{}'); return; }
     response.end(JSON.stringify(result));
    } catch { response.writeHead(400); response.end(JSON.stringify({ error: 'Não foi possível concluir. Confira a conexão, a versão da Evolution e os grupos selecionados.' })); }
    return;
   }
   if (pathname.startsWith('/api/instagram')) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!instagram) { response.writeHead(503); response.end(JSON.stringify({ error: 'Módulo Instagram indisponível. Verifique o armazenamento.' })); return; }
    try {
     const write = !['GET','HEAD'].includes(request.method);
     if (write && (request.headers.origin !== 'http://' + request.headers.host || request.headers['x-control-token'] !== controlToken)) { response.writeHead(403); response.end(); return; }
     let body = {};
     if (write) { let text = '', size = 0; for await (const chunk of request) { size += chunk.length; if (size > 16384) throw Error('Requisição grande demais.'); text += chunk.toString(); } body = JSON.parse(text || '{}'); if (!body || Array.isArray(body) || typeof body !== 'object') throw Error('Requisição inválida.'); }
     let result;
     const match = /^\/api\/instagram\/posts\/([a-f0-9-]{36})(?:\/(image|cancel|test|publish))?$/.exec(pathname);
     const feedImage = /^\/api\/instagram\/feed\/jobs\/([a-f0-9-]{36})\/image$/.exec(pathname);
     const feedRetry = /^\/api\/instagram\/feed\/jobs\/([a-f0-9-]{36})\/retry$/.exec(pathname);
     if (request.method === 'GET' && pathname === '/api/instagram/feed') result = { controlToken, jobs: instagram.manualFeed.list(), offerIds: instagram.manualFeed.offerIds(), liveEnabled: instagram.manualFeed.enabled() };
     else if (request.method === 'POST' && pathname === '/api/instagram/feed') result = { jobs: instagram.manualFeed.enqueue(body.offerIds,body.dryRun) };
     else if (request.method === 'POST' && feedRetry) result = instagram.manualFeed.retry(feedRetry[1]);
     else if (request.method === 'GET' && feedImage) { response.setHeader('Content-Type','image/jpeg');response.end(instagram.manualFeed.image(feedImage[1]));return; }
     else if (request.method === 'GET' && pathname === '/api/instagram') result = { ...instagram.status(), controlToken, posts: instagram.list(), offers: instagram.offers() };
     else if (request.method === 'GET' && pathname === '/api/instagram/flash-sale') result = {...instagram.flashSaleBeta.status(),controlToken,offers:instagram.offers().map(o=>({id:o.id,title:o.title}))};
     else if (request.method === 'POST' && pathname === '/api/instagram/flash-sale/settings') result = instagram.flashSaleBeta.configure(body.enabled);
     else if (request.method === 'POST' && pathname === '/api/instagram/flash-sale/test') result = await instagram.flashSaleBeta.test(body.offerIds);
     else if (request.method === 'POST' && pathname === '/api/instagram/settings') result = instagram.configure(body);
     else if (request.method === 'POST' && pathname === '/api/instagram/auto') result = await instagram.autoSchedule();
     else if (request.method === 'POST' && pathname === '/api/instagram/posts') result = await instagram.save(body);
     else if (match && request.method === 'GET' && match[2] === 'image') { response.setHeader('Content-Type', 'image/jpeg'); response.end(instagram.image(match[1])); return; }
     else if (match && request.method === 'PUT' && !match[2]) result = await instagram.save(body, match[1]);
     else if (match && request.method === 'POST' && ['cancel','test','publish'].includes(match[2])) result = await instagram[match[2]](match[1]);
     else { response.writeHead(404); response.end(JSON.stringify({ error: 'Rota não encontrada.' })); return; }
     response.end(JSON.stringify(result));
    } catch (error) { response.writeHead(400); response.end(JSON.stringify({ error: /SQLITE|database|ENOENT|fetch|https|Invalid URL/i.test(error.message) ? 'Não foi possível concluir. Confira dados, imagem e configuração.' : error.message })); }
    return;
   }
   if (request.method === 'POST' && ((pathname === '/api/control' && onControl) || (pathname === '/api/stop' && onStop))) {
    const supplied = Buffer.from(String(request.headers['x-control-token'] || ''));
    if (request.headers.origin !== 'http://' + request.headers.host || supplied.length !== controlToken.length || !timingSafeEqual(supplied, Buffer.from(controlToken))) { response.writeHead(403); response.end(); return; }
    let body = '', size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 4096) { response.writeHead(413); response.end(); return; } body += chunk.toString(); }
    let result;
    try { const patch = JSON.parse(body); if (!patch || Array.isArray(patch) || typeof patch !== 'object') throw Error(); if (pathname === '/api/stop') { if (Object.keys(patch).length) throw Error(); result = await onStop(); } else result = await onControl(patch); }
    catch (error) { response.writeHead(400, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Não foi possível aplicar. Confira os valores e o arquivo de controle.' })); return; }
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result)); return;
   }
   if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
   if (pathname === '/api/report') {
    const report = await getReport();
    const payload = JSON.stringify({ ...report, serverTime: now(), stale: report.heartbeatAt ? now() - report.heartbeatAt > 30000 : false, controlsEnabled: Boolean(onControl), stopEnabled: Boolean(onStop), ...((onControl || onStop) ? { controlToken } : {}) });
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(request.method === 'HEAD' ? undefined : payload); return;
   }
   if (!assets.has(pathname)) { response.writeHead(404); response.end(); return; }
   const [file, contentType] = assets.get(pathname); const bytes = await fs.readFile(path.join(directory, file));
   response.writeHead(200, { 'Content-Type': contentType }); response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(503, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Relatório temporariamente indisponível.' })); }
 });
 await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
 return { url: 'http://127.0.0.1:' + server.address().port, syncWhatsApp: (offer, caption) => instagram?.syncWhatsApp(offer, caption), stop: async () => { await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }); await instagram?.close(); } };
}
