import config from '../config/config.js';

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

export const verifyRecaptchaV3 = async ({ token, remoteip, expectedAction } = {}) => {
  const secretKey = config.recaptcha?.secretKey || process.env.RECAPTCHA_SECRET_KEY || null;
  if (!secretKey) {
    return { ok: false, reason: 'missing_secret' };
  }
  const cleanedToken = String(token || '').trim();
  if (!cleanedToken) {
    return { ok: false, reason: 'missing_token' };
  }

  const params = new URLSearchParams({
    secret: secretKey,
    response: cleanedToken
  });
  if (remoteip) params.append('remoteip', String(remoteip));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      body: params,
      signal: controller.signal
    });
    const data = await resp.json().catch(() => ({}));
    if (!data || data.success !== true) {
      return {
        ok: false,
        reason: 'verification_failed',
        errorCodes: data?.['error-codes'] || []
      };
    }
    if (expectedAction && data.action && data.action !== expectedAction) {
      return { ok: false, reason: 'action_mismatch', action: data.action };
    }
    return { ok: true, score: data.score ?? null, action: data.action ?? null };
  } catch (error) {
    return { ok: false, reason: 'network_error', error };
  } finally {
    clearTimeout(timeout);
  }
};
