import { setLoginRecoveryRecaptchaConfig } from './loginRecoveryRecaptcha.js';

// Invalidating synchronously restores ordinary config. A prior account/tenant's
// delayed status response must never disable verification for the current one.
export function createLoginRecoveryCaptchaScope(loadStatus) {
  let generation = 0;
  let cachedKey = '';
  let cachedRequired = false;
  let disposed = false;
  function invalidate() {
    generation += 1;
    cachedKey = '';
    setLoginRecoveryRecaptchaConfig();
  }
  async function load({ organizationSlug = '', identifier = '' } = {}) {
    if (disposed) return { current: false };
    const context = { organizationSlug, identifier: String(identifier).trim().toLowerCase() };
    const key = JSON.stringify(context);
    if (cachedKey === key) return { current: true, required: cachedRequired };
    const request = ++generation;
    setLoginRecoveryRecaptchaConfig();
    try {
      const rc = await loadStatus(context);
      if (disposed || request !== generation) return { current: false };
      setLoginRecoveryRecaptchaConfig({ siteKey: rc?.siteKey, useEnterprise: rc?.useEnterprise === true,
        disabled: rc?.skipForSyntheticQa === true });
      cachedKey = key;
      cachedRequired = rc?.required === true;
      return { current: true, required: cachedRequired };
    } catch {
      if (disposed || request !== generation) return { current: false };
      return { current: true, required: false };
    }
  }
  return { load, invalidate, dispose() { invalidate(); disposed = true; } };
}
