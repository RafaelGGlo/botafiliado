import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyOutcome, feedStatusText } from './filters.js';

test('WhatsApp outcomes use plain explanations without confusing an uncertain delivery with failure',()=>{
 assert.equal(historyOutcome({type:'sent'}).label,'Envio confirmado');
 assert.match(historyOutcome({type:'sent'}).detail,/WhatsApp/);
 assert.equal(historyOutcome({type:'preparation_failed'}).label,'Falha na preparação');
 const timeout=historyOutcome({type:'send_failed',reason:'SEND_TIMEOUT'});
 assert.equal(timeout.label,'Sem confirmação');
 assert.match(timeout.detail,/não significa/);
 assert.equal(historyOutcome({type:'send_failed',reason:'SEND_FAILURE'}).label,'Falha no envio');
 assert.equal(historyOutcome({type:'unknown'}).label,'Resultado não informado');
});

test('Instagram uncertainty is shown once and does not alter WhatsApp confirmation',()=>{
 const job={status:'uncertain',error:'Resultado incerto. Não reenviar: confira a conta e o container antes de reconciliar.'};
 const text=feedStatusText(job,{uncertain:'Resultado incerto — não reenviar'});
 assert.match(text,/Instagram sem confirmação/);
 assert.equal(text.match(/Não reenviar/g).length,1);
 assert.ok(!text.includes('container'));
 assert.equal(job.status,'uncertain');
 assert.equal(historyOutcome({type:'sent'}).label,'Envio confirmado');
 assert.equal(feedStatusText({status:'published'},{published:'Publicado'}),'Publicado');
 assert.equal(feedStatusText(null,{}),'');
});
