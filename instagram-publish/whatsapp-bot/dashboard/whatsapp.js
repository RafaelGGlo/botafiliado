const panel = document.createElement('section');
panel.className = 'card'; panel.id = 'whatsapp';
panel.innerHTML = `<h2>WhatsApp • Evolution API</h2><p id="waStatus" role="status">Consultando conexão…</p>
<button class="button" id="waConnect">Conectar / renovar QR Code</button>
<button class="button" id="waGroups">Consultar grupos</button>
<p>Selecione os grupos que receberão ofertas. Salvar uma seleção vazia suspende os destinos.</p>
<img id="waQr" alt="QR Code para conectar o WhatsApp" width="260" hidden>
<form id="waForm"><div id="waChoices"></div><button class="button" type="submit">Salvar seleção</button></form>
<p id="waMessage" role="status"></p><h3>Fila e resultados por grupo</h3><p>“Enviado” indica aceite pela API. Envios incertos ficam bloqueados para evitar repetição.</p><div id="waHistory"></div>`;
document.querySelector('main').append(panel);
let token, selected = [];
const el = id => document.getElementById(id);
async function api(route = '', body) {
 const res = await fetch('/api/whatsapp' + route, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Control-Token': token }, body: JSON.stringify(body) });
 const data = await res.json(); if (!res.ok) throw Error(data.error || 'Falha na operação.'); return data;
}
async function refresh() {
 try {
  const data = await api(); token = data.controlToken; selected = data.selected;
  el('waStatus').textContent = `${data.provider} • ${data.online ? 'Conectado' : 'Desconectado'}${data.version ? ' • API ' + data.version : ''}${data.error ? ' • ' + data.error : ''}`;
  if (data.online) { el('waQr').hidden = true; el('waQr').removeAttribute('src'); }
  el('waConnect').disabled = el('waGroups').disabled = data.provider !== 'evolution';
  el('waHistory').replaceChildren(...data.history.map(job => {
   const row = document.createElement('p');
   row.textContent = `${job.title || job.dealId} | ${job.group} | ${job.state}${job.reason ? ' • ' + job.reason : ''}`; return row;
  }));
 } catch (error) { el('waStatus').textContent = error.message; }
}
async function act(fn) { try { el('waMessage').textContent = ''; await fn(); } catch (error) { el('waMessage').textContent = error.message; } }
el('waConnect').onclick = () => act(async () => {
 const data = await api('/connect', {}); const qr = data.base64 || data.qrcode?.base64;
 if (typeof qr === 'string' && /^data:image\/png;base64,[a-zA-Z0-9+/=\r\n]+$/.test(qr)) { el('waQr').src = qr; el('waQr').hidden = false; el('waMessage').textContent = 'Escaneie em WhatsApp > Aparelhos conectados. Se expirar, renove o QR Code.'; }
 else el('waMessage').textContent = 'QR ainda indisponível ou instância já conectada. Consulte o status e tente novamente.';
 await refresh();
});
el('waGroups').onclick = () => act(async () => {
 const { groups } = await api('/groups');
 el('waChoices').replaceChildren(...groups.map(group => {
  const label = document.createElement('label'), input = document.createElement('input');
  input.type = 'checkbox'; input.value = group.id; input.checked = selected.includes(group.id);
  label.append(input, document.createTextNode(` ${group.name} (${group.id}) `)); return label;
 }));
 el('waChoices').dataset.loaded = 'true';
});
el('waForm').onsubmit = event => { event.preventDefault(); void act(async () => {
 if (!el('waChoices').dataset.loaded) throw Error('Consulte os grupos antes de salvar.');
 await api('/groups', { selected: [...el('waChoices').querySelectorAll('input:checked')].map(input => input.value) });
 el('waMessage').textContent = 'Seleção salva.'; await refresh();
}); };
await refresh(); setInterval(refresh, 10000);
