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
