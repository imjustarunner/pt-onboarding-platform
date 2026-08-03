/** Shared slot/capacity helpers for school portal provider views. */

export function providerSlotsTotal(provider) {
  const total = Number(provider?.slots_total);
  return Number.isFinite(total) && total >= 0 ? total : null;
}

export function providerSlotsUsed(provider) {
  const usedRaw = provider?.slots_used ?? provider?.slots_used_calculated ?? null;
  const used = Number(usedRaw);
  if (Number.isFinite(used) && used >= 0) return used;
  const total = providerSlotsTotal(provider);
  const availRaw = provider?.slots_available_calculated ?? provider?.slots_available ?? null;
  const avail = Number(availRaw);
  if (total !== null && Number.isFinite(avail)) {
    return Math.max(0, total - avail);
  }
  return null;
}

export function providerSlotsOpen(provider) {
  const total = providerSlotsTotal(provider);
  const used = providerSlotsUsed(provider);
  if (total === null || used === null) return null;
  return Math.max(0, total - used);
}

/** green = 2+ open, yellow = 1 open, red = full, neutral = unknown */
export function providerCapacityColor(provider) {
  const open = providerSlotsOpen(provider);
  if (open === null) return 'neutral';
  if (open <= 0) return 'red';
  if (open === 1) return 'yellow';
  return 'green';
}

export function providerSlotsOpenLabel(provider) {
  const open = providerSlotsOpen(provider);
  if (open === null) return null;
  if (open <= 0) return 'Full';
  if (open === 1) return '1 slot open';
  return `${open} slots open`;
}

export function providerAssignmentSummary(provider) {
  const used = providerSlotsUsed(provider);
  const total = providerSlotsTotal(provider);
  const open = providerSlotsOpen(provider);
  if (total === null) return 'Slots not set';
  const usedText = used !== null ? used : '—';
  const openText = open !== null ? (open <= 0 ? 'Full' : `${open} open`) : '—';
  return `${usedText} / ${total} assigned · ${openText}`;
}
