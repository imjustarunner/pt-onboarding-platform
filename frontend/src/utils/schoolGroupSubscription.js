export const GROUP_SUBSCRIPTION_OPTIONS = [
  { value: 'all_mail', label: 'Each email' },
  { value: 'digest', label: 'Digest' },
  { value: 'daily', label: 'Abridged' },
  { value: 'none', label: 'No email' }
];

export function normalizeGroupSubscription(raw, fallback = 'all_mail') {
  const v = String(raw || '').trim().toLowerCase().replace(/-/g, '_');
  if (v === 'email' || v === 'all_mail' || v === 'each_email' || v === 'all') return 'all_mail';
  if (v === 'digest') return 'digest';
  if (v === 'daily' || v === 'abridged') return 'daily';
  if (v === 'none' || v === 'no_email') return 'none';
  return fallback;
}

export function groupSubscriptionLabel(value) {
  const key = normalizeGroupSubscription(value);
  return GROUP_SUBSCRIPTION_OPTIONS.find((o) => o.value === key)?.label || 'Each email';
}
