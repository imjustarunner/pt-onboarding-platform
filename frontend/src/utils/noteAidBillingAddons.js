/**
 * Note Aid billing add-ons and duration-driven code switches.
 * Rules for 90839/90840 crisis, 90837→90834×2 extended, 90785 IC, 99051 after-hours.
 */

export const ADDON_CODES = {
  INTERACTIVE_COMPLEXITY: '90785',
  CRISIS_ADDON: '90840',
  AFTER_HOURS: '99051'
};

/** Primary codes that may report 90785 Interactive Complexity. */
export const CODES_ELIGIBLE_FOR_90785 = new Set([
  '90791',
  '90792',
  '90832',
  '90834',
  '90837',
  '90833',
  '90836',
  '90838',
  '90853'
]);

/**
 * 90839 crisis psychotherapy duration / add-on rules.
 * Min 31 minutes. ≤30 → switch to 90832.
 * After 74 min, each additional ~30 min adds one 90840 unit:
 *   75–104 → 1×90840, 105–134 → 2×90840, etc.
 */
export function resolveCrisis90839Billing({ durationMinutes } = {}) {
  const mins = Number(durationMinutes);
  if (!Number.isFinite(mins) || mins <= 0) {
    return {
      primaryCode: '90839',
      primaryUnits: 1,
      addons: [],
      warnings: ['Set duration (minutes) for 90839 crisis billing.'],
      switchedFrom: null
    };
  }
  if (mins <= 30) {
    return {
      primaryCode: '90832',
      primaryUnits: 1,
      addons: [],
      warnings: [
        '90839 requires more than 30 minutes (minimum 31). Duration ≤30 switched the code to 90832.'
      ],
      switchedFrom: '90839'
    };
  }
  const addons = [];
  if (mins >= 75) {
    // First 90840 after 74; each additional 30 minutes another unit.
    const units = 1 + Math.floor((mins - 75) / 30);
    addons.push({ code: ADDON_CODES.CRISIS_ADDON, units: Math.max(1, units) });
  }
  return {
    primaryCode: '90839',
    primaryUnits: 1,
    addons,
    warnings: [],
    switchedFrom: null
  };
}

/**
 * Extended encounter: scheduled/documented >74 min on 90837 → bill 90834 × 2.
 * 90785 cannot be billed with an extended encounter.
 */
export function resolveExtendedEncounter90837({ durationMinutes, includeInteractiveComplexity = false } = {}) {
  const mins = Number(durationMinutes);
  if (!Number.isFinite(mins) || mins < 75) {
    return {
      primaryCode: '90837',
      primaryUnits: 1,
      addons: [],
      isExtendedEncounter: false,
      allow90785: true,
      warnings: []
    };
  }
  const warnings = [
    'EXTENDED ENCOUNTER: Session longer than 74 minutes — bill two units of 90834 (not 90837). 90785 cannot be billed with an extended encounter.'
  ];
  if (includeInteractiveComplexity) {
    warnings.push('90785 Interactive Complexity removed — not eligible with 90834 × 2 extended encounter.');
  }
  return {
    primaryCode: '90834',
    primaryUnits: 2,
    addons: [],
    isExtendedEncounter: true,
    allow90785: false,
    warnings,
    switchedFrom: '90837'
  };
}

export function isEligibleFor90785(primaryCode, { isExtendedEncounter = false } = {}) {
  if (isExtendedEncounter) return false;
  const code = String(primaryCode || '').toUpperCase();
  if (code === '90834') {
    // Single-unit 90834 OK; ×2 extended is blocked via isExtendedEncounter.
    return true;
  }
  return CODES_ELIGIBLE_FOR_90785.has(code);
}

/**
 * 99051 — sessions outside Mon–Fri 8:00–17:00 local (agency/session timezone).
 * @param {Date|string|null} startAt
 */
export function shouldSuggest99051(startAt, { timeZone } = {}) {
  if (!startAt) return false;
  try {
    const d = startAt instanceof Date ? startAt : new Date(startAt);
    if (Number.isNaN(d.getTime())) return false;
    const opts = timeZone ? { timeZone } : undefined;
    const weekday = new Intl.DateTimeFormat('en-US', { ...(opts || {}), weekday: 'short' }).format(d);
    const hourStr = new Intl.DateTimeFormat('en-US', {
      ...(opts || {}),
      hour: 'numeric',
      hour12: false
    }).format(d);
    const hour = Number(String(hourStr).replace(/\D/g, '').slice(0, 2));
    const isWeekend = weekday === 'Sat' || weekday === 'Sun';
    if (isWeekend) return true;
    if (!Number.isFinite(hour)) return false;
    // Outside 8–17 inclusive of before 8 and after 17.
    return hour < 8 || hour >= 17;
  } catch {
    return false;
  }
}

/**
 * Apply all duration / add-on rules for the current primary code + options.
 */
export function resolveNoteAidBillingCodes({
  primaryCode,
  durationMinutes,
  includeInteractiveComplexity = false,
  includeAfterHours99051 = false,
  sessionStartAt = null,
  timeZone = null
} = {}) {
  let code = String(primaryCode || '').trim().toUpperCase();
  let primaryUnits = 1;
  const addons = [];
  const warnings = [];
  let isExtendedEncounter = false;
  let switchedFrom = null;

  if (code === '90839') {
    const crisis = resolveCrisis90839Billing({ durationMinutes });
    code = crisis.primaryCode;
    primaryUnits = crisis.primaryUnits;
    addons.push(...crisis.addons);
    warnings.push(...crisis.warnings);
    switchedFrom = crisis.switchedFrom;
  } else if (code === '90837') {
    const ext = resolveExtendedEncounter90837({
      durationMinutes,
      includeInteractiveComplexity
    });
    code = ext.primaryCode;
    primaryUnits = ext.primaryUnits;
    isExtendedEncounter = ext.isExtendedEncounter;
    warnings.push(...ext.warnings);
    switchedFrom = ext.switchedFrom || null;
  }

  let wantIc = !!includeInteractiveComplexity;
  if (wantIc && !isEligibleFor90785(code, { isExtendedEncounter })) {
    wantIc = false;
    if (!warnings.some((w) => w.includes('90785'))) {
      warnings.push(
        `90785 Interactive Complexity is not eligible with ${code}${primaryUnits > 1 ? ` × ${primaryUnits}` : ''}.`
      );
    }
  }
  if (wantIc) {
    addons.push({ code: ADDON_CODES.INTERACTIVE_COMPLEXITY, units: 1 });
  }

  const want99051 = includeAfterHours99051
    || shouldSuggest99051(sessionStartAt, { timeZone });
  if (want99051) {
    addons.push({ code: ADDON_CODES.AFTER_HOURS, units: 1 });
  }

  // Dedupe add-on codes (keep max units).
  const byCode = new Map();
  for (const a of addons) {
    const c = String(a.code || '').toUpperCase();
    const u = Number(a.units) || 1;
    byCode.set(c, Math.max(byCode.get(c) || 0, u));
  }

  return {
    primaryCode: code,
    primaryUnits,
    addons: [...byCode.entries()].map(([c, u]) => ({ code: c, units: u })),
    warnings,
    isExtendedEncounter,
    switchedFrom,
    allow90785: isEligibleFor90785(code, { isExtendedEncounter })
  };
}

export const CRISIS_90839_SERVICE_DESCRIPTION = [
  'Service Description (Including example activities):',
  'Urgent assessment and relevant Behavioral Health history of a crisis state, mental status exam, and disposition.',
  'The treatment includes psychotherapy, mobilization of resources to defuse the crisis and restore safety, and implementation of psychotherapeutic interventions to minimize the potential for psychological trauma.',
  'Example Activities:',
  '• Unscheduled therapy session (e.g. walk-in, urgent session), or scheduled session that presents a crisis situation, that provides assessment of crisis state, risk, triage, and support to prevent from needing higher level of care services or further assess and/or coordinate placement for higher level of care.',
  '• Therapy to reinforce and/or practice psychotherapeutic skills on crisis plan or treatment/service plan to increase functioning to return to pre-crisis level of functioning (e.g. practice DBT Distress Tolerance skills for member who is a frequent crisis utilizer and currently decompensating to maintain outpatient level care).',
  '• Utilizing specific therapy/counseling or assessment tools to screen or gather more information about the crisis situation, precipitating event(s), or contributing factors.',
  'Billing: Minimum 31 minutes. Duration ≤30 minutes must use 90832 (not 90839). After 74 minutes, add 90840 units (one unit per ~30 minutes beyond 74).'
].join('\n');
