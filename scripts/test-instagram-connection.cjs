'use strict';

// Standalone, read-only check. Never imports or starts the affiliate bot.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

const expectedUsername = 'garimpoo__ofertas';
const expectedId = '17841454176827517';

async function main() {
  const envPath = path.resolve(process.argv[2] || path.join(__dirname, '..', '.env'));
  const fileEnv = fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, 'utf8')) : {};
  const env = { ...fileEnv, ...process.env };
  const token = (env.INSTAGRAM_ACCESS_TOKEN || '').trim();
  if (!token) {
    console.error('[ERROR] Missing INSTAGRAM_ACCESS_TOKEN. Configure it in the root .env or pass an .env path as the first argument.');
    console.error('[INFO] No API request was made. Never paste the token into chat or commit it.');
    process.exitCode = 1;
    return;
  }
  const version = env.INSTAGRAM_API_VERSION || 'v25.0';
  if (!/^v\d+\.0$/.test(version)) {
    console.error('[ERROR] INSTAGRAM_API_VERSION must have the form v25.0.');
    process.exitCode = 1;
    return;
  }
  console.log(`[INFO] Instagram Login API ${version}; GET requests only.`);

  async function get(resource, fields) {
    const url = new URL(`https://graph.instagram.com/${version}/${resource}`);
    if (fields) url.searchParams.set('fields', fields);
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20000),
        redirect: 'error',
      });
    } catch {
      throw new Error('Network/TLS failure or 20-second timeout. Check connectivity to graph.instagram.com.');
    }
    let body;
    try { body = await response.json(); } catch {
      throw new Error(`HTTP ${response.status}: non-JSON response.`);
    }
    if (!response.ok || body.error) {
      // Do not print response bodies/messages: they may contain sensitive input.
      const code = Number(body.error?.code) || 0;
      const subcode = Number(body.error?.error_subcode) || 0;
      const hint = code === 190 ? ' Token invalid/expired or issued for a different login flow.'
        : [10, 200].includes(code) ? ' Check granted Instagram Login permissions and app access level.' : '';
      throw new Error(`HTTP ${response.status}; Meta code ${code}, subcode ${subcode}.${hint}`);
    }
    return body;
  }

  const account = await get('me', 'id,user_id,username,account_type');
  console.log('[SUCCESS] Authentication accepted.');
  // Only display the requested public account fields, never the raw response.
  for (const field of ['username', 'id', 'user_id', 'account_type']) {
    const value = account[field];
    const safe = typeof value === 'string' && /^[A-Za-z0-9_.]{1,100}$/.test(value);
    console.log(`[ACCOUNT] ${field}: ${safe ? value : 'not returned / unexpected format'}`);
  }
  const usernameMatches = account.username?.toLowerCase() === expectedUsername;
  const idMatches = [account.id, account.user_id].some(id => String(id) === expectedId);
  if (usernameMatches && idMatches) console.log('[SUCCESS] Username and Instagram ID match the expected account.');
  else {
    console.error('[ERROR] Returned username or ID does not match the expected account. Verify the token owner and Instagram-scoped ID.');
    process.exitCode = 1;
  }
  if (!['BUSINESS', 'MEDIA_CREATOR'].includes(account.account_type)) {
    console.warn('[WARN] Professional account type could not be confirmed. Instagram Login requires a business or creator account.');
    process.exitCode = 1;
  }
  // Official read-only publishing endpoint; never create containers or publish.
  // https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit
  try {
    const id = String(account.id || '');
    if (!/^\d+$/.test(id) || !usernameMatches || !idMatches) throw new Error('Account verification required.');
    const quota = await get(id + '/content_publishing_limit', 'quota_usage,config');
    const item = quota.data?.[0];
    if (!item || !Number.isSafeInteger(item.quota_usage)) throw new Error('Publishing quota was not returned.');
    console.log('[SUCCESS] Supported content_publishing_limit endpoint accepted the token.');
    console.log('[INFO] Publishing quota usage: ' + item.quota_usage);
    const config = item.config;
    for (const key of ['quota_total', 'quota_duration']) {
      if (Number.isSafeInteger(config?.[key])) console.log('[INFO] ' + key + ': ' + config[key]);
    }
    if (Number.isSafeInteger(config?.quota_total) && item.quota_usage >= config.quota_total) {
      console.warn('[WARN] Publishing quota exhausted; wait for capacity to return.');
      process.exitCode = 1;
    }
    console.log('[INFO] Publishing-related read access confirmed. Exact token scopes, expiry and app access level were not enumerated.');
    console.log('[INFO] No media created or published. End-to-end automated publishing remains untested.');
  } catch (error) {
    console.warn('[WARN] Publishing readiness check failed: ' + error.message);
    console.warn('[INFO] Verify instagram_business_basic and instagram_business_content_publish plus app access level in Meta App Dashboard.');
    process.exitCode = 1;
  }
}

main().catch(error => {
  // Only our sanitized errors can reach this output; never log arbitrary errors.
  const safe = /^(HTTP \d+; Meta code \d+, subcode \d+\.|Network\/TLS failure|HTTP \d+: non-JSON)/.test(error.message);
  console.error(`[ERROR] ${safe ? error.message : 'Unable to complete the check. Verify the local configuration and account response.'}`);
  process.exitCode = 1;
});
