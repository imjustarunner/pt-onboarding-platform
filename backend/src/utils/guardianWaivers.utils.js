/**
 * Standard guardian–client waiver section keys (order matters for display defaults).
 */
export const GUARDIAN_WAIVER_SECTION_KEYS = [
  'esignature_consent',
  'pickup_authorization',
  'emergency_contacts',
  'allergies_snacks',
  'meal_preferences'
];

/** E-sign must be completed before other sections can be saved. */
export const GUARDIAN_WAIVER_ESIGN_KEY = 'esignature_consent';

export function isValidSectionKey(key) {
  return GUARDIAN_WAIVER_SECTION_KEYS.includes(String(key || '').trim());
}

/**
 * Parse required section keys from DB JSON columns.
 * @param {unknown} siteJson - program_sites.guardian_waiver_required_sections_json
 * @param {unknown} eventJson - company_events.guardian_waiver_required_sections_json (optional override)
 * @returns {string[]}
 */
export function resolveRequiredSectionKeys(siteJson, eventJson) {
  const fallback = [...GUARDIAN_WAIVER_SECTION_KEYS];
  const parseArr = (raw) => {
    if (raw == null) return null;
    let v = raw;
    if (typeof v === 'string') {
      try {
        v = JSON.parse(v);
      } catch {
        return null;
      }
    }
    if (!Array.isArray(v)) return null;
    const out = v.map((x) => String(x || '').trim()).filter((k) => isValidSectionKey(k));
    return out.length ? [...new Set(out)] : null;
  };
  const eventKeys = parseArr(eventJson);
  if (eventKeys?.length) return eventKeys;
  const siteKeys = parseArr(siteJson);
  if (siteKeys?.length) return siteKeys;
  return fallback;
}

function parseSectionsObject(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? { ...raw } : {};
}

/**
 * Whether a section counts as satisfied for kiosk / check-in.
 * @param {string} key
 * @param {Record<string, { status?: string, payload?: unknown }>} sections
 */
export function isSectionSatisfied(key, sections) {
  const k = String(key || '').trim();
  const esign = sections[GUARDIAN_WAIVER_ESIGN_KEY];
  const esignOk = esign?.status === 'active';

  const row = sections[k];
  if (!row || row.status !== 'active') return false;
  if (k === GUARDIAN_WAIVER_ESIGN_KEY) return true;
  return esignOk;
}

/**
 * @param {unknown} sectionsJson - profile.sections_json
 * @param {string[]} requiredKeys
 * @returns {{ complete: boolean, missing: string[], sections: Record<string, unknown> }}
 */
export function evaluateWaiverCompleteness(sectionsJson, requiredKeys) {
  const sections = parseSectionsObject(sectionsJson);
  const missing = [];
  for (const key of requiredKeys) {
    if (!isSectionSatisfied(key, sections)) missing.push(key);
  }
  return {
    complete: missing.length === 0,
    missing,
    sections
  };
}

export function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? raw : {};
}

export function isGuardianWaiversFeatureEnabled(flags) {
  const f = parseFeatureFlags(flags);
  return f.guardianWaiversEnabled === true;
}

/**
 * @param {unknown} dob - MySQL DATE or ISO string
 * @param {Date} [asOf]
 * @returns {number|null} age in full years, or null if DOB missing/invalid
 */
export function computeAgeYearsFromDob(dob, asOf = new Date()) {
  if (dob == null || dob === '') return null;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (!Number.isFinite(d.getTime())) return null;
  let age = asOf.getUTCFullYear() - d.getUTCFullYear();
  const m = asOf.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && asOf.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

/** When DOB proves the client is 18+, guardian portal waiver/doc surfaces are locked. Unknown DOB = not locked. */
export function isDobAdultLocked(dob, asOf = new Date()) {
  const age = computeAgeYearsFromDob(dob, asOf);
  if (age == null) return false;
  return age >= 18;
}

function parseIntakeStepsArray(raw) {
  let steps = raw;
  if (steps == null) return [];
  if (typeof steps === 'string') {
    try {
      steps = JSON.parse(steps);
    } catch {
      return [];
    }
  }
  return Array.isArray(steps) ? steps : [];
}

/** @param {object} link - intake link row or normalized link */
export function linkHasGuardianWaiverStep(link) {
  const steps = parseIntakeStepsArray(link?.intake_steps ?? link?.intakeSteps);
  return steps.some((s) => String(s?.type || '').trim().toLowerCase() === 'guardian_waiver');
}

/**
 * Section keys configured on the first guardian_waiver step, or all keys when unset.
 * @param {object} link
 * @returns {string[]}
 */
export function guardianWaiverSectionKeysFromLink(link) {
  const steps = parseIntakeStepsArray(link?.intake_steps ?? link?.intakeSteps);
  const step = steps.find((s) => String(s?.type || '').trim().toLowerCase() === 'guardian_waiver');
  const raw = Array.isArray(step?.sectionKeys) ? step.sectionKeys : GUARDIAN_WAIVER_SECTION_KEYS;
  const keys = [...new Set(raw.map((k) => String(k || '').trim()).filter((k) => isValidSectionKey(k)))];
  return keys.length ? keys : [...GUARDIAN_WAIVER_SECTION_KEYS];
}

/**
 * Human-readable lines for kiosk review (non-PHI summary).
 * @param {string} key
 * @param {unknown} payload
 * @returns {string[]}
 */
export function summarizeWaiverPayloadForKiosk(key, payload) {
  const k = String(key || '').trim();
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  if (k === 'esignature_consent') {
    const lines = [];
    if (p.consented) lines.push('Electronic signature consent: agreed');
    if (p.understoodElectronicRecords) lines.push('Understood electronic records');
    return lines.length ? lines : ['Electronic signature consent on file'];
  }
  if (k === 'pickup_authorization') {
    const rows = Array.isArray(p.authorizedPickups) ? p.authorizedPickups : [];
    return rows
      .map((r) => {
        const name = String(r?.name || '').trim();
        const rel = String(r?.relationship || '').trim();
        const phone = String(r?.phone || '').trim();
        if (!name && !phone) return '';
        return [name, rel && `(${rel})`, phone && `· ${phone}`].filter(Boolean).join(' ');
      })
      .filter(Boolean);
  }
  if (k === 'emergency_contacts') {
    const rows = Array.isArray(p.contacts) ? p.contacts : [];
    return rows
      .map((r) => {
        const name = String(r?.name || '').trim();
        const phone = String(r?.phone || '').trim();
        const rel = String(r?.relationship || '').trim();
        if (!name && !phone) return '';
        return [name, phone && `· ${phone}`, rel && `(${rel})`].filter(Boolean).join(' ');
      })
      .filter(Boolean);
  }
  if (k === 'allergies_snacks') {
    const lines = [];
    const a = String(p.allergies || '').trim();
    const sn = String(p.approvedSnacks || '').trim();
    const n = String(p.notes || '').trim();
    if (a) lines.push(`Allergies: ${a}`);
    if (sn) lines.push(`Approved snacks: ${sn}`);
    if (n) lines.push(`Notes: ${n}`);
    return lines.length ? lines : ['Allergies & snacks on file'];
  }
  if (k === 'meal_preferences') {
    const lines = [];
    const am = String(p.allowedMeals || '').trim();
    const rm = String(p.restrictedMeals || '').trim();
    const n = String(p.notes || '').trim();
    if (am) lines.push(`Allowed: ${am}`);
    if (rm) lines.push(`Restricted: ${rm}`);
    if (n) lines.push(`Notes: ${n}`);
    return lines.length ? lines : ['Meal preferences on file'];
  }
  return ['On file'];
}
