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

/** Returns the correct public URL for any form type */
export const buildFormUrl = (publicKey, formType) => {
  if (String(formType || '') === 'internal_preferences') {
    return buildPreferencesFormUrl(publicKey);
  }
  return buildPublicIntakeUrl(publicKey);
};
