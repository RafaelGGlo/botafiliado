export const CATEGORY_CHOICES = Object.freeze([
 { key: 'all', label: 'TUDO — itens aleatórios', ids: [] },
 { key: 'electronics', label: 'Eletrônicos em geral', ids: [100535,100013,100644,100634,100635] },
 { key: 'audio', label: 'Áudio e fones', ids: [100535] },
 { key: 'phones', label: 'Celulares', ids: [100013] },
 { key: 'computers', label: 'Computadores', ids: [100644] },
 { key: 'games', label: 'Jogos e consoles', ids: [100634] },
 { key: 'cameras', label: 'Câmeras', ids: [100635] },
]);
export function categoryChoice(categories) {
 const key = [...categories].sort((a,b)=>a-b).join(',');
 return CATEGORY_CHOICES.find(choice=>[...choice.ids].sort((a,b)=>a-b).join(',')===key) || { key:'custom', label:'Categorias personalizadas', ids:categories };
}
export const DEFAULT_OFFER_FILTERS = Object.freeze({ minPrice: null, maxPrice: null, minDiscount: 0, minSales: 0, categories: [], includeKeywords: '', excludeKeywords: '' });
export const normalizeText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
export function validateOfferFilters(filters) {
 if (!filters || Array.isArray(filters) || typeof filters !== 'object' || Object.keys(filters).some(key => !Object.hasOwn(DEFAULT_OFFER_FILTERS,key))) throw Error('Filtros inválidos.');
 const data = { ...DEFAULT_OFFER_FILTERS, ...filters };
 for (const key of ['minPrice','maxPrice']) if (data[key] !== null && (!Number.isFinite(data[key]) || data[key] < 0 || data[key] > 100000000)) throw Error('Preço inválido.');
 if (data.minPrice !== null && data.maxPrice !== null && data.maxPrice < data.minPrice) throw Error('O preço máximo deve ser maior que o mínimo.');
 if (!Number.isSafeInteger(data.minDiscount) || data.minDiscount < 0 || data.minDiscount > 99 || !Number.isSafeInteger(data.minSales) || data.minSales < 0) throw Error('Desconto ou vendas inválidos.');
 if (!Array.isArray(data.categories) || data.categories.length > 30 || data.categories.some(id => !Number.isSafeInteger(id) || id < 1)) throw Error('Categorias inválidas.');
 for (const key of ['includeKeywords','excludeKeywords']) if (typeof data[key] !== 'string' || data[key].length > 500) throw Error('Palavras inválidas.');
 return { ...data, categories: [...new Set(data.categories)], includeKeywords: data.includeKeywords.trim(), excludeKeywords: data.excludeKeywords.trim() };
}
const words = text => String(text || '').split(',').map(normalizeText).filter(Boolean);
const hasWord = (title, word) => new RegExp('(?:^|[^\\p{L}\\p{N}])' + word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '(?:$|[^\\p{L}\\p{N}])','u').test(title);
export function matchesOfferFilters(deal, filters) {
 const { minPrice, maxPrice, minDiscount, minSales, categories, includeKeywords, excludeKeywords } = filters;
 if (!Number.isFinite(deal.price) || (minPrice !== null && deal.price < minPrice) || (maxPrice !== null && deal.price > maxPrice)) return false;
 if (minDiscount > 0 && (!Number.isFinite(deal.discountRate) || deal.discountRate < minDiscount)) return false;
 if (minSales > 0 && (!Number.isSafeInteger(deal.sales) || deal.sales < minSales)) return false;
 if (categories.length && !deal.categoryIds?.some(id => categories.includes(Number(id)))) return false;
 const title = normalizeText(deal.title), includes = words(includeKeywords), excludes = words(excludeKeywords);
 return (!includes.length || includes.some(word => hasWord(title,word))) && !excludes.some(word => hasWord(title,word));
}
function localDay(value, timezone) {
 const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(value);
 return ['year','month','day'].map(key => parts.find(part => part.type === key).value).join('-');
}
export function filterActivity(items, filters = {}, { now = Date.now(), timezone = 'America/Sao_Paulo' } = {}) {
 const query = normalizeText(filters.query), status = filters.status || 'all', period = filters.period || 'all';
 const entries = (items || []).filter(item => {
  if (query && !normalizeText(item.title + ' ' + item.dealId).includes(query)) return false;
  if (status === 'timeout' && !(item.type === 'send_failed' && item.reason === 'SEND_TIMEOUT')) return false;
  if (status === 'failure' && !(item.type === 'send_failed' && item.reason !== 'SEND_TIMEOUT')) return false;
  if (!['all','timeout','failure'].includes(status) && item.type !== status) return false;
  if (filters.group && filters.group !== 'all' && (filters.group === 'none' ? item.group != null : item.group !== Number(filters.group))) return false;
  if (filters.minPrice != null && (!Number.isFinite(item.price) || item.price < filters.minPrice)) return false;
  if (filters.maxPrice != null && (!Number.isFinite(item.price) || item.price > filters.maxPrice)) return false;
  if (filters.from != null && (!Number.isFinite(item.at) || item.at < filters.from)) return false;
  if (filters.until != null && (!Number.isFinite(item.at) || item.at > filters.until)) return false;
  if (period === 'today' && (!Number.isFinite(item.at) || localDay(item.at,timezone) !== localDay(now,timezone))) return false;
  const duration = period === '24h' ? 86400000 : period === '7d' ? 604800000 : null;
  return duration === null || (Number.isFinite(item.at) && item.at >= now - duration && item.at <= now);
 });
 const sort = filters.sort || 'newest';
 return entries.sort((a,b) => sort === 'oldest' ? a.at - b.at : sort === 'price_low' || sort === 'price_high' ? (!Number.isFinite(a.price) && !Number.isFinite(b.price) ? b.at-a.at : !Number.isFinite(a.price) ? 1 : !Number.isFinite(b.price) ? -1 : sort === 'price_low' ? a.price - b.price : b.price - a.price) : b.at - a.at);
}

export function activityCsv(entries){const cell=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';return [['Horário','Produto','ID','Preço','Resultado','Grupo','Motivo'],...entries.map(e=>[new Date(e.at).toISOString(),e.title,e.dealId,e.price,e.type,e.group,e.reason])].map(row=>row.map(cell).join(';')).join('\r\n');}

export function resolveTheme(saved, prefersDark) {
 return saved === 'dark' || saved === 'light' ? saved : prefersDark ? 'dark' : 'light';
}
export function applyTheme(theme, root, storage) {
 root.dataset.theme = resolveTheme(theme, false);
 try { storage?.setItem('radar-tema', root.dataset.theme); } catch {}
 return root.dataset.theme;
}
export function escapeText(value) {
 return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function filterOffers(items, { query = '', status = 'all', sort = 'original' } = {}) {
 return (items || []).filter(o => (!query || normalizeText(o.title).includes(normalizeText(query))) && ['all','eligible'].includes(status)).slice().sort((a,b) => sort === 'price_low' ? a.price-b.price : sort === 'price_high' ? b.price-a.price : 0);
}

export function historyOutcome(entry) {
 if (entry.type === 'sent') return { label: 'Envio confirmado', detail: 'O WhatsApp confirmou o envio para este grupo.' };
 if (entry.type === 'preparation_failed') return { label: 'Falha na preparação', detail: 'Não foi possível preparar a oferta para envio ao WhatsApp.' };
 if (entry.reason === 'SEND_TIMEOUT') return { label: 'Sem confirmação', detail: 'O WhatsApp não confirmou o envio no prazo. Isso não significa que a mensagem não foi entregue.' };
 if (entry.type === 'send_failed') return { label: 'Falha no envio', detail: 'A tentativa de envio ao WhatsApp falhou.' };
 return { label: 'Resultado não informado', detail: 'Não há informação suficiente para explicar este resultado.' };
}
export function feedStatusText(job, labels) {
 if (!job) return '';
 if (job.status === 'uncertain') return 'Publicação no Instagram sem confirmação. Não reenviar: confira a conta antes de tentar novamente.';
 return (labels[job.status] || 'Estado não informado') + (job.error ? ' · ' + job.error : '');
}
