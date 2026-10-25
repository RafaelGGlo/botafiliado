// Evolution API 2.3.7. Credentials and upstream error bodies never reach the panel.
export class EvolutionClient {
 constructor({ env = process.env, request = fetch } = {}) {
  this.url = new URL(env.EVOLUTION_API_URL || 'http://127.0.0.1:8080');
  if (!['http:', 'https:'].includes(this.url.protocol) || this.url.username || this.url.password) throw Error('Invalid EVOLUTION_API_URL');
  if (this.url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(this.url.hostname)) throw Error('Remote Evolution requires HTTPS');
  this.key = env.EVOLUTION_API_KEY; this.instance = env.EVOLUTION_INSTANCE || 'ofertas';
  if (!this.key || !/^[a-zA-Z0-9_-]{1,80}$/.test(this.instance)) throw Error('Configure EVOLUTION_API_KEY and EVOLUTION_INSTANCE');
  this.expected = env.EVOLUTION_API_VERSION || '2.3.7'; this.request = request; this.version = null;
 }
 async call(route, method = 'GET', body) {
  let response;
  try { response = await this.request(new URL(route, this.url), { method, headers: { apikey: this.key, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000), redirect: 'error' }); }
  catch { throw Object.assign(Error('Evolution indisponível ou resposta incerta.'), { code: 'EVOLUTION_NETWORK' }); }
  if (!response.ok) throw Object.assign(Error(`Evolution HTTP ${response.status}`), { code: 'EVOLUTION_HTTP_' + response.status, status: response.status });
  try { return await response.json(); } catch { throw Object.assign(Error('Resposta Evolution inválida.'), { code: 'EVOLUTION_RESPONSE' }); }
 }
 async verify() {
  const info = await this.call('/'); this.version = String(info.version || '').replace(/^v/, '');
  if (this.version !== this.expected) throw Object.assign(Error('Versão Evolution incompatível com a configurada.'), { code: 'EVOLUTION_VERSION' });
 }
 async state() { const data = await this.call(`/instance/connectionState/${this.instance}`); return data.instance?.state || 'close'; }
 async connect() {
  await this.verify();
  try { await this.state(); } catch (error) {
   if (error.status !== 404) throw error;
   await this.call('/instance/create', 'POST', { instanceName: this.instance, integration: 'WHATSAPP-BAILEYS', qrcode: true });
  }
  return this.call(`/instance/connect/${this.instance}`);
 }
 async groups() {
  const rows = await this.call(`/group/fetchAllGroups/${this.instance}?getParticipants=false`);
  if (!Array.isArray(rows)) throw Error('Resposta de grupos inválida.');
  return rows.map(row => ({ id: row.id, name: String(row.subject || row.id).slice(0,200) }));
 }
 async sendMessage(number, { image, caption }) {
  if (!/^\d+(?:-\d+)?@g\.us$/.test(number) || !Buffer.isBuffer(image)) throw Error('Invalid group or media');
  const mimetype = image[0] === 137 ? 'image/png' : image.subarray(0,4).toString() === 'RIFF' ? 'image/webp' : 'image/jpeg';
  const result = await this.call(`/message/sendMedia/${this.instance}`, 'POST', { number, mediatype: 'image', mimetype, media: image.toString('base64'), caption });
  if (!result.key?.id) throw Object.assign(Error('Envio sem identificação; verifique o histórico.'), { code: 'EVOLUTION_UNCERTAIN' });
  return result;
 }
}

export async function connectEvolution(logger, onReady, onState = () => {}, options) {
 const api = new EvolutionClient(options);
 let online = false, stopped = false, timer, busy = false, error = null;
 async function poll() {
  if (busy || stopped) return; busy = true;
  try {
   await api.verify(); const state = await api.state();
   const wasOnline = online; online = state === 'open'; error = null;
   onState(online ? 'online' : 'offline'); if (online && !wasOnline) onReady?.();
  } catch (e) { online = false; error = e.code || 'EVOLUTION_ERROR'; onState('offline'); }
  finally { busy = false; }
 }
 await poll(); timer = setInterval(poll, 10000); timer.unref?.();
 return { getSocket: () => online && !stopped ? api : null,
  status: () => ({ provider: 'evolution', online, version: api.version, expectedVersion: api.expected, error }),
  connect: () => api.connect(), groups: () => api.groups(),
  stop: async () => { stopped = true; online = false; clearInterval(timer); onState('offline'); } };
}
