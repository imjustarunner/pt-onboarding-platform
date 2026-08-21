/**
 * reCAPTCHA v3 / Enterprise token for login recovery (forgot password, recover username).
 * Production uses Enterprise (VITE_RECAPTCHA_USE_ENTERPRISE=true); login must load
 * enterprise.js, not the standard api.js, or tokens never reach the backend.
 */

let runtimeConfig = null;

export function setLoginRecoveryRecaptchaConfig({ siteKey, useEnterprise } = {}) {
  const key = String(siteKey || '').trim();
  if (!key) return;
  runtimeConfig = {
    siteKey: key,
    useEnterprise: useEnterprise === true
  };
}

function getConfig() {
  const siteKey = runtimeConfig?.siteKey
    || String(import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim();
  const useEnterprise = runtimeConfig?.useEnterprise ?? (
    String(import.meta.env.VITE_RECAPTCHA_USE_ENTERPRISE || '').toLowerCase() === 'true'
  );
  return { siteKey, useEnterprise };
}

export function isLoginRecoveryRecaptchaConfigured() {
  return !!getConfig().siteKey;
}

function recaptchaReady(grecaptcha) {
  if (!grecaptcha) return false;
  const { useEnterprise } = getConfig();
  return useEnterprise
    ? typeof grecaptcha?.enterprise?.execute === 'function'
    : typeof grecaptcha?.execute === 'function';
}

let loadPromise = null;

async function waitForRecaptchaApi(grecaptcha) {
  for (let i = 0; i < 50; i++) {
    if (recaptchaReady(grecaptcha)) return grecaptcha;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    grecaptcha = window.grecaptcha;
  }
  return recaptchaReady(grecaptcha) ? grecaptcha : null;
}

async function loadLoginRecoveryRecaptcha() {
  const { siteKey, useEnterprise } = getConfig();
  if (!siteKey) return null;
  if (recaptchaReady(window.grecaptcha)) return window.grecaptcha;

  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-login-recaptcha="true"]');
      if (existing) {
        existing.addEventListener('load', () => {
          waitForRecaptchaApi(window.grecaptcha).then(resolve).catch(reject);
        }, { once: true });
        existing.addEventListener('error', () => reject(new Error('Failed to load reCAPTCHA')), { once: true });
        waitForRecaptchaApi(window.grecaptcha).then(resolve).catch(reject);
        return;
      }

      const script = document.createElement('script');
      script.src = useEnterprise
        ? `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(siteKey)}`
        : `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-login-recaptcha', 'true');
      script.setAttribute('data-recaptcha-mode', useEnterprise ? 'enterprise' : 'standard');
      script.onload = () => {
        waitForRecaptchaApi(window.grecaptcha).then(resolve).catch(reject);
      };
      script.onerror = () => reject(new Error('Failed to load reCAPTCHA'));
      document.head.appendChild(script);
    }).catch((err) => {
      loadPromise = null;
      throw err;
    });
  }

  return loadPromise;
}

export async function getLoginRecoveryCaptchaToken(action) {
  const { siteKey, useEnterprise } = getConfig();
  if (!siteKey) return '';
  try {
    const grecaptcha = await loadLoginRecoveryRecaptcha();
    if (!grecaptcha) return '';
    if (useEnterprise && typeof grecaptcha?.enterprise?.execute === 'function') {
      return await grecaptcha.enterprise.execute(siteKey, { action });
    }
    if (typeof grecaptcha?.execute === 'function') {
      return await grecaptcha.execute(siteKey, { action });
    }
    return '';
  } catch {
    return '';
  }
}
