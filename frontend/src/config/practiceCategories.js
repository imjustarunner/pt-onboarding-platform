/** Provider practice categories — overarching Book Session types. */

export const PRACTICE_CATEGORY_LABELS = {
  mental_health: 'Mental health',
  tutoring: 'Tutoring',
  coaching: 'Coaching',
  consulting: 'Consulting'
};

/** Category → tenant_services.business_type values they unlock. */
export const SERVICE_BUSINESS_TYPES_BY_CATEGORY = {
  mental_health: ['mental_health', 'healthcare'],
  tutoring: ['tutoring', 'learning'],
  coaching: ['coaching'],
  consulting: ['consulting']
};

export function practiceCategoryLabel(code) {
  const c = String(code || '').trim().toLowerCase();
  return PRACTICE_CATEGORY_LABELS[c] || c.replace(/_/g, ' ');
}

export function businessTypesForPracticeCategory(code) {
  const c = String(code || '').trim().toLowerCase();
  return SERVICE_BUSINESS_TYPES_BY_CATEGORY[c] || [];
}

export function practiceCategoryForBusinessType(businessType) {
  const bt = String(businessType || '').trim().toLowerCase();
  if (!bt) return '';
  if (bt === 'healthcare' || bt === 'mental_health') return 'mental_health';
  if (bt === 'learning' || bt === 'tutoring') return 'tutoring';
  if (bt === 'coaching') return 'coaching';
  if (bt === 'consulting') return 'consulting';
  return '';
}

/** Known add-on CPT/HCPCS when DB flag is missing (pre-migration). */
export const KNOWN_ADDON_SERVICE_CODES = new Set([
  '99051',
  '90875',
  '90785',
  '90840',
  '99354',
  '99355',
  '90833',
  '90836',
  '90838'
]);

export function isAddonServiceCode(code, row = null) {
  if (row?.isAddon === true || row?.is_addon === true || Number(row?.is_addon) === 1) return true;
  const c = String(code || row?.code || '').trim().toUpperCase();
  return KNOWN_ADDON_SERVICE_CODES.has(c);
}
