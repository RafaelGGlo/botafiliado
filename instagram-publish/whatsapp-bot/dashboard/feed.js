
import { applyTheme, resolveTheme, filterActivity, feedStatusText } from './filters.js';
// Build the shell before feed controls and the dependent app attach listeners.
const tabs = [['operacao','Operação','M3 12h4l3-8 4 16 3-8h4'],['ofertas','Ofertas','M4 4h9l7 7-9 9-7-7Z'],['instagram','Instagram','M4 4h16v16H4ZM8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0'],['historico','Histórico','M4 6h16M4 12h16M4 18h10'],['relampago','Relâmpago (beta)','m13 2-9 12h7l-1 8 10-12h-7Z'],['configuracoes','Configurações','M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4']];
const main=document.querySelector('main'), footer=document.querySelector('.page-footer'), panels={};
if(main?.insertBefore){
 for(const [key] of tabs){const panel=document.createElement('div');panel.id=key+'Panel';panel.className='tab-panel';panels[key]=panel;main.insertBefore(panel,footer);}
 for(const sel of ['.controls-card','.metrics','.operation-grid']) panels.operacao.append(document.querySelector(sel));
 const settings=document.createElement('section');settings.className='card settings-interval';settings.innerHTML='<h2>Intervalo entre envios</h2>';settings.append(document.getElementById('intervalForm'));panels.configuracoes.append(settings,document.querySelector('.category-card'),document.querySelector('.offer-filter-card'));
 panels.ofertas.append(document.querySelector('.latest-card'),document.querySelector('.search-grid'));
 panels.historico.append(document.getElementById('activity'));
 document.querySelector('.page-heading').after(document.getElementById('controlFeedback'));
 const feedPanel=document.createElement('section');feedPanel.id='feedPanel';feedPanel.className='card';feedPanel.innerHTML='<h2>Publicação manual no feed</h2><p>Selecione ofertas para revisar e publicar no Instagram.</p><div id="feedSelection"></div>';panels.instagram.append(feedPanel);
 const nav=document.querySelector('nav');nav.id='panelNav';nav.replaceChildren();
 for(const [key,title,path] of tabs){const a=document.createElement('a');a.href='#'+key;a.className='nav-item';a.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';a.append(document.createTextNode(title));nav.append(a);}
 const aliases={overview:'operacao',activity:'historico','flash-settings':'relampago'};
 function navigate(){let saved;try{saved=localStorage.getItem('radar-tab')}catch{}let key=location.hash.slice(1)||saved||'operacao';key=aliases[key]||key;if(!panels[key])key='operacao';for(const [id,panel]of Object.entries(panels))panel.hidden=id!==key;for(const a of nav.children){const active=a.hash==='#'+key;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}const title=tabs.find(t=>t[0]===key)[1];document.querySelector('h1').textContent=key==='ofertas'?'Ofertas encontradas':title;document.querySelector('.page-heading').hidden=key==='operacao';document.getElementById('controlFeedback').hidden=!['operacao','configuracoes'].includes(key);document.querySelector('.breadcrumb strong').textContent=title;document.querySelector('.subtitle').textContent={ofertas:'Ofertas elegíveis da última busca.',instagram:'Calendário e publicação manual no Instagram.',historico:'Consulte e exporte os últimos 200 eventos.',configuracoes:'Intervalo, categoria da próxima busca e filtros.',relampago:'Verificação experimental, somente testes.'}[key]||'';document.title=title+' · Radar Shopee';if(location.hash!=='#'+key)history.replaceState(null,'','#'+key);try{localStorage.setItem('radar-tab',key)}catch{}document.querySelector('.sidebar').classList.remove('menu-open');document.getElementById('menuToggle').setAttribute('aria-expanded','false');}
 window.addEventListener('hashchange',navigate);navigate();
 document.getElementById('menuToggle').onclick=()=>{const open=document.querySelector('.sidebar').classList.toggle('menu-open');document.getElementById('menuToggle').setAttribute('aria-expanded',String(open));};
 window.confirmPanel=text=>new Promise(resolve=>{const dialog=document.getElementById('confirmAction');if(dialog.open){resolve(false);return;}document.getElementById('confirmText').textContent=text;dialog.returnValue='cancel';dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true});dialog.showModal();});
 const themes=document.createElement('div');themes.className='segments';themes.setAttribute('aria-label','Tema');
 for(const [theme,title]of [['dark','Escuro'],['light','Claro']]){const b=document.createElement('button');b.textContent=title;b.dataset.theme=theme;b.type='button';b.onclick=()=>{let storage;try{storage=localStorage}catch{}applyTheme(theme,document.documentElement,storage);syncTheme();};themes.append(b);}
 function syncTheme(){for(const b of themes.children)b.setAttribute('aria-pressed',String(b.dataset.theme===document.documentElement.dataset.theme));}
 let saved;try{saved=localStorage.getItem('radar-tema')}catch{}document.documentElement.dataset.theme=resolveTheme(saved,matchMedia('(prefers-color-scheme: dark)').matches);syncTheme();document.querySelector('.top-right').append(themes);
 matchMedia('(prefers-color-scheme: dark)').addEventListener('change',e=>{let choice;try{choice=localStorage.getItem('radar-tema')}catch{}if(!['dark','light'].includes(choice)){document.documentElement.dataset.theme=resolveTheme(null,e.matches);syncTheme();}});
 const emergency=document.createElement('button');emergency.id='emergencyPause';emergency.hidden=true;document.querySelector('.topbar').append(emergency);
 const connections=document.createElement('div');connections.id='connections';panels.operacao.prepend(connections);
 const results=document.createElement('div');results.className='results-heading';results.innerHTML='<h2>Resultados</h2><div class="segments" id="periodButtons"><button data-period="today">Hoje</button><button data-period="7d">7 dias</button><button data-period="all" aria-pressed="true">Total</button></div><select id="metricPeriod" hidden aria-label="Período dos resultados"><option value="all">Total</option><option value="today">Hoje</option><option value="7d">7 dias</option></select>';
 document.querySelector('.metrics').before(results);
 const note=document.createElement('p');note.id='periodNote';note.className='muted period-note';document.querySelector('.metrics').after(note);
 document.querySelector('.metric>span').id='yieldRate';
 const graph=document.createElement('article');graph.className='card chart-card';graph.innerHTML='<h2>Envios por horário</h2><div id="charts"></div>';
 const failures=document.createElement('article');failures.className='card failures-card';failures.innerHTML='<h2>Últimas falhas</h2><ul id="failures"></ul>';
 const grid=document.querySelector('.operation-grid');grid.append(graph,failures);const connection=document.querySelector('.connection-card');connection.classList.add('bot-details');panels.operacao.append(connection);
 let latestReport,instagramStatus='Aguardando estado',instagramColor='yellow';
 document.addEventListener('instagram-status',e=>{instagramStatus=e.detail.unavailable?'Módulo indisponível':e.detail.configured?'Credenciais configuradas; conexão não verificada':'Credenciais pendentes';instagramColor=e.detail.unavailable?'red':'yellow';if(latestReport)window.renderInsights(latestReport);});
 document.getElementById('metricPeriod').onchange=()=>{if(latestReport)window.renderInsights(latestReport);};
 for(const b of document.getElementById('periodButtons').children)b.onclick=()=>{document.getElementById('metricPeriod').value=b.dataset.period;if(latestReport)window.renderInsights(latestReport);};
 window.renderInsights=report=>{
  latestReport=report;const el=id=>document.getElementById(id),period=el('metricPeriod').value,timezone=report.settings?.timezone||'America/Sao_Paulo',now=report.serverTime||Date.now(),events=filterActivity(report.activity,{period},{now,timezone}),totals=report.totals||{},format=n=>Number(n||0).toLocaleString('pt-BR'),hasData=Boolean(report.startedAt);
  for(const b of el('periodButtons').children)b.setAttribute('aria-pressed',String(b.dataset.period===period));
  el('sentCount').textContent=hasData?format(period==='all'?totals.sent:events.filter(e=>e.type==='sent').length):'—';
  el('failureCount').textContent=hasData?format(period==='all'?(totals.sendFailures||0)+(totals.preparationFailures||0)+(totals.apiErrors||0):events.filter(e=>['send_failed','preparation_failed'].includes(e.type)).length):'—';
  el('consultedCount').textContent=hasData&&period==='all'?format(totals.consulted):'—';el('discardedCount').textContent=hasData&&period==='all'?format(['noDiscount','lowSales','invalid','filtered','duplicate'].reduce((sum,k)=>sum+(totals[k]||0),0)):'—';
  el('yieldRate').textContent=hasData&&period==='all'&&totals.consulted>0?(100*(totals.sent||0)/totals.consulted).toLocaleString('pt-BR',{maximumFractionDigits:2})+'% dos consultados':'Percentual indisponível neste período';
  el('periodNote').textContent=period==='all'?'Totais acumulados. Gráfico e falhas: baseado nos últimos 200 eventos.':'Baseado nos últimos 200 eventos. Consultas, descartes e falhas de API por período indisponíveis.';
  el('connections').replaceChildren();for(const [name,color,text]of [['WhatsApp',report.stale?'yellow':report.connection==='online'?'green':report.connection==='connecting'?'yellow':'red',report.stale?'Estado desatualizado':report.connection==='online'?'Conectado':report.connection==='connecting'?'Conectando':'Desconectado'],['Shopee',report.lastError?'red':'yellow',report.lastError?'Última busca com erro':report.lastCycle?'Última busca concluída':'Aguardando busca'],['Instagram',instagramColor,instagramStatus]]){const p=document.createElement('p');p.className='health-'+color;p.textContent=name+' · '+text;el('connections').append(p);}
  el('failures').replaceChildren();const reasons={SEND_TIMEOUT:'Sem confirmação no prazo',SEND_FAILURE:'Falha no envio',PREPARATION_FAILURE:'Falha na preparação'};for(const event of filterActivity(report.activity).filter(e=>['send_failed','preparation_failed'].includes(e.type)).slice(0,3)){const li=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('span');title.textContent=event.title;detail.textContent=(reasons[event.reason]||event.reason||'Motivo indisponível')+' · '+new Intl.DateTimeFormat('pt-BR',{timeZone:timezone,hour:'2-digit',minute:'2-digit'}).format(event.at);li.append(title,detail);el('failures').append(li);}if(!el('failures').children.length)el('failures').textContent='Nenhuma falha no histórico disponível.';
  el('charts').replaceChildren();const sent=events.filter(e=>e.type==='sent');graph.hidden=!sent.length;if(!sent.length)return;
  const counts=Array(24).fill(0);for(const e of sent){const hour=Number(new Intl.DateTimeFormat('en',{timeZone:timezone,hour:'2-digit',hourCycle:'h23'}).format(e.at));counts[hour]++;}
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),max=Math.max(...counts);svg.classList.add('send-chart');svg.setAttribute('viewBox','0 0 360 150');svg.setAttribute('role','img');svg.setAttribute('aria-label','Envios por horário, baseado nos últimos 200 eventos');counts.forEach((count,h)=>{const bar=document.createElementNS(ns,'rect'),title=document.createElementNS(ns,'title');bar.setAttribute('x',h*15+2);bar.setAttribute('y',120-count/max*100);bar.setAttribute('width','10');bar.setAttribute('height',count/max*100);title.textContent=h+'h: '+count;bar.append(title);svg.append(bar);if(h%6===0){const text=document.createElementNS(ns,'text');text.setAttribute('x',h*15+2);text.setAttribute('y','140');text.textContent=h+'h';svg.append(text);}});el('charts').append(svg);
 };
}
const selected=new Set(),pending=new Set();
let state={jobs:[],offerIds:[]},submitting=false;
const labels={queued:'Na fila',preparing:'Preparando',rendering:'Renderizando',publishing:'Publicando',published:'Publicado',failed:'Falhou',uncertain:'Resultado incerto — não reenviar',preview:'Prévia pronta'};
const toolbar=document.createElement('div');toolbar.className='ig-actions';
const bulk=document.createElement('button');bulk.className='button';bulk.textContent='Publicar selecionados';bulk.disabled=true;
const preview=document.createElement('input');preview.type='checkbox';preview.checked=false;
const label=document.createElement('label');label.append(preview,' Apenas gerar prévias, sem publicar (opcional)');
const message=document.createElement('p');message.setAttribute('role','status');
toolbar.append(bulk,label,message);
const feedHost=document.getElementById?.('feedPanel');if(feedHost)feedHost.append(toolbar);else document.querySelector('#activity .table-scroll').before(toolbar);
const heading=document.createElement('th');heading.textContent='PUBLICAÇÃO NO INSTAGRAM';document.querySelector('#activity table thead tr').append(heading);
let selectionSequence=0;
function mode(){return preview.checked;}
function jobFor(id){return state.jobs.find(j=>j.offer_id===id&&j.dry_run===mode());}
function available(id){return state.offerIds.includes(id)&&!jobFor(id)&&!pending.has(id)&&!submitting&&(mode()||state.liveEnabled);}
function paint(cell,id){
 cell.replaceChildren();
 const box=document.createElement('input');box.type='checkbox';box.checked=selected.has(id);box.disabled=!available(id);box.setAttribute('aria-label','Selecionar produto para Instagram');box.id='feed-select-'+(++selectionSequence);
 box.addEventListener('change',()=>{if(box.checked)selected.add(id);else selected.delete(id);redraw();});
 const job=jobFor(id),retryable=job?.status==='failed'&&!job.attempted;
 const button=document.createElement('button');button.className='button';button.textContent=retryable?'Tentar novamente':mode()?'Gerar prévia':'Publicar no feed';button.disabled=retryable?(submitting||pending.has(id)||(!mode()&&!state.liveEnabled)):!available(id);button.addEventListener('click',()=>retryable?retry(job):submit([id]));
 const status=document.createElement('div');status.className='feed-status';status.dataset.status=job?.status||'idle';status.textContent=job?feedStatusText(job,labels):pending.has(id)?'Preparando solicitação…':!state.offerIds.includes(id)?'Oferta indisponível no catálogo':!mode()&&!state.liveEnabled?'Publicação manual desativada nas configurações':'';
 cell.append(box,button,status);
 const selectionLabel=document.createElement('label');selectionLabel.htmlFor=box.id;selectionLabel.className='feed-select-label';selectionLabel.textContent='Selecionar para Instagram';cell.append(selectionLabel);
 for(const [url,text] of [[job?.previewUrl,'Ver prévia'],[job?.permalink,'Abrir publicação']])if(url){const a=document.createElement('a');a.href=url;a.textContent=text;a.target='_blank';a.rel='noopener';cell.append(a,document.createTextNode(' '));}
}
function redraw(){document.querySelectorAll('[data-feed-offer]').forEach(cell=>paint(cell,cell.dataset.feedOffer));bulk.disabled=submitting||![...selected].some(available);bulk.textContent=`${mode()?'Gerar prévias dos selecionados':'Publicar selecionados'} (${selected.size})`;}
export function feedCell(id){const cell=document.createElement('td');cell.dataset.feedOffer=id;paint(cell,id);return cell;}
async function confirmFeed(text){if(typeof window==='undefined')return true;return window.confirmPanel ? window.confirmPanel(text) : false;}
async function submit(ids){
 if(submitting)return;
 ids=ids.filter(available);if(!ids.length)return;
 if(!mode() && !await confirmFeed("Publicar "+ids.length+" oferta(s) no feed do Instagram? A solicitação entra na fila de publicação real."))return;
 ids=ids.filter(available);if(submitting || !ids.length)return;
 submitting=true;ids.forEach(id=>pending.add(id));redraw();message.textContent=mode()?'Gerando prévias separadas…':'Enviando posts separados para a fila…';
 try{
  const response=await fetch('/api/instagram/feed',{method:'POST',headers:{'Content-Type':'application/json','X-Control-Token':state.controlToken},body:JSON.stringify({offerIds:ids,dryRun:mode()}),signal:AbortSignal.timeout(12000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Falha ao enviar seleção.');
  ids.forEach(id=>selected.delete(id));message.textContent=data.jobs.some(j=>j.status==='failed')?'Alguns itens falharam. Confira o status de cada produto.':'Seleção recebida. Cada produto terá seu próprio post.';
 }catch(error){message.textContent='Não foi possível confirmar a solicitação. Atualize o status antes de repetir.';}
 finally{submitting=false;await refresh();ids.forEach(id=>pending.delete(id));redraw();}
}
async function refresh(){try{const response=await fetch('/api/instagram/feed');if(!response.ok)throw Error();state=await response.json();redraw();}catch{message.textContent='Status do feed indisponível; confira o painel.';}}
async function retry(job){if(submitting)return;if(!mode() && !await window.confirmPanel("Tentar novamente a publicação desta oferta no Instagram?"))return;if(submitting)return;submitting=true;pending.add(job.offer_id);redraw();try{const response=await fetch(`/api/instagram/feed/jobs/${job.id}/retry`,{method:'POST',headers:{'Content-Type':'application/json','X-Control-Token':state.controlToken},body:'{}'});const data=await response.json();if(!response.ok)throw Error(data.error);message.textContent='Nova atualização da oferta solicitada.';}catch(error){message.textContent=error.message||'Não foi possível repetir.';}finally{submitting=false;await refresh();pending.delete(job.offer_id);redraw();}}
bulk.addEventListener('click',()=>submit([...selected]));preview.addEventListener('change',()=>{selected.clear();redraw();});
void refresh();setInterval(refresh,1500);

