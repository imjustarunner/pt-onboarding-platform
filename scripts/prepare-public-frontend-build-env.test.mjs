import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { publicFrontendBuildEnvironment, preparePublicFrontendBuildEnvironment } from './prepare-public-frontend-build-env.mjs';
const recaptcha = { configured: true, siteKey: '6L' + 'x'.repeat(38), useEnterprise: true, secretKey: 'PRIVATE_VALUE' };
test('public build environment uses only validated public keys and never unverified Stripe/server values', () => {
 const env = publicFrontendBuildEnvironment({ buildId: 'synthetic', recaptcha });
 assert.deepEqual(Object.keys(env), ['VITE_API_URL', 'VITE_APP_BUILD_ID', 'VITE_RECAPTCHA_SITE_KEY', 'VITE_RECAPTCHA_USE_ENTERPRISE']);
 assert.equal(env.VITE_RECAPTCHA_USE_ENTERPRISE, 'true');
 assert.equal(Object.values(env).includes('PRIVATE_VALUE'), false);
 assert.throws(() => publicFrontendBuildEnvironment({ buildId: 'synthetic', recaptcha: { ...recaptcha, configured: false } }), /unavailable/);
});
test('preparation writes a new public-only env file and reports no key values', async () => {
 const root = await fs.mkdtemp('/private/tmp/narriva-public-env-test-');
 try {
  const output = path.join(root, 'public.env');
  const result = await preparePublicFrontendBuildEnvironment({ origin: 'https://example.test', buildId: 'synthetic', output, fetcher: async () => ({ ok: true, json: async () => ({ recaptcha, serverSecret: 'PRIVATE_VALUE' }) }) });
  assert.equal(JSON.stringify(result).includes(recaptcha.siteKey), false);
  const written = await fs.readFile(output, 'utf8');
  assert.match(written, /VITE_API_URL=\/api/);
  assert.equal(written.includes('PRIVATE_VALUE'), false);
  await assert.rejects(preparePublicFrontendBuildEnvironment({ origin: 'https://example.test', buildId: 'synthetic', output, fetcher: async () => ({ ok: true, json: async () => ({ recaptcha }) }) }), /EEXIST/);
 } finally { await fs.rm(root, { recursive: true, force: true }); }
});
