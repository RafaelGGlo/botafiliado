import sharp from 'sharp';
import fs from 'node:fs/promises';
import imageTools from '../../src/images.js';
import { fitStoryTitle, storyPrices, storyFont, measure } from './story-template.js';
const xml = s => String(s).replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]));
export async function renderFeed(offer, suppliedImage) {
 const prices = storyPrices(offer), title = await fitStoryTitle(offer.title);
 const bytes = suppliedImage || await imageTools.downloadImage(offer.imageUrl);
 const photo = await sharp(bytes, { limitInputPixels:40000000 }).rotate().resize(824, 550, { fit:'contain', background:'white' }).png().toBuffer();
 const logo = await sharp(await fs.readFile(new URL('../assets/garimpo-logo.png', import.meta.url))).resize(108,108).png().toBuffer();
 const text = (s,y,size,color='white',extra='') => `<text x="540" y="${y}" text-anchor="middle" font-family="${storyFont},Arial,sans-serif" font-weight="bold" font-size="${size}" fill="${color}" ${extra}>${xml(s)}</text>`;
 let priceSize = 138;
 while(await measure(prices.current,priceSize)>900&&priceSize>32)priceSize-=4;
 const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#081B44"/>
 <text x="370" y="116" font-family="${storyFont},Arial" font-weight="bold" font-size="54" fill="white">GARIMPO</text><text x="370" y="171" font-family="${storyFont},Arial" font-weight="bold" font-size="44" fill="#FFDE00">DE OFERTAS</text>
 <rect x="300" y="204" width="480" height="64" rx="32" fill="#FFDE00"/>${text('OFERTA DO DIA',250,39,'#081B44')}
 <rect x="88" y="292" width="904" height="600" rx="42" fill="white"/>
 ${title.lines.map((s,i)=>text(s,960+i*67,Math.min(title.size,60))).join('')}
 ${prices.previous ? `<text x="140" y="1092" font-family="${storyFont},Arial" font-size="35" fill="#BAC3D5" text-decoration="line-through" textLength="480" lengthAdjust="spacingAndGlyphs">${xml('De '+prices.previous)}</text>` : ''}
 ${prices.discount>0 ? `<rect x="790" y="1050" width="190" height="65" rx="22" fill="#FFDE00"/><text x="885" y="1098" text-anchor="middle" font-family="${storyFont},Arial" font-size="43" font-weight="bold" fill="#081B44">-${prices.discount}%</text>` : ''}
 ${text(prices.current,1230,priceSize,'#FFDE00')}
 ${text('Preço e disponibilidade podem mudar.',1305,22)}
 </svg>`;
 return sharp(Buffer.from(svg)).composite([{input:photo,left:128,top:317},{input:logo,left:240,top:76}]).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer();
}
