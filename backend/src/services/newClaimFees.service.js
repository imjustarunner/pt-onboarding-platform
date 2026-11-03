import { resolveCanonicalFeeQuote } from './feeSchedule.service.js';

// Only used while creating a claim. Existing claims retain their recorded amount
// and rate provenance even when a practice changes its schedule later.
export async function priceNewClaimLines({ lines, agencyId, payerId, providerUserId, dateOfService, durationMinutes }, resolveQuote = resolveCanonicalFeeQuote) {
  return Promise.all(lines.map(async line => {
    if (line.chargeCents !== undefined && line.chargeCents !== null && line.chargeCents !== '') {
      if (!Number.isSafeInteger(Number(line.chargeCents)) || Number(line.chargeCents) < 0) throw Object.assign(new Error('Claim charges must be nonnegative whole cents.'), { status: 400 });
      return { ...line, chargeCents: Number(line.chargeCents), feeSource: { source: 'entered', sourceLabel: 'Entered claim charge' } };
    }
    const quote = await resolveQuote({ agencyId, mode: 'insurance', payerId, providerUserId,
      dateOfService, serviceCode: line.procedureCode, units: line.units ?? 1, durationMinutes });
    return { ...line, chargeCents: quote.amountCents ?? 0, feeSource: {
      source: quote.source, sourceLabel: quote.sourceLabel, rateCents: quote.rateCents,
      rateUnit: quote.rateUnit, rateRevisionId: quote.rateRevisionId || null,
      payerId: quote.payerId || null, providerUserId: quote.providerUserId || null,
      providerRateEligible: !!quote.providerRateEligible, needsRate: quote.amountCents == null
    } };
  }));
}
