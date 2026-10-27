const path = require('node:path');

function load() {
  const dataDir = path.resolve(process.env.DATA_DIR || './data');
  return {
    appId: (process.env.SHOPEE_APP_ID || '').trim(),
    secret: (process.env.SHOPEE_SECRET || '').trim(),
    endpoint: process.env.SHOPEE_ENDPOINT || 'https://open-api.affiliate.shopee.com.br/graphql',
    port: Number(process.env.PORT || 3000),
    host: process.env.HOST || '127.0.0.1',
    panelPassword: process.env.PANEL_PASSWORD || '',
    sessionSecret: process.env.SESSION_SECRET || '',
    production: process.env.NODE_ENV === 'production',
    dataDir,
    imagesDir: path.join(dataDir, 'images'),
    dbFile: path.join(dataDir, 'ofertas.db'),
    get demoMode() { return !(this.appId && this.secret); },
  };
}

function validate(cfg) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(cfg.host) && !cfg.panelPassword) throw Error('Configure PANEL_PASSWORD para acesso externo.');
  if (cfg.production && !cfg.panelPassword) throw Error('PANEL_PASSWORD obrigatória em produção, inclusive em loopback.');
  if (cfg.panelPassword && (cfg.panelPassword === 'troque-esta-senha' || cfg.panelPassword.length < 12)) throw Error('Use PANEL_PASSWORD própria, com pelo menos 12 caracteres.');
  if (cfg.panelPassword && (Buffer.byteLength(cfg.sessionSecret || '', 'utf8') < 32 || ['dev-only-secret-change-me', 'troque-por-um-texto-aleatorio-bem-longo'].includes(cfg.sessionSecret))) throw Error('Configure SESSION_SECRET aleatório com pelo menos 32 bytes.');
}
module.exports = { load, validate };
