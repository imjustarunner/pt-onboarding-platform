/**
 * Billing pricing for the platform.
 *
 * Amounts are in cents to avoid floating point drift.
 */

const PRICING = {
  baseFeeCents: 19900,
  included: {
    schools: 2,
    programs: 3,
    admins: 3,
    activeOnboardees: 15
  },
  unitCents: {
    school: 2500,
    program: 1000,
    admin: 500,
    onboardee: 400
  }
};

function overage(included, used) {
  const inc = Math.max(0, Number(included || 0));
  const u = Math.max(0, Number(used || 0));
  return Math.max(0, u - inc);
}

export function getBillingPricingConfig() {
  return PRICING;
}

export function buildEstimate(usage) {
  const schoolsUsed = Number(usage?.schoolsUsed || 0);
  const programsUsed = Number(usage?.programsUsed || 0);
  const adminsUsed = Number(usage?.adminsUsed || 0);
  const activeOnboardeesUsed = Number(usage?.activeOnboardeesUsed || 0);

  const schoolsOver = overage(PRICING.included.schools, schoolsUsed);
  const programsOver = overage(PRICING.included.programs, programsUsed);
  const adminsOver = overage(PRICING.included.admins, adminsUsed);
  const onboardeesOver = overage(PRICING.included.activeOnboardees, activeOnboardeesUsed);

  const extraSchoolsCents = schoolsOver * PRICING.unitCents.school;
  const extraProgramsCents = programsOver * PRICING.unitCents.program;
  const extraAdminsCents = adminsOver * PRICING.unitCents.admin;
  const extraOnboardeesCents = onboardeesOver * PRICING.unitCents.onboardee;

  const totalCents =
    PRICING.baseFeeCents +
    extraSchoolsCents +
    extraProgramsCents +
    extraAdminsCents +
    extraOnboardeesCents;

  const lineItems = [
    {
      key: 'schools',
      label: 'Schools',
      included: PRICING.included.schools,
      used: schoolsUsed,
      overage: schoolsOver,
      unitCostCents: PRICING.unitCents.school,
      extraCents: extraSchoolsCents
    },
    {
      key: 'programs',
      label: 'Programs',
      included: PRICING.included.programs,
      used: programsUsed,
      overage: programsOver,
      unitCostCents: PRICING.unitCents.program,
      extraCents: extraProgramsCents
    },
    {
      key: 'admins',
      label: 'Admins',
      included: PRICING.included.admins,
      used: adminsUsed,
      overage: adminsOver,
      unitCostCents: PRICING.unitCents.admin,
      extraCents: extraAdminsCents
    },
    {
      key: 'active_onboardees',
      label: 'Active Candidates',
      included: PRICING.included.activeOnboardees,
      used: activeOnboardeesUsed,
      overage: onboardeesOver,
      unitCostCents: PRICING.unitCents.onboardee,
      extraCents: extraOnboardeesCents
    }
  ];

  return {
    pricing: PRICING,
    usage: {
      schoolsUsed,
      programsUsed,
      adminsUsed,
      activeOnboardeesUsed
    },
    totals: {
      baseFeeCents: PRICING.baseFeeCents,
      extraSchoolsCents,
      extraProgramsCents,
      extraAdminsCents,
      extraOnboardeesCents,
      totalCents
    },
    lineItems
  };
}

