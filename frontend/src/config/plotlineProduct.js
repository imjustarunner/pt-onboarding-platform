// Launch estimates in USD cents. Quoting never provisions access or charges a card.
// Existing customer contracts remain unchanged until an explicit plan migration.
export const PLOTLINE_PRODUCT = Object.freeze({
  id: 'plotline', name: 'Plotline', publisher: 'PlotTwistCo', domain: 'plotlinepo.com',
  monthlyBaseCents: 19900, includedEmployees: 25, additionalEmployeeCents: 400,
  connectedCreditCents: 5000, suiteCreditCents: 7000,
  currency: 'USD', interval: 'month',
  includedFeatures: ['hiringEnabled', 'peopleOpsEnabled', 'onboardingTraining'],
  qualifyingProducts: ['auricwell', 'schoolcarebridge', 'conversa']
});

export function estimatePlotlinePrice({ employees = 25, otherPaidProducts = [] } = {}, pricing = PLOTLINE_PRODUCT) {
  if (!Number.isSafeInteger(employees) || employees < 0 || employees > 100000) throw new RangeError('Enter a whole employee count from 0 to 100,000.');
  if (!Array.isArray(otherPaidProducts)) throw new TypeError('Paid products must be a list.');
  const count = new Set(otherPaidProducts.filter(product => pricing.qualifyingProducts.includes(product))).size;
  const extraEmployees = Math.max(0, employees - pricing.includedEmployees);
  const subtotalCents = pricing.monthlyBaseCents + extraEmployees * pricing.additionalEmployeeCents;
  const discountCents = Math.min(pricing.monthlyBaseCents, count >= 2 ? pricing.suiteCreditCents : count === 1 ? pricing.connectedCreditCents : 0);
  return { employees, extraEmployees, subtotalCents, discountCents, monthlyCents: subtotalCents - discountCents, package: count >= 2 ? 'suite' : count === 1 ? 'connected' : 'standalone' };
}
