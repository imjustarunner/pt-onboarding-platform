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
  return (
    yes('safety_immediate_danger')
    || yes('self_harm_urges_now')
    || yes('cssrs_1')
    || yes('cssrs_2')
    || yes('cssrs_3')
    || yes('cssrs_4')
    || yes('cssrs_5')
    || yes('cssrs_6')
    || yes('asq_1')
    || yes('asq_2')
    || yes('asq_3')
    || yes('asq_4')
    || yes('asq_5')
    || yesOrNotSure('self_harm')
    || yesOrNotSure('talked_wanting_to_die')
    || yes('wanting_to_die_current')
  );
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
