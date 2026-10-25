import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDeal } from '../src/format.js';

test('preço Pix só aparece quando informado como número válido abaixo do normal', () => {
 const deal = {title:'Produto de teste',price:100,fromPrice:true};
 assert.match(formatDeal({...deal,couponPrice:80.5},'link'), /💳 No Pix com cupom: \*R\$\s80,50\*/);
 for (const couponPrice of [undefined,null,0,-1,100,101,NaN,Infinity,'80.50']) {
  assert.doesNotMatch(formatDeal({...deal,couponPrice},'link'), /No Pix com cupom/);
 }
});
