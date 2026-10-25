import fs from 'node:fs/promises';
import { promotionalImage } from '../instagram-publish/whatsapp-bot/src/instagram-image.js';
import { readInstagramOffers } from '../instagram-publish/whatsapp-bot/src/instagram-catalog.js';
import { storyPrices, fitStoryTitle } from '../instagram-publish/whatsapp-bot/src/story-template.js';
import imageTools from '../instagram-publish/src/images.js';
import sharp from 'sharp';

// Local preview only: no publisher, credentials, or live queues.
const offers = readInstagramOffers().filter(o => !o.testOnly && o.affiliateUrl && o.price > 0);
const offer = process.argv[2] ? offers.find(o => o.id === process.argv[2]) : offers.find(o => /power bank/i.test(o.title)) || offers[0];
if (!offer) throw Error('No actual offer found. Supply an offer ID from the local catalog.');
const dir = new URL('../output/instagram-design/', import.meta.url);
await fs.mkdir(dir, { recursive: true });
const long = [...offers].sort((a, b) => b.title.length - a.title.length)[0];
const missing = offers.filter(o => o.id !== offer.id && !storyPrices(o).previous).sort((a, b) => a.title.length - b.title.length)[0];
const cases = [['story', offer], ['story-long-title', long], ['story-no-previous-price', missing]].filter(([, o]) => o);
for (const [name, actual] of cases) {
 const image = actual.imageFile ? await fs.readFile(actual.imageFile) : await imageTools.downloadImage(actual.imageUrl);
 const bytes = await promotionalImage(actual, 'story', image, 'promotional');
 const meta = await sharp(bytes).metadata();
 if (meta.width !== 1080 || meta.height !== 1920 || meta.format !== 'jpeg') throw Error('Invalid preview dimensions');
 await fs.writeFile(new URL(`${name}.jpg`, dir), bytes);
 await fs.writeFile(new URL(`${name}-original.jpg`, dir), image);
 await fs.writeFile(new URL(`${name}-offer.json`, dir), JSON.stringify({ ...actual, renderedPrices: storyPrices(actual), titleLayout: await fitStoryTitle(actual.title) }, null, 2));
 console.log(`Local preview only: ${actual.id}, ${storyPrices(actual).current}. output/instagram-design/${name}.jpg`);
}
