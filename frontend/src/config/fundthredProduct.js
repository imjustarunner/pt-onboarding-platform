// Public estimates only. Organization access and subscriptions are provisioned separately.
export const FUNDTHRED = Object.freeze({
  name: 'FundThred', descriptor: 'Finance operations', publisher: 'Plot Twist Co.',
  tagline: 'Follow the thread of every dollar.',
  website: '/fundthred', entry: '/fundthred/app',
  logo: '/assets/fundthred/wordmark.svg', icon: '/assets/fundthred/icon.svg',
  origin: 'https://plottwisthq.com'
});

export const fundthredPlans = [
  { id: 'essentials', name: 'Essentials', monthlyCents: 9900, annualCents: 95000, organizations: 1, description: 'A clear starting point for your nonprofit.', features: ['One organization', 'Grants, funds and budgets', 'Expense requests and approvals', 'Documents and operational reports'] },
  { id: 'growth', name: 'Growth', monthlyCents: 24900, annualCents: 239000, organizations: 3, description: 'Keep growing programs and their funding connected.', featured: true, features: ['Up to 3 organizations', 'Everything in Essentials', 'Program budgets and allocations', 'A shared management portfolio'] },
  { id: 'enterprise', name: 'Enterprise', monthlyCents: 49900, annualCents: 479000, organizations: 10, description: 'Bring a network of organizations into view.', features: ['Up to 10 organizations', 'Everything in Growth', 'Sponsored organization workflows', 'Implementation scoped to your network'] },
  { id: 'custom', name: 'Custom', monthlyCents: null, annualCents: null, organizations: null, description: 'A thoughtful fit for a more complex mission.', features: ['Organization count agreed together', 'Tailored implementation', 'Product bundles and service options', 'Integration requirements reviewed with you'] }
];

export const fundthredBundles = [
  { id: 'plotline', name: 'Plotline', description: 'Hiring, onboarding and people development.', href: 'https://plottwistco.com/plottline', service: 'people' },
  { id: 'conversa', name: 'Conversa', description: 'Team communication and shared conversations.', href: 'https://plottwistco.com/conversa', service: 'operations' },
  { id: 'schoolcarebridge', name: 'SchoolCareBridge', description: 'School partnerships and program coordination.', href: 'https://mh4kidz.org/schoolcarebridge', service: 'operations' },
  { id: 'plottwisthq', name: 'PlotTwistHQ', description: 'The shared home for your enabled products.', href: 'https://plottwisthq.com', service: 'hq' }
];

export function fundthredEstimate(planId, interval = 'monthly') {
  const plan = fundthredPlans.find(item => item.id === planId);
  if (!plan || !['monthly', 'annual'].includes(interval)) throw new RangeError('Choose a FundThred plan and billing period.');
  const billedCents = interval === 'annual' ? plan.annualCents : plan.monthlyCents;
  return { plan: plan.id, interval, billedCents, monthlyEquivalentCents: billedCents === null ? null : interval === 'annual' ? Math.round(billedCents / 12) : billedCents };
}
