// Isolated UI harness. Uses real saved previews, simulated refresh, no credentials.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startDashboard} from '../instagram-publish/whatsapp-bot/src/dashboard-server.js';
import {emptyReport} from '../instagram-publish/whatsapp-bot/src/report.js';
const jobs=JSON.parse(fs.readFileSync(new URL('../output/instagram-feed/dry-run-results.json',import.meta.url),'utf8'));
const offers=jobs.map(j=>j.snapshot);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feed-ui-'));
const server=await startDashboard({port:0,getReport:()=>({...emptyReport(),latestOffers:offers,activity:offers.map(o=>({dealId:o.id,title:o.title,price:o.price,type:'sent',at:Date.now(),group:1}))}),instagramOptions:{file:path.join(dir,'preview.sqlite'),mediaDir:dir,env:{},getOffers:()=>offers,feedOptions:{refreshOffer:async o=>o,render:async o=>fs.readFileSync(new URL(`../output/instagram-feed/${jobs.find(j=>j.offer_id===o.id).previewFile}`,import.meta.url)),host:async()=>{throw Error('UI test cannot upload');},graph:async()=>{throw Error('UI test cannot publish');}}}});
console.log(server.url);
async function stop(){await server.stop();fs.rmSync(dir,{recursive:true,force:true});process.exit(0);}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
