/** Display helpers for hourly Log Time (`indirect_time`) payroll claims. */

export function logTimeBucketLabel(bucket) {
  const b = String(bucket || '').trim().toLowerCase();
  if (b === 'other_1') return 'Other 1';
  if (b === 'direct') return 'Direct';
  return 'Indirect';
}

export function logTimeAllocationRows(payload) {
  const allocations = Array.isArray(payload?.allocations) ? payload.allocations : [];
  return allocations.map((a, idx) => {
    const baseLabel = String(a.serviceTypeLabel || a.label || 'Activity').trim() || 'Activity';
    const code = String(a.activityCode || '').trim();
    const label = code && !baseLabel.startsWith(code) ? `${code} ${baseLabel}` : baseLabel;
    return {
      key: `${idx}-${a.serviceTypeId || a.serviceTypeKey || a.serviceTypeLabel || 'row'}`,
      label,
      activityCode: code || null,
      minutes: Number(a.minutes || 0),
      note: String(a.note || a.activityNote || '').trim(),
      startTime: a.startTime || null,
      endTime: a.endTime || null,
      payBucket: logTimeBucketLabel(a.payBucket || a.pay_bucket || payload?.bucket),
    };
  });
}

/** One-line summary for tables: "Writing Notes 45 min — reviewed charts; Training 25 min". */
export function logTimeActivitiesSummary(payload, { maxItems = 3 } = {}) {
  const rows = logTimeAllocationRows(payload);
  if (!rows.length) return '';
  const shown = rows.slice(0, maxItems).map((r) => {
    const parts = [`${r.label} ${r.minutes} min`];
    if (r.note) parts.push(`— ${r.note}`);
    return parts.join(' ');
  });
  const extra = rows.length > maxItems ? ` (+${rows.length - maxItems} more)` : '';
  return shown.join('; ') + extra;
}
