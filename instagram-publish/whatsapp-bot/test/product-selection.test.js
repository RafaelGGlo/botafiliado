import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProduct, rankProducts, selectionConfig } from '../src/product-selection.js';
const deal={id:'shopee:1:2',platform:'shopee',title:'Carregador USB-C',price:50,rating:4.8,sales:100,discountRate:25,productUrl:'https://shopee.com.br/product/1/2',affiliateUrl:'https://s.shopee.com.br/abc',imageUrl:'https://cf.shopee.com.br/image.jpg'};
test('rejects missing trust, discounts, invalid fields and irrelevant titles',()=>{
 assert.equal(evaluateProduct(deal).accepted,true);
 for(const patch of [{rating:null},{rating:4.4},{rating:6},{rating:true},{discountRate:null},{discountRate:100},{price:0},{title:'Pasta de amendoim'},{title:'Carregador replica'},{imageUrl:'http://example.com'},{productUrl:'https://evil.com'},{affiliateUrl:null},{testOnly:true}]) assert.equal(evaluateProduct({...deal,...patch}).accepted,false,JSON.stringify(patch));
 assert.equal(evaluateProduct({...deal,sales:undefined}).accepted,true);
});
test('prefers popularity, 20 percent discount and target prices without inventing metrics',()=>{
 const weak={...deal,id:'weak',sales:undefined,discountRate:10,price:200};
 assert.deepEqual(rankProducts([weak,deal]).map(d=>d.id),[deal.id,'weak']);
 assert.equal(weak.sales,undefined);
});
test('allocates category shares and validates configuration',()=>{
 const titles={home:'Panela inox',electronics:'Carregador USB-C',automotive_tools:'Furadeira',fashion_beauty:'Camiseta basica',computers_others:'SSD 512GB'};
 const pool=Object.entries(titles).flatMap(([key,title])=>Array.from({length:40},(_,i)=>({...deal,id:key+i,title})));
 const counts={};for(const d of rankProducts(pool,selectionConfig(),{},100)){const c=evaluateProduct(d).category;counts[c]=(counts[c]||0)+1;}
 assert.deepEqual(counts,{home:30,electronics:25,automotive_tools:15,fashion_beauty:15,computers_others:15});
 assert.throws(()=>selectionConfig({SHOPEE_ALLOWED_CATEGORIES:'food'}));
});
