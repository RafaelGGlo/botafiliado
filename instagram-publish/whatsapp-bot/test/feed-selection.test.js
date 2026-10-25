import {test} from 'node:test';
import assert from 'node:assert/strict';

test('dashboard publishes checked products directly, keeps previews optional and suppresses double clicks',async t=>{
 const nodes=[];
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.dataset={};this.disabled=false;this.checked=false;nodes.push(this);}
  append(...children){this.children.push(...children);}
  before(node){this.inserted=node;}
  replaceChildren(...children){this.children=children;}
  setAttribute(){}
  addEventListener(name,fn){this.listeners[name]=fn;}
  async fire(name){return this.listeners[name]?.();}
 }
 const scroll=new Element('scroll'),head=new Element('head');
 const original={document:global.document,fetch:global.fetch,setInterval:global.setInterval};
 let posts=[],release,serverJobs=[];
 global.document={createElement:tag=>new Element(tag),createTextNode:text=>text,querySelector:selector=>selector.includes('thead')?head:scroll,querySelectorAll:()=>nodes.filter(n=>n.dataset.feedOffer)};
 global.setInterval=()=>0;
 global.fetch=async(url,options)=>{
  if(options?.method==='POST'){
   const body=JSON.parse(options.body);posts.push(body);
   await new Promise(resolve=>{release=resolve;});
   serverJobs=body.offerIds.map(offer_id=>({offer_id,dry_run:body.dryRun,status:body.dryRun?'preview':'published',previewUrl:'/preview.jpg'}));
   return{ok:true,json:async()=>({jobs:serverJobs})};
  }
  return{ok:true,json:async()=>({offerIds:['a','b','c'],jobs:serverJobs,controlToken:'test-token',liveEnabled:true})};
 };
 t.after(()=>{Object.assign(global,original);});
 const {feedCell}=await import('../dashboard/feed.js?selection-test');
 await new Promise(r=>setTimeout(r,0));
 const a=feedCell('a'),b=feedCell('b');feedCell('c');
 const toolbar=scroll.inserted,bulk=toolbar.children[0],preview=toolbar.children[1].children[0];
 assert.equal(preview.checked,false);assert.equal(bulk.disabled,true);
 a.children[0].checked=true;await a.children[0].fire('change');
 b.children[0].checked=true;await b.children[0].fire('change');
 assert.equal(bulk.disabled,false);assert.match(bulk.textContent,/2/);
 const first=bulk.fire('click');await bulk.fire('click');
 assert.equal(posts.length,1);assert.deepEqual(posts[0],{offerIds:['a','b'],dryRun:false});assert.equal(bulk.disabled,true);
 release();await first;
 assert.equal(a.children[1].disabled,true);assert.equal(b.children[1].disabled,true);assert.match(a.children[2].textContent,/Publicado/);
 assert.equal(nodes.find(n=>n.dataset.feedOffer==='c').children[1].disabled,false);
 preview.checked=true;await preview.fire('change');
 assert.match(a.children[1].textContent,/Gerar prévia/);
 const optional=a.children[1].fire('click');assert.equal(posts.length,2);assert.deepEqual(posts[1],{offerIds:['a'],dryRun:true});release();await optional;assert.match(a.children[2].textContent,/Prévia pronta/);
});
