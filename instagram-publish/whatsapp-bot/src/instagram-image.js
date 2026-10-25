import sharp from 'sharp';
import fs from 'node:fs/promises';
import imageTools from '../../src/images.js';
import { renderStory, storyPrices } from './story-template.js';
const xml = value => String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const money = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brandLogo = new URL('../assets/garimpo-logo.png', import.meta.url);
async function watermark(top) {
 // Keep the mark in its own corner, outside the product's image area.
 const logo = await sharp(await fs.readFile(brandLogo)).resize(116, 116, { fit: 'contain', background: '#ffffff00' }).png().toBuffer();
 return { input: logo, left: 872, top };
}
export async function promotionalImage(offer, format, image = null, kind = 'promotional') {
 const height = format === 'story' ? 1920 : 1080;
 const bytes = image || (offer.imageFile ? await fs.readFile(offer.imageFile) : await imageTools.downloadImage(offer.imageUrl));
 if (format === 'story' && kind === 'promotional') return renderStory(offer, bytes);
 if (kind === 'product') return sharp(bytes, { limitInputPixels: 40000000 }).rotate().resize(1080, height, { fit: 'contain', background: '#ffffff' }).jpeg({ quality: 95 }).toBuffer();
 const product = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().resize(848, height - 690, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
 const previous = Number(offer.previousPrice);
 const discount = storyPrices(offer).discount;
 const lines = String(offer.title).match(/.{1,40}(?:\s|$)|.{1,40}/g)?.slice(0, 2) || [];
 const overlay = `<svg width="1080" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="brand" x2="1" y2="1"><stop stop-color="#061335"/><stop offset="1" stop-color="#073880"/></linearGradient></defs><rect width="1080" height="${height}" fill="url(#brand)"/><circle cx="1070" cy="100" r="280" fill="#087cff" opacity="0.12"/><rect x="60" y="50" width="960" height="${height - 430}" rx="36" fill="white"/><rect x="96" y="86" width="8" height="40" rx="4" fill="#087cff"/><text x="122" y="115" font-family="Arial" font-size="23" letter-spacing="3" font-weight="bold" fill="#073880">GARIMPO DE OFERTAS</text><rect x="60" y="${height - 396}" width="90" height="6" rx="3" fill="#ffe000"/>
 ${lines.map((s, i) => `<text x="60" y="${height - 330 + i * 48}" font-family="Arial" font-size="38" fill="white">${xml(s.trim())}</text>`).join('')}
 ${previous > offer.price ? `<text x="60" y="${height - 198}" font-family="Arial" font-size="30" fill="#adb5c5">De ${xml(money(previous))}</text>` : ''}
 <text x="60" y="${height - 115}" font-family="Arial" font-weight="bold" font-size="76" fill="#c3c6ff">${xml(money(offer.price))}</text>
 ${discount > 0 ? `<text x="780" y="${height - 125}" font-family="Arial" font-size="42" fill="#7ce3ad">-${Math.min(99, discount)}%</text>` : ''}
 </svg>`;
 const layers = [{ input: product, left: 116, top: 150 }, await watermark(height - 562)];
 return sharp(Buffer.from(overlay)).composite(layers).jpeg({ quality: 95 }).toBuffer();
}
