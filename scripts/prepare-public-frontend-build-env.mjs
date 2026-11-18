import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function publicFrontendBuildEnvironment({ buildId, recaptcha } = {}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(buildId || '')) throw new Error('Provide the paired release build ID.');
  if (recaptcha?.configured !== true || !/^6[A-Za-z0-9_-]{35,50}$/.test(recaptcha?.siteKey || '') || typeof recaptcha?.useEnterprise !== 'boolean') throw new Error('Public production reCAPTCHA configuration is unavailable or invalid. No environment file was written.');
  // Deliberate allowlist. Never source/copy a developer .env or server secret.
  // Stripe is not copied without an authoritative matching production source.
  return { VITE_API_URL: '/api', VITE_APP_BUILD_ID: buildId, VITE_RECAPTCHA_SITE_KEY: recaptcha.siteKey, VITE_RECAPTCHA_USE_ENTERPRISE: String(recaptcha.useEnterprise) };
}
export async function preparePublicFrontendBuildEnvironment({ origin, buildId, output, fetcher = fetch }) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use the trusted public production HTTPS origin.');
  const response = await fetcher(new URL('/api/auth/recovery-status', url), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('The public configuration endpoint is unavailable.');
  const environment = publicFrontendBuildEnvironment({ buildId, recaptcha: (await response.json()).recaptcha });
  await fs.writeFile(output, Object.entries(environment).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  return { output: path.resolve(output), sourceOrigin: url.origin, buildId, keys: Object.keys(environment), recaptchaPresent: true, enterprise: environment.VITE_RECAPTCHA_USE_ENTERPRISE === 'true', stripeIncluded: false };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {}, names = { '--origin': 'origin', '--build-id': 'buildId', '--output': 'output' };
  for (let index = 2; index < process.argv.length; index++) {
    if (!names[process.argv[index]] || !process.argv[index + 1]) throw new Error('Use --origin, --build-id and --output.');
    options[names[process.argv[index]]] = process.argv[++index];
  }
  preparePublicFrontendBuildEnvironment(options).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
