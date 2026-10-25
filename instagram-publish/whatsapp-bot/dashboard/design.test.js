import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { filterOffers, escapeText, resolveTheme, applyTheme } from './filters.js';
test('offer browsing normalizes accents and sorts a copy',()=>{
 const items=[{title:'Fone Áudio',price:100},{title:'fone simples',price:20}];
 assert.deepEqual(filterOffers(items,{query:'audio'}),[items[0]]);
 assert.deepEqual(filterOffers(items,{sort:'price_low'}),[items[1],items[0]]);
 assert.deepEqual(filterOffers(items,{status:'sent'}),[]);assert.equal(items[0].price,100);
});
test('API text escapes markup and quotes',()=>{
 assert.equal(escapeText('<img src="x">&'), '&lt;img src=&quot;x&quot;&gt;&amp;');assert.equal(escapeText(null),'');
});
test('theme preference and blocked storage',()=>{
 assert.equal(resolveTheme('light',true),'light');assert.equal(resolveTheme('invalid',true),'dark');assert.equal(resolveTheme(null,false),'light');
 const root={dataset:{}},values=[];applyTheme('dark',root,{setItem:(...args)=>values.push(args)});assert.deepEqual(values,[['radar-tema','dark']]);
 assert.doesNotThrow(()=>applyTheme('light',root,{setItem(){throw Error('denied');}}));assert.equal(root.dataset.theme,'light');
});
test('early theme script respects no-inline CSP and blocked storage',()=>{
 const code=fs.readFileSync(new URL('./flash-sale.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.ok(html.indexOf('<script src="/flash-sale.js"></script>')<html.indexOf('rel="stylesheet"'));
 for(const [saved,system,expected]of [['light',true,'light'],['bad',true,'dark'],[null,false,'light']]){
  const root={dataset:{}};vm.runInNewContext(code,{document:{currentScript:{},readyState:'loading',documentElement:root},localStorage:{getItem:()=>saved},matchMedia:()=>({matches:system})});assert.equal(root.dataset.theme,expected);
 }
 const root={dataset:{}};vm.runInNewContext(code,{document:{currentScript:{},readyState:'loading',documentElement:root},localStorage:{getItem(){throw Error('denied');}},matchMedia:()=>({matches:true})});assert.equal(root.dataset.theme,'dark');
});
test('normal text pairs meet 4.5:1 contrast',()=>{
 const lum=hex=>{const a=hex.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2];};
 for(const [text,bg]of [['ececf1','151518'],['a0a0ad','151518'],['8f94ff','151518'],['7be0a0','173a28'],['ffd27a','3a3217'],['b5b8ff','232340'],['ffa3ad','3a1c22'],['ff9aa5','1f1215'],['16181d','ffffff'],['5b6270','ffffff'],['5b6270','eceef2'],['4a50d8','ffffff'],['0f6b3a','e2f5ea'],['8a5a00','fff1d6'],['3340b0','e6e9ff'],['a3202f','fde4e7'],['b3202f','ffffff'],['ffffff','1f7a42']]){const a=lum(text),b=lum(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,text+' on '+bg);}
});
