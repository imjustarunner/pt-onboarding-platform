// Staff-only explanations: ranges and categories, never client or calendar contents.
export function availabilityDiagnostics({ bases, blockers, policy, formatAllowed, officeAllowed, slotMinutes }) {
 return bases.map(base => {
  const reasons = new Set(base.reasons || []);
  if (!formatAllowed(policy, base.format)) reasons.add('Closed to new clients or this appointment format is disabled');
  if (base.format === 'IN_PERSON' && !officeAllowed(policy, base.meta?.buildingId)) reasons.add('Office excluded in this agency’s preferences');
  for (const [label, ranges] of blockers) {
   if (ranges.some(r => r.start < base.end && r.end > base.start)) reasons.add(label);
  }
  if (base.end - base.start < slotMinutes * 60000) reasons.add(`Published window is shorter than ${slotMinutes} minutes`);
  return { startAt: base.start.toISOString(), endAt: base.end.toISOString(), format: base.format,
   buildingName: base.meta?.buildingName || null, reasons: [...reasons] };
 }).filter(row => row.reasons.length);
}
