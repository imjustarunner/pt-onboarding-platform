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

/** A slot is filled only when it has a real client selected on the soft schedule. */
export function countFilledSoftScheduleSlots(slots, caseloadClients = null) {
  const list = Array.isArray(slots) ? slots : [];
  let allowed = null;
  if (Array.isArray(caseloadClients) && caseloadClients.length) {
    allowed = new Set(
      caseloadClients
        .map((c) => Number(c?.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    );
  }
  let filled = 0;
  for (const slot of list) {
    const id = Number(slot?.client_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (allowed && !allowed.has(id)) continue;
    filled += 1;
  }
  return filled;
}

/** Overlay API caseload counts with who is actually placed on the day's time grid. */
export function withSoftScheduleOccupancy(provider, slots, caseloadClients = null) {
  const list = Array.isArray(slots) ? slots : [];
  if (!list.length) return provider;
  const total = providerSlotsTotal(provider) ?? list.length;
  const used = countFilledSoftScheduleSlots(list, caseloadClients);
  return {
    ...provider,
    slots_used: used,
    slots_available_calculated: total == null ? null : Math.max(0, total - used)
  };
}
