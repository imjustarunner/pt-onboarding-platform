const locked = period => ['posted', 'finalized'].includes(String(period?.status || '').toLowerCase());
const timestamp = value => {
  if (value instanceof Date) return value.getTime();
  const text = String(value || '').trim();
  if (!text) return NaN;
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text).getTime();
};

/** Original posted imports remain immutable; only a later catch-up import can be reviewed. */
export function draftReviewAllowedForImport({ period, payrollImport }) {
  if (!period || !payrollImport || Number(period.id) !== Number(payrollImport.payroll_period_id) || Number(period.agency_id) !== Number(payrollImport.agency_id)) return false;
  if (!locked(period)) return true;
  if (!(Number(payrollImport.slot_number) > 1)) return false;
  const postedAt = timestamp(period.posted_at);
  const finalizedAt = timestamp(period.finalized_at);
  const lockedAt = Math.max(Number.isFinite(postedAt) ? postedAt : -Infinity, Number.isFinite(finalizedAt) ? finalizedAt : -Infinity);
  const importedAt = timestamp(payrollImport.created_at);
  return Number.isFinite(lockedAt) && Number.isFinite(importedAt) && importedAt > lockedAt;
}

/** A prior explicit payable toggle is also review evidence, but only for its saved choice. */
export function annotateDraftReviews({ rows = [], audits = [] }) {
  const ordered = [...audits].filter(audit => ['draft_reviewed', 'draft_payable'].includes(audit.field_changed)).sort((a, b) => {
    const timeA = timestamp(a.changed_at), timeB = timestamp(b.changed_at);
    return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0) || Number(b.id || 0) - Number(a.id || 0);
  });
  const latest = new Map();
  for (const audit of ordered) {
    const id = Number(audit.payroll_import_row_id);
    if (!latest.has(id)) latest.set(id, audit);
  }
  return rows.map(row => {
    const audit = latest.get(Number(row.id));
    const value = String(audit?.to_value ?? '').trim();
    const reviewed = String(row.note_status || '').toUpperCase() === 'DRAFT' && !!audit && ['0', '1'].includes(value) && Number(value) === (Number(row.draft_payable || 0) ? 1 : 0);
    return { ...row, draft_reviewed: reviewed, draft_reviewed_at: reviewed ? audit.changed_at || null : null };
  });
}
