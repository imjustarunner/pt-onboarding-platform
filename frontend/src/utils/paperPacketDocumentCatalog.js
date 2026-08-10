/**
 * Paper-packet Client Readiness document catalog.
 * One-signature packet forms + separate ROI. Disclosure / balance / renewals live elsewhere.
 */

export const PAPER_PACKET_SIGNATURE_ITEMS = Object.freeze([
  { key: 'insurance_information_ack', label: 'Insurance information acknowledgement' },
  { key: 'minor_consent', label: 'Minor consent' },
  { key: 'informed_consent', label: 'Informed consent' },
  { key: 'group_consent', label: 'Group consent' },
  { key: 'policy_services_agreement', label: 'Policy and services agreement' },
  { key: 'hipaa_privacy', label: 'HIPAA privacy policy' },
  { key: 'personal_declaration', label: 'Personal declaration' },
  { key: 'law_compliance', label: 'Law compliance' }
]);

export const PAPER_PACKET_SIGNATURE_KEYS = PAPER_PACKET_SIGNATURE_ITEMS.map((i) => i.key);

export const PAPER_PACKET_SEPARATE_ITEMS = Object.freeze([
  { key: 'roi', label: 'Release of Information (ROI)' }
]);

export const ALL_PAPER_PACKET_ONBOARDING_ITEMS = Object.freeze([
  ...PAPER_PACKET_SIGNATURE_ITEMS,
  ...PAPER_PACKET_SEPARATE_ITEMS
]);

const LABEL_BY_KEY = new Map(ALL_PAPER_PACKET_ONBOARDING_ITEMS.map((i) => [i.key, i.label]));

export function paperPacketDocLabel(key) {
  return LABEL_BY_KEY.get(String(key || '').trim()) || String(key || '');
}

export function normalizeOnboardingDocStatus(status) {
  const s = String(status || 'missing').trim().toLowerCase();
  return ['present', 'missing', 'na'].includes(s) ? s : 'missing';
}

export function isOnboardingDocDone(status) {
  const s = normalizeOnboardingDocStatus(status);
  return s === 'present' || s === 'na';
}

export function normalizeOnboardingDocItems(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  }
  const existing = Array.isArray(parsed?.items) ? parsed.items : [];
  const byKey = new Map(existing.map((item) => [String(item?.key || ''), item]));
  return ALL_PAPER_PACKET_ONBOARDING_ITEMS.map((def) => {
    const row = byKey.get(def.key) || {};
    const status = normalizeOnboardingDocStatus(row.status);
    const group = PAPER_PACKET_SIGNATURE_KEYS.includes(def.key)
      ? 'packet_signature'
      : def.key;
    return {
      key: def.key,
      label: def.label,
      status,
      done: isOnboardingDocDone(status),
      group
    };
  });
}

export function buildPacketSignatureSummary(documentItems) {
  const items = (documentItems || []).filter((d) => d.group === 'packet_signature');
  const needed = items.filter((d) => !d.done);
  return {
    keys: [...PAPER_PACKET_SIGNATURE_KEYS],
    item_count: items.length,
    received_count: items.filter((d) => d.done).length,
    needed_count: needed.length,
    done: items.length > 0 && needed.length === 0,
    missing_labels: needed.map((d) => d.label)
  };
}
