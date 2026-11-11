const payableStatuses = new Set(['FINALIZED', 'DRAFT_PAID']);
const status = value => String(value || '').trim().toUpperCase();
const type = row => String(row?.changeType || '').trim().toLowerCase();
const norm = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const firstName = value => {
  const name = norm(value);
  return (name.includes(',') ? name.split(',')[1].trim() : name).split(/\s+/)[0] || '';
};
const identity = row => [Number(row?.user_id || 0) || norm(row?.provider_name), String(row?.service_date || '').slice(0, 10), firstName(row?.patient_first_name)].join('|');

export function catchupIsPayableAddition(row) {
  if (!(Number(row?.user_id) > 0) || !(Number(row?.to_units) > 0)) return false;
  if (['overpaid_deleted', 'removed', 'location_changed', 'service_code_changed', 'code_change', 'ambiguous_correction'].includes(type(row))) return false;
  return payableStatuses.has(status(row?.to_status)) && !payableStatuses.has(status(row?.from_status));
}

export function catchupAppliedKey({ userId, serviceCode, rowMatchKey }) {
  return `${Number(userId || 0)}|${status(serviceCode)}|${String(rowMatchKey || '').trim()}`;
}

/** Pair a unique paid removal/addition as a correction; never auto-pay a recoded paid session. */
export function pairCatchupCorrections(changes) {
  const rows = (changes || []).map(row => ({ ...row }));
  const originalAdditions = new Set(rows.filter(row => type(row) === 'added'));
  const originalRemovals = new Set(rows.filter(row => ['removed', 'overpaid_deleted'].includes(type(row)) && payableStatuses.has(status(row.from_status))));
  const consumed = new Set();
  for (const added of rows) {
    if (!originalAdditions.has(added) || !payableStatuses.has(status(added.to_status))) continue;
    const related = rows.filter(row => identity(row) === identity(added));
    const additions = related.filter(row => originalAdditions.has(row));
    const removals = related.filter(row => originalRemovals.has(row));
    if (!removals.length) continue;
    if (additions.length !== 1 || removals.length !== 1) {
      added.changeType = 'ambiguous_correction';
      continue;
    }
    const previous = removals[0];
    const oldCode = status(previous.from_service_code);
    const newCode = status(added.to_service_code);
    added.changeType = oldCode === newCode ? 'location_changed' : 'service_code_changed';
    added.from_status = previous.from_status;
    added.from_units = previous.from_units;
    added.from_service_code = previous.from_service_code;
    added.metadata_json = { ...added.metadata_json, baselineRowId: previous.metadata_json?.baselineRowId, fromLocation: previous.metadata_json?.fromLocation };
    consumed.add(previous);
  }
  return rows.filter(row => !consumed.has(row));
}

export function appliedCatchupKeys(staging) {
  const keys = new Set();
  for (const row of staging?.matched || []) {
    let meta = row.carryover?.carryoverMeta;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch { meta = null; }
    }
    for (const source of meta?.rawAuditRows || []) {
      if (source.rowMatchKey) keys.add(catchupAppliedKey({ userId: row.userId, serviceCode: row.serviceCode, rowMatchKey: source.rowMatchKey }));
    }
  }
  for (const line of staging?.manualPayLines || []) {
    let meta = line.metadata_json;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch { meta = null; }
    }
    if (meta?.kind !== 'raw_audit_reduction' || !meta.rowMatchKey) continue;
    const code = meta.details?.find(detail => detail.label === 'Service code')?.value;
    keys.add(catchupAppliedKey({ userId: line.user_id, serviceCode: code, rowMatchKey: meta.rowMatchKey }));
  }
  return keys;
}
