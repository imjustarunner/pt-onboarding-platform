/** Top-level breakdown keys that are metadata, not billable service codes. */
const ROOT_META_KEYS = new Set(['otherPaidTimeHours']);

/** True when a breakdown object key should appear in service-code tables. */
export function isPayrollServiceCodeKey(code) {
  const k = String(code || '');
  if (!k || k.startsWith('_')) return false;
  if (ROOT_META_KEYS.has(k)) return false;
  return true;
}
