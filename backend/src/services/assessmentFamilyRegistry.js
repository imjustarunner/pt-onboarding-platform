/**
 * Canonical registry for the 16 assessment families in the Deliverables Hub.
 * family keys are snake_case; catalog ids / paths are kebab-case.
 */

export const ASSESSMENT_FAMILIES = [
  {
    family: 'life_balance',
    catalogId: 'life-balance',
    path: 'life-balance',
    title: 'Life Balance',
    kind: 'single',
    table: 'life_balance_assessments',
    apiPrefix: '/life-balance'
  },
  {
    family: 'values_alignment',
    catalogId: 'values-alignment',
    path: 'values-alignment',
    title: 'Values Alignment',
    kind: 'single',
    table: 'values_alignment_assessments',
    apiPrefix: '/values-alignment'
  },
  {
    family: 'teen_wellbeing',
    catalogId: 'teen-wellbeing',
    path: 'teen-wellbeing',
    title: 'Teen Well-Being',
    kind: 'single',
    table: 'teen_wellbeing_assessments',
    apiPrefix: '/teen-wellbeing'
  },
  {
    family: 'personal_fulfillment',
    catalogId: 'personal-fulfillment',
    path: 'personal-fulfillment',
    title: 'Personal Fulfillment',
    kind: 'single',
    table: 'personal_fulfillment_assessments',
    apiPrefix: '/personal-fulfillment'
  },
  {
    family: 'digital_wellness',
    catalogId: 'digital-wellness',
    path: 'digital-wellness',
    title: 'Digital Wellness',
    kind: 'single',
    table: 'digital_wellness_assessments',
    apiPrefix: '/digital-wellness'
  },
  {
    family: 'mens_life',
    catalogId: 'mens-life',
    path: 'mens-life',
    title: "Men's Life",
    kind: 'single',
    table: 'mens_life_assessments',
    apiPrefix: '/mens-life'
  },
  {
    family: 'marriage_alignment',
    catalogId: 'marriage-alignment',
    path: 'marriage-alignment',
    title: 'Marriage Alignment',
    kind: 'couples',
    table: 'marriage_alignment_cycles',
    apiPrefix: '/marriage-alignment'
  },
  {
    family: 'parenting_confidence',
    catalogId: 'parenting-confidence',
    path: 'parenting-confidence',
    title: 'Parenting Confidence',
    kind: 'single',
    table: 'parenting_confidence_assessments',
    apiPrefix: '/parenting-confidence'
  },
  {
    family: 'burden_purpose',
    catalogId: 'burden-purpose',
    path: 'burden-purpose',
    title: 'Burden & Purpose',
    kind: 'single',
    table: 'burden_purpose_assessments',
    apiPrefix: '/burden-purpose'
  },
  {
    family: 'family_functioning',
    catalogId: 'family-functioning',
    path: 'family-functioning',
    title: 'Family Functioning',
    kind: 'single',
    table: 'family_functioning_assessments',
    apiPrefix: '/family-functioning'
  },
  {
    family: 'savage_blueprint',
    catalogId: 'savage-blueprint',
    path: 'savage-blueprint',
    title: 'Savage Blueprint',
    kind: 'single',
    table: 'savage_blueprint_assessments',
    apiPrefix: '/savage-blueprint'
  },
  {
    family: 'reward_regulation',
    catalogId: 'reward-regulation',
    path: 'reward-regulation',
    title: 'Reward Regulation',
    kind: 'single',
    table: 'reward_regulation_assessments',
    apiPrefix: '/reward-regulation'
  },
  {
    family: 'athlete_readiness',
    catalogId: 'athlete-readiness',
    path: 'athlete-readiness',
    title: 'Athlete Readiness',
    kind: 'single',
    table: 'athlete_readiness_assessments',
    apiPrefix: '/athlete-readiness'
  },
  {
    family: 'student_success',
    catalogId: 'student-success',
    path: 'student-success',
    title: 'Student Success',
    kind: 'single',
    table: 'student_success_assessments',
    apiPrefix: '/student-success'
  },
  {
    family: 'college_readiness',
    catalogId: 'college-readiness',
    path: 'college-readiness',
    title: 'College Readiness',
    kind: 'single',
    table: 'college_readiness_assessments',
    apiPrefix: '/college-readiness'
  },
  {
    family: 'relationship_health',
    catalogId: 'relationship-health',
    path: 'relationship-health',
    title: 'Relationship Health',
    kind: 'couples',
    table: 'relationship_assessment_cycles',
    apiPrefix: '/relationship-health'
  }
];

const BY_FAMILY = Object.fromEntries(ASSESSMENT_FAMILIES.map((f) => [f.family, f]));
const BY_CATALOG = Object.fromEntries(ASSESSMENT_FAMILIES.map((f) => [f.catalogId, f]));

export function getFamilyMeta(familyOrCatalog) {
  const key = String(familyOrCatalog || '').trim();
  if (!key) return null;
  return BY_FAMILY[key] || BY_CATALOG[key] || BY_FAMILY[key.replace(/-/g, '_')] || null;
}

export function normalizeFamilyKey(familyOrCatalog) {
  return getFamilyMeta(familyOrCatalog)?.family || null;
}
