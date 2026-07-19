/**
 * Platform templates for per-business-type tenant_services + booking_packages.
 *
 * Mental health defaults are the ITSCO pay + SERVICE_DESCRIPTIONS
 * direct clinical codes (billing-report / payroll dictionary), so booking and
 * payroll speak the same catalog.
 */

import { PAYROLL_SERVICE_CODE_DEFAULTS } from '../services/payrollServiceCodeDefaults.js';

const base = (partial) => ({
  modality: 'EITHER',
  allowsIndividual: true,
  allowsGroup: false,
  isStaffBookable: true,
  isPubliclyBookable: false,
  packageEligible: true,
  programEligible: true,
  billingMethod: 'self_pay',
  serviceCode: null,
  ...partial
});

/** Human labels + notes from SERVICE_DESCRIPTIONS.md / ITSCO pay usage. */
const ITSCO_DIRECT_SERVICE_META = {
  '90791': {
    name: 'Clinical intake',
    description: 'Intake appointment: assessment, documentation, and treatment planning.'
  },
  '90832': {
    name: 'Individual psychotherapy (30 min)',
    description: 'Individual psychotherapy, 16–37 minutes.'
  },
  '90834': {
    name: 'Individual psychotherapy (45 min)',
    description: 'Individual psychotherapy, 38–52 minutes.'
  },
  '90837': {
    name: 'Individual psychotherapy (60 min)',
    description: 'Individual psychotherapy, 53+ minutes.'
  },
  '90839': {
    name: 'Crisis session',
    description: 'Emergency / high-distress psychotherapy session.'
  },
  '90840': {
    name: 'Crisis add-on (each +30 min)',
    description: 'Add-on for crisis sessions beyond 75 minutes (each additional 30 minutes).',
    packageEligible: false
  },
  '90846': {
    name: 'Family psychotherapy (without patient)',
    description: 'Family psychotherapy without the patient present (≥26 minutes).'
  },
  '90847': {
    name: 'Family psychotherapy (with patient)',
    description: 'Family or couples psychotherapy with the patient present (≥26 minutes).'
  },
  '90853': {
    name: 'Group psychotherapy',
    description: 'Group psychotherapy under a qualified clinician.',
    allowsIndividual: false,
    allowsGroup: true,
    maxParticipants: 12
  },
  '90785': {
    name: 'Interactive complexity (add-on)',
    description: 'Add-on for sessions with interactive complexity (communication barriers, additional parties, etc.).',
    packageEligible: false,
    isStaffBookable: true
  },
  '99051': {
    name: 'After-hours service (add-on)',
    description: 'Add-on for services outside Monday–Friday 8am–5pm.',
    packageEligible: false
  },
  '97535': {
    name: 'Self-care / home management training',
    description: 'Direct one-on-one instruction in ADLs, routines, safety, and functional independence.'
  },
  H0004: {
    name: 'Individual counseling (H0004)',
    description: 'Individual counseling/therapy addressing problems in the treatment/service plan.'
  },
  H0023: {
    name: 'Behavioral health outreach',
    description: 'Proactive outreach to prevent or address behavioral health issues (alliance building, re-engagement).'
  },
  H0025: {
    name: 'Behavioral health prevention education',
    description: 'Structured educational interventions to prevent disorders or reduce risk.'
  },
  H0031: {
    name: 'Mental health assessment',
    description: 'Clinical assessment of mental illness, functional capacity, and treatment recommendations.'
  },
  H0032: {
    name: 'Service plan development',
    description: 'Create, evaluate, or modify a member’s treatment/service plan.'
  },
  H2014: {
    name: 'Skills training and development',
    description: 'Skills training for community integration and daily living (15-minute units).'
  },
  H2015: {
    name: 'Comprehensive community support',
    description: 'Community-based support for children/adolescents to promote stability (15-minute units).'
  },
  H2016: {
    name: 'Comprehensive community support (day)',
    description: 'Same scope as H2015 with day-based billing structure where applicable.'
  },
  H2017: {
    name: 'Psychosocial rehabilitation',
    description: 'Psychosocial rehabilitation services (15-minute units).'
  },
  H2018: {
    name: 'Psychosocial rehabilitation (day)',
    description: 'Psychosocial rehabilitation with day-based billing structure where applicable.'
  },
  H2021: {
    name: 'Community-based wraparound',
    description: 'Individualized non-clinical wraparound interventions for community living (15-minute units).'
  },
  H2022: {
    name: 'Community-based wraparound (day)',
    description: 'Same scope as H2021 with day-based billing structure where applicable.'
  },
  H2032: {
    name: 'Activity therapy',
    description: 'Activity therapy services used in ITSCO payroll / billing imports (15-minute units).'
  },
  H2033: {
    name: 'Multisystemic therapy',
    description: 'Intensive home/family/community treatment for adolescents (15-minute units).'
  },
  S9454: {
    name: 'Stress management class',
    description: 'Structured classes on stress management and resilience.'
  },
  T1017: {
    name: 'Targeted case management',
    description: 'Care coordination and transition services (referrals, monitoring, follow-ups).'
  },
  'PRO-BONO SERVICE': {
    name: 'Pro-bono service',
    description: 'Pro-bono clinical service session (ITSCO pay dictionary).',
    billingMethod: 'other'
  }
};

/** CPT/HCPCS-shaped codes from the ITSCO pay dictionary that belong on the counseling suite. */
const ITSCO_DIRECT_BOOKABLE_CODES = [
  '90791', '90832', '90834', '90837', '90839', '90840', '90846', '90847', '90853',
  '90785', '99051', '97535',
  'H0004', 'H0023', 'H0025', 'H0031', 'H0032',
  'H2014', 'H2015', 'H2016', 'H2017', 'H2018',
  'H2021', 'H2022', 'H2032', 'H2033',
  'S9454', 'T1017',
  'PRO-BONO SERVICE'
];

function durationForCode(code) {
  const d = PAYROLL_SERVICE_CODE_DEFAULTS.get(String(code).toUpperCase());
  const mins = Number(d?.durationMinutes || 0);
  // Bookable defaults: use pay duration when meaningful; fall back to 60 for zero-minute add-ons.
  if (mins >= 5) return Math.min(480, mins);
  if (mins === 1) return 15; // minute-based H-codes → practical session default
  return 60;
}

function buildItscoMentalHealthServices() {
  return ITSCO_DIRECT_BOOKABLE_CODES.map((code, idx) => {
    const key = String(code).toUpperCase();
    const meta = ITSCO_DIRECT_SERVICE_META[key] || ITSCO_DIRECT_SERVICE_META[code] || {
      name: key,
      description: `ITSCO pay / billing service code ${key}.`
    };
    const payroll = PAYROLL_SERVICE_CODE_DEFAULTS.get(key);
    return base({
      name: meta.name,
      serviceCode: key,
      description: meta.description,
      defaultDurationMinutes: durationForCode(key),
      allowsIndividual: meta.allowsIndividual !== false,
      allowsGroup: meta.allowsGroup === true,
      maxParticipants: meta.maxParticipants ?? null,
      packageEligible: meta.packageEligible !== false,
      isStaffBookable: meta.isStaffBookable !== false,
      billingMethod: meta.billingMethod || 'self_pay',
      // Keep add-ons bookable for staff documentation/time but not publicly.
      isPubliclyBookable: false,
      sortOrder: (idx + 1) * 10,
      // Stash for audits / future billing link
      payrollCategory: payroll?.category || 'direct'
    });
  });
}

const MENTAL_HEALTH_SERVICES = buildItscoMentalHealthServices();

const MENTAL_HEALTH_PACKAGES = [
  {
    name: '4-session counseling package',
    description: 'Four counseling sessions against the mental health ledger.',
    sessionCount: 4,
    priceCents: 0,
    sortOrder: 10
  },
  {
    name: '8-session counseling package',
    description: 'Eight counseling sessions against the mental health ledger.',
    sessionCount: 8,
    priceCents: 0,
    sortOrder: 20
  }
];

function simpleSuite(serviceName, description, { duration = 60, packageName, packageSessions = 4, serviceCode = null } = {}) {
  return {
    services: [
      base({
        name: serviceName,
        serviceCode,
        description,
        defaultDurationMinutes: duration,
        isPubliclyBookable: true,
        sortOrder: 10
      })
    ],
    packages: [
      {
        name: packageName || `4-session ${serviceName.toLowerCase()} package`,
        description: `Starter package for ${serviceName.toLowerCase()}.`,
        sessionCount: packageSessions,
        priceCents: 0,
        sortOrder: 10
      }
    ]
  };
}

/** Platform templates keyed by business_type code. */
export const BUSINESS_TYPE_SERVICE_SUITES = {
  mental_health: {
    services: MENTAL_HEALTH_SERVICES,
    packages: MENTAL_HEALTH_PACKAGES
  },
  tutoring: simpleSuite('Tutoring session', 'One-on-one or small-group tutoring session.', {
    packageName: '4-session tutoring package',
    serviceCode: 'TUTORING'
  }),
  learning: simpleSuite('Learning session', 'Structured learning / academic support session.', {
    packageName: '4-session learning package'
  }),
  coaching: simpleSuite('Coaching session', 'Individual coaching session.', {
    packageName: '4-session coaching package'
  }),
  consulting: simpleSuite('Consultation', 'Consulting engagement session.', {
    duration: 60,
    packageName: '3-session consulting package',
    packageSessions: 3
  }),
  mentorship: simpleSuite('Mentorship session', 'Mentorship meeting.', {
    packageName: '4-session mentorship package'
  }),
  skills_development: simpleSuite('Skills development session', 'Skills-building or development session.', {
    packageName: '4-session skills package',
    serviceCode: 'H2014'
  }),
  other: simpleSuite('General session', 'General bookable session for this organization.', {
    packageName: '4-session package'
  })
};

export { ITSCO_DIRECT_BOOKABLE_CODES, ITSCO_DIRECT_SERVICE_META };
