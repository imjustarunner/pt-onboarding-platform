// Planning only. These public list prices never authorize a charge or an API call.
// Source: https://www.claim.md/pricing, checked 2026-09-25.
export const claimMdPlans = {
  unlimited: { label: 'Unlimited', monthly: 12000, claims: Infinity, eras: Infinity, eligibility: 1000, claimRate: 0, eraRate: 0 },
  small: { label: 'Small Volume', monthly: 6000, claims: 100, eras: 100, eligibility: 100, claimRate: 50, eraRate: 50 },
  basic: { label: 'Basic', monthly: 3000, claims: 0, eras: 0, eligibility: 0, claimRate: 30, eraRate: 30 }
};

function number(value, label, max = 100000000, integer = true) {
  if (value === '' || value == null || typeof value === 'boolean') throw new Error(`Enter ${label}.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max || (integer && !Number.isInteger(n))) throw new Error(`Enter a valid ${label}.`);
  return n;
}
const over = (count, included, rate) => Math.max(0, count - included) * rate;

/** All volumes cover ONE Claim.MD account, including every tenant sharing it.
 * Prime/non-Prime bounds avoid inventing which payer consumes the shared allowance.
 * ERA volume is CLP responses, not files. Weekly uses 52 / 12 (annual average).
 */
export function estimateBillingCosts(input) {
  const plan = claimMdPlans[input.plan];
  if (!plan) throw new Error('Choose the actual Claim.MD plan.');
  const clients = number(input.clients, 'insured client count', 1000000);
  const secondaryClients = number(input.secondaryClients, 'clients with secondary coverage', clients);
  const visits = number(input.visits, 'monthly visits', 10000000);
  const secondaryVisits = number(input.secondaryVisits, 'visits with secondary coverage', visits);
  const claims = number(input.claims, 'monthly electronic claims', 10000000);
  const eras = number(input.eras, 'monthly ERA claim responses', 10000000);
  const extraChecks = number(input.extraChecks, 'additional monthly eligibility checks', 10000000);
  const taxIdFees = number(input.taxIdFeesCents, 'additional monthly tax ID fees in cents');
  const cardVolume = number(input.cardVolumeCents, 'monthly card volume in cents', 10000000000);
  const cardTransactions = number(input.cardTransactions, 'monthly card transaction count', 10000000);
  if ((cardVolume > 0) !== (cardTransactions > 0)) throw new Error('Enter both card volume and transaction count, or set both to zero.');
  const processorBps = number(input.processorBps, 'processor rate in basis points', 10000);
  const processorFixed = number(input.processorFixedCents, 'processor fixed fee in cents', 10000);
  const markupBps = number(input.markupBps, 'proposed platform rate in basis points', 10000);
  const otherProcessorFees = number(input.otherProcessorFeesCents, 'other monthly processor fees in cents');
  const claimCost = over(claims, plan.claims, plan.claimRate);
  const eraCost = over(eras, plan.eras, plan.eraRate);
  const fixed = plan.monthly + taxIdFees + claimCost + eraCost;
  const scenarios = [
    ['monthly', 'Monthly', clients + secondaryClients],
    ['weekly', 'Weekly (monthly average)', Math.ceil((clients + secondaryClients) * 52 / 12)],
    ['each_visit', 'Before each visit', visits + secondaryVisits]
  ].map(([id, label, checks]) => {
    const totalChecks = checks + extraChecks;
    const excessChecks = Math.max(0, totalChecks - plan.eligibility);
    const lowRate = input.plan === 'unlimited' ? 2 : input.plan === 'small' ? 50 : 30;
    const highRate = input.plan === 'unlimited' ? 10 : lowRate;
    return { id, label, checks: totalChecks, excessChecks,
      eligibilityLowCents: excessChecks * lowRate, eligibilityHighCents: excessChecks * highRate,
      totalLowCents: fixed + excessChecks * lowRate, totalHighCents: fixed + excessChecks * highRate };
  });
  const processorCents = Math.round(cardVolume * processorBps / 10000) + cardTransactions * processorFixed + otherProcessorFees;
  const platformCents = Math.round(cardVolume * markupBps / 10000);
  return { planMonthlyCents: plan.monthly, taxIdFeesCents: taxIdFees, claimCostCents: claimCost, eraCostCents: eraCost, scenarios,
    cards: { processorCents, platformCents, combinedCents: processorCents + platformCents } };
}
