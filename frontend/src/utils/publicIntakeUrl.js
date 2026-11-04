import { SCB_ORIGIN, isSchoolCareBridgeHost } from './schoolCareBridge.js';

export const getPublicIntakeBaseUrl = () => {
  const raw = import.meta.env.VITE_PUBLIC_INTAKE_BASE_URL || '';
  const trimmed = String(raw || '').trim();
  if (trimmed) {
    return trimmed.replace(/\/$/, '');
  }
  return String(window.location.origin || '').replace(/\/$/, '');
};

export const buildPublicIntakeUrl = (publicKey) => {
  const key = String(publicKey || '').trim();
  if (!key) return '';
  return `${getPublicIntakeBaseUrl()}/intake/${key}`;
};

export const buildPublicIntakeShortUrl = (publicKey) => {
  const key = String(publicKey || '').trim();
  if (!key) return '';
  return `${getPublicIntakeBaseUrl()}/i/${key}`;
};

export const buildPreferencesFormUrl = (publicKey) => {
  const key = String(publicKey || '').trim();
  if (!key) return '';
  return `${getPublicIntakeBaseUrl()}/preferences-form/${key}`;
};

export const buildLifeBalanceFormUrl = (publicKey, query = {}) => {
  const key = String(publicKey || '').trim();
  if (!key) return '';
  const base = `${getPublicIntakeBaseUrl()}/life-balance-form/${encodeURIComponent(key)}`;
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v != null && String(v).trim() !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
};

/** Returns the correct public URL for any form type */
export const buildFormUrl = (publicKey, formType, query = {}) => {
  if (String(formType || '') === 'internal_preferences') {
    return buildPreferencesFormUrl(publicKey);
  }
  if (String(formType || '') === 'life_balance_wheel') {
    return buildLifeBalanceFormUrl(publicKey, query);
  }
  return buildPublicIntakeUrl(publicKey);
};

/** School sharing uses its own public origin, separate from a tenant's app/API host. */
export const getSchoolPublicOrigin = (origin = globalThis.window?.location?.origin || '') => {
  let current;
  try { current = new URL(origin); } catch { /* Use the canonical origin below. */ }
  if (current && ['localhost', '127.0.0.1', '[::1]'].includes(current.hostname)) return current.origin;
  const configured = import.meta.env.VITE_SCHOOLCAREBRIDGE_PUBLIC_ORIGIN || import.meta.env.VITE_PUBLIC_INTAKE_BASE_URL;
  for (const candidate of [configured, current?.hostname === 'mh4kidz.org' ? current.origin : '']) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' && !url.username && !url.password && !url.port
          && url.pathname === '/' && !url.search && !url.hash
          && (isSchoolCareBridgeHost(url.hostname) || url.hostname === 'mh4kidz.org')) return url.origin;
    } catch { /* An unrelated or invalid override cannot move school links off the school service. */ }
  }
  return SCB_ORIGIN;
};

/** A school has one bilingual enrollment address, independent of its agency host. */
export const buildSchoolEnrollmentUrl = (publicKey) => {
  const key = String(publicKey || '').trim();
  if (!key) return '';
  return `${getSchoolPublicOrigin()}/intake/${encodeURIComponent(key)}`;
};

export const buildSchoolReferralFinderUrl = (agencySlug) => {
  const slug = String(agencySlug || '').trim();
  return slug ? `${getSchoolPublicOrigin()}/${encodeURIComponent(slug)}/school-referral` : '';
};
