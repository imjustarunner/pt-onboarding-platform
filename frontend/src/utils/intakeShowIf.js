/**
 * Shared intake showIf matcher.
 *
 * Supported shapes:
 *   { fieldKey, equals }                 scalar or array of accepted values
 *   { fieldKey, includes }               checkbox-group contains this value
 *   { fieldKey, includesAny: [] }        checkbox-group contains any listed value
 *   { fieldKey, notEquals }              any selected value other than this (or list)
 *   { any: [ showIf, ... ] }             OR
 *   { all: [ showIf, ... ] }             AND
 *
 * Checkbox-group answers may be arrays, comma-separated strings, or JSON arrays.
 */
export function normalizeShowIfList(actual) {
  if (actual == null || actual === '') return [];
  if (Array.isArray(actual)) {
    return actual
      .map((v) => String(v == null ? '' : v).trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof actual === 'boolean') return actual ? ['yes', 'true', '1'] : ['no', 'false', '0'];
  if (typeof actual === 'number' && Number.isFinite(actual)) return [String(actual)];
  const s = String(actual).trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return normalizeShowIfList(parsed);
    } catch {
      /* fall through */
    }
  }
  if (s.includes(',')) {
    return s
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
  }
  return [s.toLowerCase()];
}

function expectedList(expected) {
  if (expected == null) return [];
  if (Array.isArray(expected)) {
    return expected
      .map((v) => String(v == null ? '' : v).trim().toLowerCase())
      .filter(Boolean);
  }
  const s = String(expected).trim().toLowerCase();
  return s ? [s] : [];
}

export function isCheckboxGroupField(field) {
  if (!field) return false;
  const type = String(field.type || '').toLowerCase();
  if (type === 'checkbox_group') return true;
  return type === 'checkbox' && Array.isArray(field.options) && field.options.length > 0;
}

export function matchesShowIf(showIf, values = {}) {
  if (!showIf || typeof showIf !== 'object') return true;
  if (Array.isArray(showIf.any) && showIf.any.length) {
    return showIf.any.some((cond) => matchesShowIf(cond, values));
  }
  if (Array.isArray(showIf.all) && showIf.all.length) {
    return showIf.all.every((cond) => matchesShowIf(cond, values));
  }
  const fieldKey = String(showIf.fieldKey || '').trim();
  if (!fieldKey) return true;

  const list = normalizeShowIfList(values?.[fieldKey]);

  if (showIf.includes != null && showIf.includes !== '') {
    return list.includes(String(showIf.includes).trim().toLowerCase());
  }
  if (Array.isArray(showIf.includesAny) && showIf.includesAny.length) {
    const wanted = expectedList(showIf.includesAny);
    return wanted.some((v) => list.includes(v));
  }
  if (showIf.notEquals != null && showIf.notEquals !== '') {
    const excluded = expectedList(showIf.notEquals);
    const remaining = list.filter((v) => !excluded.includes(v));
    if (Number(showIf.minSelected || 0) > 0) {
      return remaining.length >= Number(showIf.minSelected);
    }
    return remaining.length > 0;
  }

  if (Number(showIf.minSelected || 0) > 0) {
    const excluded = expectedList(showIf.excludeValues || ['none']);
    return list.filter((v) => !excluded.includes(v)).length >= Number(showIf.minSelected);
  }

  if (!Object.prototype.hasOwnProperty.call(showIf, 'equals')) return true;
  const expected = showIf.equals;
  if (Array.isArray(expected)) {
    if (!expected.length) return list.length > 0;
    return expectedList(expected).some((v) => list.includes(v));
  }
  if (expected === '' || expected === null || expected === undefined) {
    return list.length > 0;
  }
  return list.includes(String(expected).trim().toLowerCase());
}

export function mergeShowIfValues(...bags) {
  const out = {};
  for (const bag of bags) {
    if (!bag || typeof bag !== 'object') continue;
    Object.assign(out, bag);
    if (bag.clinicalResponses && typeof bag.clinicalResponses === 'object') {
      Object.assign(out, bag.clinicalResponses);
    }
  }
  return out;
}

export function isClinicalSafetyPositive(values = {}) {
  const merged = mergeShowIfValues(values, values?.clinicalResponses);
  const yes = (key) => matchesShowIf({ fieldKey: key, equals: 'yes' }, merged);
  const yesOrNotSure = (key) => matchesShowIf({ fieldKey: key, equals: ['yes', 'not_sure'] }, merged);
  const prefixes = ['', 'p1_', 'p2_'];
  for (const p of prefixes) {
    if (
      yes(`${p}safety_immediate_danger`)
      || yes(`${p}self_harm_urges_now`)
      || yes(`${p}immediate_danger`)
      || yes(`${p}cssrs_1`)
      || yes(`${p}cssrs_2`)
      || yes(`${p}cssrs_3`)
      || yes(`${p}cssrs_4`)
      || yes(`${p}cssrs_5`)
      || yes(`${p}cssrs_6`)
      || yes(`${p}asq_1`)
      || yes(`${p}asq_2`)
      || yes(`${p}asq_3`)
      || yes(`${p}asq_4`)
      || yes(`${p}asq_5`)
      || yesOrNotSure(`${p}self_harm`)
      || yesOrNotSure(`${p}talked_wanting_to_die`)
      || yes(`${p}wanting_to_die_current`)
    ) {
      return true;
    }
  }
  if (
    yes('member_immediate_danger')
    || yes('member_thoughts_killing_self')
    || yes('member_wish_dead')
    || yes('member_afraid_of_someone')
  ) {
    return true;
  }
  return isRelationshipIpvPositive(merged);
}

/**
 * Intimate-partner / relationship violence flags from couple private safety pages.
 * Does not describe which partner endorsed what — only that clinical review is required.
 */
export function isRelationshipIpvPositive(values = {}) {
  const merged = mergeShowIfValues(values, values?.clinicalResponses);
  const val = (key) => String(merged[key] ?? '').trim().toLowerCase();
  const isYes = (key) => val(key) === 'yes';
  const isNoOrUnsure = (key) => {
    const v = val(key);
    return v === 'no' || v === 'not_sure' || v === 'unsure';
  };

  const prefixes = ['', 'p1_', 'p2_'];
  for (const p of prefixes) {
    if (
      isYes(`${p}afraid_of_partner`)
      || isYes(`${p}partner_threatened_harmed`)
      || isYes(`${p}disagreements_physically_violent`)
      || isYes(`${p}immediate_danger`)
      || isYes(`${p}member_immediate_danger`)
      || isYes(`${p}member_afraid_of_someone`)
    ) {
      return true;
    }
    if (isNoOrUnsure(`${p}feel_safe_in_relationship`) || isNoOrUnsure(`${p}safe_disagreeing`)) {
      return true;
    }
    if (isNoOrUnsure(`${p}member_feel_safe_home`)) return true;
  }
  if (isYes('household_safety_concerns') || val('household_safety_concerns') === 'unsure') return true;
  return false;
}

/** Soft public-facing reason — never names which partner answered. */
export function clinicalReviewHoldReason(values = {}) {
  if (isRelationshipIpvPositive(values)) return 'relationship_safety';
  if (isClinicalSafetyPositive(values)) return 'safety_screen';
  return null;
}

export function isPrivateIntakeField(field) {
  return !!(field && (field.privateToRespondent === true || field.private === true));
}

export function filterPublicReviewFields(fields = []) {
  return (Array.isArray(fields) ? fields : []).filter((f) => f && !isPrivateIntakeField(f) && f.type !== 'info');
}

export function ageYearsFromDob(dob) {
  const s = String(dob || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years -= 1;
  return years >= 0 && years < 120 ? years : null;
}

export function childAgeFlags(dob, clientBag = {}) {
  const years = ageYearsFromDob(dob);
  const unknown = years == null;
  const substance = normalizeShowIfList(clientBag?.presenting_concerns).includes('substance_use');
  return {
    _child_age_years: years == null ? '' : String(years),
    _age_unknown: unknown ? 'yes' : 'no',
    _age_gte_4: unknown || years >= 4 ? 'yes' : 'no',
    _age_gte_8: unknown || years >= 8 ? 'yes' : 'no',
    _age_gte_11: !unknown && years >= 11 ? 'yes' : 'no',
    _age_gte_12: !unknown && years >= 12 ? 'yes' : 'no',
    _age_lte_17: unknown || years <= 17 ? 'yes' : 'no',
    _substance_indicated: substance ? 'yes' : 'no'
  };
}
