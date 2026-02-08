import config from '../config/config.js';

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

const buildEnterpriseUrl = () => {
  const projectId = config.recaptcha?.enterpriseProjectId;
  const apiKey = config.recaptcha?.enterpriseApiKey;
  if (!projectId || !apiKey) return null;
  return `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/assessments?key=${encodeURIComponent(apiKey)}`;
};

const verifyRecaptchaEnterprise = async ({ token, expectedAction } = {}) => {
  const siteKey = config.recaptcha?.siteKey;
  const url = buildEnterpriseUrl();
  if (!url) {
    return { ok: false, reason: 'missing_enterprise_config' };
  }
  if (!siteKey) {
    return { ok: false, reason: 'missing_site_key' };
  }
  const cleanedToken = String(token || '').trim();
  if (!cleanedToken) {
    return { ok: false, reason: 'missing_token' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: {
          token: cleanedToken,
          siteKey,
          expectedAction
        }
      }),
      signal: controller.signal
    });
    const data = await resp.json().catch(() => ({}));
    const tokenProps = data?.tokenProperties || {};
    const risk = data?.riskAnalysis || {};
    if (!tokenProps?.valid) {
      return {
        ok: false,
        reason: 'verification_failed',
        errorCodes: tokenProps?.invalidReason ? [tokenProps.invalidReason] : []
      };
    }
    if (expectedAction && tokenProps.action && tokenProps.action !== expectedAction) {
      return { ok: false, reason: 'action_mismatch', action: tokenProps.action };
    }
    return { ok: true, score: risk.score ?? null, action: tokenProps.action ?? null };
  } catch (error) {
    return { ok: false, reason: 'network_error', error };
  } finally {
    clearTimeout(timeout);
  }
};

export const verifyRecaptchaV3 = async ({ token, remoteip, expectedAction } = {}) => {
  if (config.recaptcha?.enterpriseApiKey) {
    return verifyRecaptchaEnterprise({ token, expectedAction });
  }
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
