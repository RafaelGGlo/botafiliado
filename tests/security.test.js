const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { createApp } = require('../src/server');
const { validate } = require('../src/config');
const auth = require('../src/auth');

const base = { host: '127.0.0.1', panelPassword: 'private-test-password', sessionSecret: 'random-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz' };
test('unsafe credentials are rejected before opening storage', () => {
 for (const secret of ['', 'short', 'dev-only-secret-change-me', 'troque-por-um-texto-aleatorio-bem-longo']) assert.throws(() => createApp({ cfg: { ...base, sessionSecret: secret } }), /SESSION_SECRET/);
 assert.throws(() => validate({ ...base, panelPassword: 'troque-esta-senha' }), /PANEL_PASSWORD/);
 assert.throws(() => validate({ ...base, production: true, panelPassword: '' }), /PANEL_PASSWORD/);
 assert.throws(() => validate({ ...base, host: '0.0.0.0', panelPassword: '' }), /PANEL_PASSWORD/);
});
test('known cookie, proxy headers, malformed cookies and compressed JSON cannot bypass login', async t => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-'));
 const { app, db, runner } = createApp({ cfg: { ...base, production: true, imagesDir: path.join(dir,'images'), dbFile: ':memory:', demoMode: true } });
 const server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
 t.after(async () => { runner.stop(); await new Promise(r=>server.close(r)); db.close(); fs.rmSync(dir,{recursive:true,force:true}); });
 const url = 'http://127.0.0.1:' + server.address().port;
 assert.equal((await fetch(url+'/api/settings',{headers:{cookie:'painel_sessao='+auth.makeToken('dev-only-secret-change-me')}})).status,401);
 assert.equal((await fetch(url+'/api/settings',{headers:{cookie:'painel_sessao=%xx'}})).status,401);
 assert.equal((await fetch(url+'/api/session',{headers:{'x-forwarded-host':'localhost'}})).status,403);
 const compressed = await fetch(url+'/api/login',{method:'POST',headers:{'content-type':'application/json','content-encoding':'gzip','x-requested-with':'painel'},body:gzipSync('{}')});
 assert.equal(compressed.status,415);
 const login = await fetch(url+'/api/login',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'painel'},body:JSON.stringify({password:base.panelPassword})});
 assert.equal(login.status,200); assert.match(login.headers.get('set-cookie'),/; Secure/);
 assert.equal((await fetch(url+'/api/settings',{headers:{cookie:login.headers.get('set-cookie').split(';')[0]}})).status,200);
});
test('malformed signatures and unreasonable expiration fail closed', () => {
 for (const token of ['NaN.'+'a'.repeat(64), '123.💥', auth.makeToken(base.sessionSecret,Date.now()+99999999)]) assert.equal(auth.tokenValid(base.sessionSecret,token),false);
});
