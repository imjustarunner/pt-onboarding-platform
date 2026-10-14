// Canonical AuricWell rate card. Regenerate frontend copy with sync-auricwell-pricing.mjs.
// Prices are USD. This module calculates quotes; a quote never activates billing.
export const AURICWELL_PRICING_VERSION = '2026-10-14';
export const AURICWELL_SEAT_CATEGORIES = Object.freeze({
  administrator: 'Administrator / practice or clinical administrator',
  independent: 'Provider billing under their own license (including supervisors)',
  supervised: 'Provider billing under another license with required note signing / cosigning',
  support: 'Support / billing staff'
});
export const AURICWELL_METERS = Object.freeze({
  video: { label: 'Video participant-minutes', unit: 'participant-minute', overageMicros: 12000 },
  sms: { label: 'US SMS segments (texts and text notifications)', unit: 'segment', overageMicros: 30000 },
  claims: { label: 'Electronic claim submissions', unit: 'claim', overageMicros: 600000 },
  eras: { label: 'ERA claim responses', unit: 'claim response', overageMicros: 600000 },
  eligibility: { label: 'Eligibility checks', unit: 'check', overageMicros: 600000 }
});
export const AURICWELL_PLANS = Object.freeze([
  { id: 'basic', name: 'Basic', baseCents: 4900, seats: { administrator: 5900, independent: 3900, supervised: 2000, support: 0 },
    included: { video: 300, sms: 100, claims: 10, eras: 10, eligibility: 5 },
    perClinicalSeat: { video: 300, sms: 50, claims: 10, eras: 10, eligibility: 5 } },
  { id: 'premium', name: 'Premium', baseCents: 9900, seats: { administrator: 7900, independent: 5900, supervised: 3000, support: 0 },
    included: { video: 1000, sms: 250, claims: 25, eras: 25, eligibility: 15 },
    perClinicalSeat: { video: 600, sms: 100, claims: 20, eras: 20, eligibility: 10 } },
  { id: 'premium_plus', name: 'Premium Plus', baseCents: 14900, seats: { administrator: 9900, independent: 7900, supervised: 4000, support: 0 },
    included: { video: 2000, sms: 500, claims: 50, eras: 50, eligibility: 25 },
    perClinicalSeat: { video: 900, sms: 150, claims: 30, eras: 30, eligibility: 15 } }
].map(p => Object.freeze({ ...p, seats: Object.freeze(p.seats), included: Object.freeze(p.included), perClinicalSeat: Object.freeze(p.perClinicalSeat) })));
export const AURICWELL_PRICING_RULES = Object.freeze([
  'One practice plan, one seat charge per person. One administrator is included and may also see clients. Additional administrative permissions do not create additional seats.',
  'Support and billing staff are included. Clinical work requires a clinical seat. Billing category is separate from app permissions.',
  'The supervised rate requires both billing under another clinician’s license and required EHR note signing or cosigning by that clinician. Supervision attendance alone does not qualify. An independently billing supervisor uses the independent rate.',
  'Monthly allowances are pooled within the practice: the practice allowance plus the per-clinical-seat allowance. A clinical administrator also contributes that allowance. Unused units expire at month end; they do not roll over or transfer between practices.',
  'Video counts every connected participant, including clients and guests: a 60-minute session with two people uses 120 participant-minutes. Recordings, transcription, captions, voice calls and other add-ons have separate agreed rates.',
  'Text messages and text notifications use the same US SMS segment pool. Both inbound and outbound segments count. Long messages and some characters use multiple segments. In-app and standard transactional email notifications are included; marketing campaigns are separate.',
  'Claims, ERA claim responses and eligibility checks have separate pools. Successful corrected or secondary claim transmissions count separately; retries with the same transaction reference count once. Rejected requests that never reach the clearinghouse do not count.',
  'All tiers can use supported payers after required enrollment. Payer access is not a tier limit. Additional billing tax IDs, paper/fax, attachments, dedicated phone numbers, carrier registration, international messaging and payment processing require separate disclosed terms.',
  'Integrated supervision meetings, video and tracking start with Premium. A supervised billing seat in Basic still supports required clinical note signing; it does not include supervision meeting management.',
  'Existing signed prices and launch access remain in effect until a separately accepted agreement changes them. Published pricing does not authorize a charge or activate an integration.'
]);
export function pricingInteger(value, label, max = 100000000) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new Error(`Enter a valid ${label}.`);
  return value;
}
export function auricwellPlan(tier) {
  const plan = AURICWELL_PLANS.find(p => p.id === tier);
  if (!plan) throw new Error('Choose an AuricWell plan.');
  return plan;
}
/** Explicit seat assignments, not inferred from permission roles or job titles. */
export function validateAuricwellSeats(seats) {
  if (!Array.isArray(seats) || seats.length > 10000) throw new Error('Review the practice seat list.');
  const seen = new Set();
  return seats.map(seat => {
    const userId = pricingInteger(seat.userId, 'seat user ID');
    if (!userId || seen.has(userId)) throw new Error('Use one seat category per person.');
    seen.add(userId);
    if (!Object.hasOwn(AURICWELL_SEAT_CATEGORIES, seat.category)) throw new Error('Select an explicit billing category for every person.');
    if (typeof seat.clinical !== 'boolean') throw new Error('Specify whether the person provides clinical care.');
    if (seat.category === 'support' && seat.clinical) throw new Error('Clinical staff need a provider or administrator seat.');
    if (['independent', 'supervised'].includes(seat.category) && !seat.clinical) throw new Error('Provider seats must be marked as clinical.');
    if (seat.category === 'supervised') {
      if (seat.billsUnderOtherLicense !== true || seat.requiresCosign !== true || !Number.isSafeInteger(seat.signingProviderId) || seat.signingProviderId < 1 || seat.signingProviderId === userId) {
        throw new Error('A supervised seat needs a different signing clinician, billing under that clinician’s license, and required note signing or cosigning.');
      }
    }
    return { userId, category: seat.category, clinical: seat.clinical,
      ...(seat.category === 'supervised' ? { signingProviderId: seat.signingProviderId, requiresCosign: true, billsUnderOtherLicense: true } : {}) };
  });
}
export function estimateAuricwell({ tier, counts, clinicalAdministrators = 0, usage = {}, vendorCostsCents = null }) {
  const plan = auricwellPlan(tier);
  const quantities = Object.fromEntries(Object.keys(AURICWELL_SEAT_CATEGORIES).map(key => [key, pricingInteger(counts?.[key] ?? 0, `${key} seat count`, 10000)]));
  pricingInteger(clinicalAdministrators, 'clinical administrator count', quantities.administrator);
  const clinicalSeats = quantities.independent + quantities.supervised + clinicalAdministrators;
  const chargeLines = [{ key: 'auricwell_base', label: `${plan.name} practice plan (one administrator included)`, quantity: 1, amountCents: plan.baseCents }];
  for (const [category, count] of Object.entries(quantities)) {
    const quantity = category === 'administrator' ? Math.max(0, count - 1) : count;
    chargeLines.push({ key: `auricwell_seat_${category}`, label: AURICWELL_SEAT_CATEGORIES[category], quantity, unitCents: plan.seats[category], amountCents: quantity * plan.seats[category] });
  }
  const subscriptionCents = chargeLines.reduce((sum, l) => sum + l.amountCents, 0);
  const meters = Object.entries(AURICWELL_METERS).map(([key, meter]) => {
    const used = usage[key] ?? 0;
    pricingInteger(used, `${meter.label} usage`);
    const included = plan.included[key] + clinicalSeats * plan.perClinicalSeat[key];
    const overage = Math.max(0, used - included);
    // Preserve sub-cent rates; round once on each total, not on every participant-minute.
    const amountCents = Math.round(overage * meter.overageMicros / 10000);
    const line = { key, ...meter, used, included, overage, amountCents, percentUsed: included ? Math.round(used / included * 100) : 0 };
    chargeLines.push({ key: `auricwell_usage_${key}`, label: `${meter.label}: ${overage} above ${included} included`, quantity: overage, unitMicros: meter.overageMicros, amountCents });
    return line;
  });
  const totalCents = chargeLines.reduce((sum, l) => sum + l.amountCents, 0);
  const vendorCostCents = vendorCostsCents == null ? null : pricingInteger(vendorCostsCents, 'verified vendor costs in cents');
  return { pricingVersion: AURICWELL_PRICING_VERSION, tier, quantities, clinicalSeats, subscriptionCents, meters, chargeLines,
    totalCents, vendorCostCents, contributionCents: vendorCostCents == null ? null : totalCents - vendorCostCents };
}
export function quoteAuricwellSeats(input) {
  const seats = validateAuricwellSeats(input.seats);
  const counts = Object.fromEntries(Object.keys(AURICWELL_SEAT_CATEGORIES).map(k => [k, seats.filter(s => s.category === k).length]));
  return { ...estimateAuricwell({ ...input, counts, clinicalAdministrators: seats.filter(s => s.category === 'administrator' && s.clinical).length }), seats };
}
