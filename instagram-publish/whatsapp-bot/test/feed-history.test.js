import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {feedOffersWithHistory} from '../src/instagram-catalog.js';
test('manual feed recovers confirmed historical identities without replacing current offers', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feed-history-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'report.json');
 const current={id:'shopee:1:2',title:'Atual',price:12,imageUrl:'https://example.com/image.jpg'};
 fs.writeFileSync(file,JSON.stringify({activity:[
  {type:'sent',dealId:'shopee:1:2',title:'Antigo',price:9},
  {type:'sent',dealId:'shopee:3:4',title:'Histórico',price:20},
  {type:'sent',dealId:'shopee:3:4',title:'Duplicado',price:20},
  {type:'failed',dealId:'shopee:5:6'},
  {type:'sent',dealId:'invalid'}
 ]}));
 const result=feedOffersWithHistory([current],file);
 assert.equal(result.length,2);
 assert.deepEqual(result[0],current);
 assert.equal(result[1].id,'shopee:3:4');
 assert.equal(result[1].imageUrl,undefined);
 assert.equal(result[1].affiliateUrl,undefined);
 assert.deepEqual(feedOffersWithHistory([current],path.join(dir,'missing')),[current]);
});