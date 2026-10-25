// Classic head load applies the theme before paint; the module load mounts the tab.
// Both use this existing allowed asset because the server CSP rejects inline scripts.
if (document.currentScript && document.readyState === 'loading') {
 let saved; try { saved = localStorage.getItem('radar-tema'); } catch {}
 document.documentElement.dataset.theme = ['dark','light'].includes(saved) ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
} else {
const section=document.createElement('section');section.className='card';section.id='flash-settings';
const heading=document.createElement('h2');heading.textContent='Verificação de ofertas relâmpago (beta)';
const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';label.append(toggle,' ⚡ Ofertas Relâmpago (BETA)');
const info=document.createElement('p');info.textContent='Somente testes. Não altera mensagens, não publica e não aplica etiquetas automaticamente.';
const select=document.createElement('select');select.setAttribute('aria-label','Produto para testar oferta relâmpago');
const button=document.createElement('button');button.className='button';button.textContent='Testar agora';button.disabled=true;
const message=document.createElement('p');message.setAttribute('role','status');
const scroll=document.createElement('div');scroll.className='table-scroll';const table=document.createElement('table'),head=document.createElement('thead'),row=document.createElement('tr'),body=document.createElement('tbody');
for(const title of ['Produto','Status','Fonte','Início (Brasília)','Fim (Brasília)','Erro / verificação']){const th=document.createElement('th');th.textContent=title;row.append(th);}head.append(row);table.append(head,body);scroll.append(table);
section.append(heading,label,info,select,button,message,scroll);document.getElementById('relampagoPanel').append(section);
let state=null,busy=false;
const date=value=>value?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(value)):'—';
function render(data){state={...state,...data};toggle.checked=state.enabled;toggle.disabled=busy;button.disabled=busy||!state.enabled||!select.value;body.replaceChildren();for(const result of state.results||[]){const tr=document.createElement('tr');for(const value of [result.title,result.status,result.source,date(result.startAt),date(result.endAt),result.error||'Verificado apenas para teste']){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);}}
async function load(){const response=await fetch('/api/instagram/flash-sale');if(!response.ok)throw Error('BETA indisponível.');const data=await response.json();const previous=select.value;select.replaceChildren();for(const offer of data.offers){const option=document.createElement('option');option.value=offer.id;option.textContent=offer.title;select.append(option);}if(data.offers.some(o=>o.id===previous))select.value=previous;render(data);}
async function action(url,payload){if(busy)return;busy=true;toggle.disabled=true;button.disabled=true;message.textContent='Verificando…';try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Control-Token':state.controlToken},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível verificar.');render(data);message.textContent=data.enabled?'BETA ativada apenas para testes. Nenhuma publicação.':'BETA desligada. Nenhuma consulta automática.';}catch(error){message.textContent=error.message;}finally{busy=false;if(state)render(state);}}
toggle.addEventListener('change',()=>action('/api/instagram/flash-sale/settings',{enabled:toggle.checked}));button.addEventListener('click',()=>action('/api/instagram/flash-sale/test',{offerIds:[select.value]}));select.addEventListener('change',()=>{if(state)render(state);});
load().catch(error=>{toggle.disabled=true;message.textContent=error.message;});
setInterval(()=>{if(!busy)load().catch(()=>{});},30000); // Storage reads only, never source checks.
}
