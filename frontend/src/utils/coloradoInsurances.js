/**
 * Colorado insurance list for the insurance information collection step.
 * Includes Health First Colorado Medicaid managed care organizations (MCOs),
 * CHP+, and major private/commercial insurers accepted in Colorado.
 *
 * MEDICAID_KEYWORDS: terms that identify a plan as Medicaid / government-funded,
 * used to suppress self-pay cost collection.
 */

export const MEDICAID_KEYWORDS = [
  'medicaid',
  'health first colorado',
  'ccha',
  'colorado community health alliance',
  'chp+',
  'child health plan',
  'aetna better health',
  'beacon health options',
  'colorado access medicaid',
  'denver health medicaid',
  'rocky mountain health plans medicaid',
  'intellisource',
  'denver health advantage',
  'colorado choice health plans'
];

/** Returns true when the insurer name suggests Medicaid / state-funded coverage. */
export function isMedicaidInsurer(name = '') {
  const lower = String(name || '').toLowerCase();
  return MEDICAID_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Comprehensive Colorado insurance list.
 * Each entry: { label: string, group: 'Medicaid' | 'Commercial' | 'Other' }
 * The `label` is what is stored and displayed.
 */
export const COLORADO_INSURANCES = [
  // ── Medicaid / Health First Colorado managed care organizations ─────────────
  { label: 'Health First Colorado (Medicaid)',                       group: 'Medicaid' },
  { label: 'Colorado Access (Medicaid HMO)',                         group: 'Medicaid' },
  { label: 'CCHA – Colorado Community Health Alliance (Medicaid)',   group: 'Medicaid' },
  { label: 'Rocky Mountain Health Plans – Medicaid',                 group: 'Medicaid' },
  { label: 'Denver Health Medicaid Choice',                          group: 'Medicaid' },
  { label: 'Aetna Better Health of Colorado (Medicaid)',             group: 'Medicaid' },
  { label: 'Beacon Health Options – Colorado (Medicaid)',            group: 'Medicaid' },
  { label: 'Colorado Choice Health Plans (Medicaid)',                group: 'Medicaid' },
  { label: 'IntelliSource – Colorado Medicaid',                      group: 'Medicaid' },
  { label: 'CHP+ (Child Health Plan Plus)',                          group: 'Medicaid' },
  { label: 'Denver Health Advantage (Medicaid)',                     group: 'Medicaid' },

  // ── Medicare ────────────────────────────────────────────────────────────────
  { label: 'Medicare (Original)',                                    group: 'Medicare' },
  { label: 'Medicare Advantage – Aetna',                            group: 'Medicare' },
  { label: 'Medicare Advantage – Humana',                           group: 'Medicare' },
  { label: 'Medicare Advantage – United Healthcare',                group: 'Medicare' },
  { label: 'Medicare Advantage – Anthem BCBS Colorado',             group: 'Medicare' },
  { label: 'Medicare Advantage – Kaiser Permanente',                group: 'Medicare' },

  // ── Commercial / Private ─────────────────────────────────────────────────
  { label: 'Anthem Blue Cross Blue Shield of Colorado',             group: 'Commercial' },
  { label: 'United Healthcare',                                     group: 'Commercial' },
  { label: 'Aetna',                                                 group: 'Commercial' },
  { label: 'Cigna',                                                 group: 'Commercial' },
  { label: 'Humana',                                                group: 'Commercial' },
  { label: 'Kaiser Permanente',                                     group: 'Commercial' },
  { label: 'Molina Healthcare of Colorado',                         group: 'Commercial' },
  { label: 'Ambetter from Colorado Health',                         group: 'Commercial' },
  { label: 'Oscar Health',                                          group: 'Commercial' },
  { label: 'Bright Health',                                         group: 'Commercial' },
  { label: 'Centene / Sunflower Health',                            group: 'Commercial' },
  { label: 'Friday Health Plans',                                   group: 'Commercial' },
  { label: 'SelectHealth',                                          group: 'Commercial' },
  { label: 'Colorado Access (Commercial)',                          group: 'Commercial' },
  { label: 'Rocky Mountain Health Plans (Commercial)',              group: 'Commercial' },
  { label: 'Denver Health Medical Plan',                            group: 'Commercial' },
  { label: 'CoventryOne',                                           group: 'Commercial' },
  { label: 'TRICARE',                                               group: 'Other' },
  { label: 'VA / Veterans Affairs',                                 group: 'Other' },
  { label: 'CHAMPVA',                                               group: 'Other' },
  { label: 'Federal Employee Health Benefits (FEHB)',               group: 'Other' },
  { label: 'Indian Health Service',                                 group: 'Other' },
  { label: 'Workers Compensation',                                  group: 'Other' },
  { label: 'Self-Pay / No Insurance',                               group: 'Other' },
  { label: 'Other (not listed)',                                    group: 'Other' }
];

/** Returns filtered suggestions matching a query string (case-insensitive). */
export function filterInsurances(query = '') {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return COLORADO_INSURANCES;
  return COLORADO_INSURANCES.filter((ins) => ins.label.toLowerCase().includes(q));
}
