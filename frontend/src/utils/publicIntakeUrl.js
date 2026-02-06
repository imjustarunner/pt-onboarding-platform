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
