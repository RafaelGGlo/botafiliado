import sharp from 'sharp';
import fs from 'node:fs/promises';

const xml = value => String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
export const storyFont = 'Arial Black';
const font = storyFont;
const linkLayout = JSON.parse(await fs.readFile(new URL('../../../instagram-publisher/story-layout.json', import.meta.url), 'utf8'));
const cta = { left: Math.round((linkLayout.x - linkLayout.width / 2) * 1080), top: Math.round((linkLayout.y - linkLayout.height / 2) * 1920), width: Math.round(linkLayout.width * 1080), height: Math.round(linkLayout.height * 1920) };
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
export const storyGeometry = {
 width: 1080, height: 1920,
 product: { left: 128, top: 420, width: 824, height: 640 },
 title: { top: 1140, bottom: 1280, width: 900 },
 sticker: { ...cta, bottom: cta.top + cta.height },
};

export function storyPrices(offer) {
 const current = Number(offer.price), previous = Number(offer.previousPrice);
 if (!Number.isFinite(current) || current <= 0) throw Error('Story requires a valid positive offer price');
 const validPrevious = Number.isFinite(previous) && previous > current;
 const discount = validPrevious ? Math.floor((1 - current / previous) * 100 + 1e-8) : 0;
 return { current: money(current), previous: validPrevious ? money(previous) : null, discount };
}

export async function measure(text, size) {
 const meta = await sharp({ text: { text: xml(text), font: `${font} Bold ${size}`, dpi: 72, rgba: true } }).metadata();
 return meta.width;
}

export async function fitStoryTitle(value) {
 const title = String(value || '').replace(/\s+/g, ' ').trim();
 if (!title) throw Error('Story requires a product title');
 // Measure with the same system font used by the SVG renderer; never allow a third line.
 for (const size of [64, 60, 56]) {
  const lines = [''];
  let overflow = false;
  for (const word of title.split(' ')) {
   const candidate = lines.at(-1) ? `${lines.at(-1)} ${word}` : word;
   if (await measure(candidate, size) <= 900) lines[lines.length - 1] = candidate;
   else if (lines.length === 1 && lines[0] && await measure(word, size) <= 900) lines.push(word);
   else { overflow = true; break; }
  }
  if (!overflow) return { lines, size };
 }
 const size = 56, lines = [''];
 for (const word of title.split(' ')) {
  const candidate = lines.at(-1) ? `${lines.at(-1)} ${word}` : word;
  if (await measure(candidate + '…', size) <= 900) lines[lines.length - 1] = candidate;
  else if (lines.length === 1 && lines[0]) lines.push(word);
  else { if (!lines[0]) lines[0] = word; break; }
 }
 while (await measure(lines.at(-1) + '…', size) > 900) lines[lines.length - 1] = lines.at(-1).slice(0, -1);
 lines[lines.length - 1] = lines.at(-1).trimEnd() + '…';
 return { lines, size };
}

export async function renderStory(offer, bytes) {
 const prices = storyPrices(offer);
 const title = await fitStoryTitle(offer.title);
 let priceSize = 180;
 while (await measure(prices.current, priceSize) > 880 && priceSize > 48) priceSize -= 4;
 const label = (text, x, y, size, color = 'white', extra = '') => `<text x="${x}" y="${y}" font-family="${font},Arial,sans-serif" font-weight="bold" font-size="${size}" fill="${color}" ${extra}>${xml(text)}</text>`;
 const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
 <rect width="1080" height="1920" fill="#081B44"/>
 ${label('GARIMPO', 410, 218, 64)}${label('DE OFERTAS', 410, 276, 51, '#FFDE00')}
 <rect x="300" y="310" width="480" height="68" rx="34" fill="#FFDE00"/>
 ${label('OFERTA DO DIA', 540, 358, 45, '#081B44', 'text-anchor="middle"')}
 <rect x="88" y="398" width="904" height="704" rx="44" fill="white"/>
 ${title.lines.map((line, i) => label(line, 540, 1190 + i * 72, title.size, 'white', 'text-anchor="middle"')).join('')}
 ${prices.previous ? label(`De ${prices.previous}`, 140, 1350, 42, '#BAC3D5', 'text-decoration="line-through" textLength="450" lengthAdjust="spacingAndGlyphs"') : ''}
 ${prices.discount > 0 ? `<rect x="740" y="1296" width="200" height="76" rx="24" fill="#FFDE00"/>${label(`-${prices.discount}%`, 840, 1352, 54, '#081B44', 'text-anchor="middle"')}` : ''}
 <text x="540" y="1505" text-anchor="middle" font-family="${font},Arial,sans-serif" font-weight="bold" font-size="${priceSize}"><tspan fill="white">R$</tspan><tspan dx="20" fill="#FFDE00">${xml(prices.current.replace(/^R\$\s*/, ''))}</tspan></text>
 ${label('Clique em', 540, 1606, 34, 'white', 'text-anchor="middle"')}
 <rect x="${cta.left}" y="${cta.top}" width="${cta.width}" height="${cta.height}" rx="${cta.height / 2}" fill="#FFDE00"/>
 ${label('VER OFERTA →', 540, cta.top + 65, 43, '#081B44', 'text-anchor="middle"')}
 <text x="540" y="1780" text-anchor="middle" font-family="Arial,sans-serif" font-size="23" fill="white">Preço e disponibilidade podem mudar.</text>
 </svg>`;
 const product = await sharp(bytes, { limitInputPixels: 40000000 }).rotate()
  .resize(storyGeometry.product.width, storyGeometry.product.height, { fit: 'contain', background: 'white' }).png().toBuffer();
 const logo = await sharp(await fs.readFile(new URL('../assets/garimpo-logo.png', import.meta.url)))
  .resize(144, 144, { fit: 'contain', background: '#00000000' }).png().toBuffer();
 return sharp(Buffer.from(svg)).composite([
  { input: product, left: storyGeometry.product.left, top: storyGeometry.product.top },
  { input: logo, left: 238, top: 150 },
 ]).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
}
