/**
 * Medical service-code unit calculation: single-unit, Medicaid 8-minute ladder,
 * custom bands, min/max gates, and overflow code auto-switch.
 */

const MEDICAID_8_MIN = 8;

function toInt(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase() || null;
}

/**
 * Build standard Medicaid-style bands for a nominal unit length (usually 15):
 * unit 1: 8–22, unit 2: 23–37, … up to maxUnits.
 */
export function buildMedicaid8MinuteBands({ unitMinutes = 15, maxUnits = 12, minMinutes = MEDICAID_8_MIN } = {}) {
  const unit = toInt(unitMinutes, 15) || 15;
  const maxU = Math.max(1, toInt(maxUnits, 12) || 12);
  const start = toInt(minMinutes, MEDICAID_8_MIN) || MEDICAID_8_MIN;
  const bands = [];
  for (let u = 1; u <= maxU; u += 1) {
    const minM = u === 1 ? start : start + (u - 1) * unit;
    const maxM = start + u * unit - 1;
    bands.push({ units: u, minMinutes: minM, maxMinutes: maxM });
  }
  return bands;
}

export function parseLadderBands(raw) {
  if (!raw) return null;
  let arr = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr
    .map((b) => ({
      units: toInt(b.units ?? b.unit, 0) || 0,
      minMinutes: toInt(b.minMinutes ?? b.min_minutes, 0) || 0,
      maxMinutes: toInt(b.maxMinutes ?? b.max_minutes, 0) || 0
    }))
    .filter((b) => b.units > 0 && b.minMinutes > 0 && b.maxMinutes >= b.minMinutes)
    .sort((a, b) => a.minMinutes - b.minMinutes);
}

/**
 * Resolve billed units + effective code for a session duration.
 * @returns {{
 *   claimable: boolean,
 *   reason: string|null,
 *   units: number,
 *   requestedServiceCode: string|null,
 *   effectiveServiceCode: string|null,
 *   overflowApplied: boolean,
 *   band: object|null,
 *   minMinutes: number|null,
 *   maxMinutes: number|null
 * }}
 */
export function resolveSessionBilling({
  minutes,
  serviceCode,
  unitCalcMode = 'SINGLE',
  unitMinutes = 15,
  minMinutes = null,
  maxMinutes = null,
  maxUnitsPerSession = null,
  ladderBandsJson = null,
  overflowServiceCode = null,
  overflowAtMinutes = null
} = {}) {
  const m = toInt(minutes, 0) || 0;
  const requested = normalizeCode(serviceCode);
  const mode = String(unitCalcMode || 'SINGLE').toUpperCase();
  const min = toInt(minMinutes, null);
  const max = toInt(maxMinutes, null);
  const overflowCode = normalizeCode(overflowServiceCode);
  const overflowAt = toInt(overflowAtMinutes, null) ?? (max != null ? max + 1 : null);

  const base = {
    claimable: false,
    reason: null,
    units: 0,
    requestedServiceCode: requested,
    effectiveServiceCode: requested,
    overflowApplied: false,
    band: null,
    minMinutes: min,
    maxMinutes: max
  };

  if (!requested) {
    return { ...base, reason: 'Service code is required' };
  }
  if (m <= 0) {
    return { ...base, reason: 'Session duration must be greater than zero' };
  }

  // Overflow: duration at/above threshold → switch code (caller may re-resolve with overflow rule)
  if (overflowCode && overflowAt != null && m >= overflowAt) {
    return {
      ...base,
      claimable: true,
      reason: null,
      units: 0,
      effectiveServiceCode: overflowCode,
      overflowApplied: true,
      band: null
    };
  }

  if (min != null && m < min) {
    return {
      ...base,
      reason: `Duration ${m} min is below minimum ${min} min — cannot submit as a claim`
    };
  }

  let units = 0;
  let band = null;
  const bands = parseLadderBands(ladderBandsJson);

  if (mode === 'NONE' || mode === 'SINGLE') {
    units = 1;
  } else if (bands && bands.length) {
    band = bands.find((b) => m >= b.minMinutes && m <= b.maxMinutes) || null;
    if (!band) {
      // Past last band but under overflow — clamp to max units if within max_minutes
      const last = bands[bands.length - 1];
      if (max != null && m <= max) {
        units = last.units;
        band = last;
      } else if (m > last.maxMinutes && (!overflowCode || overflowAt == null || m < overflowAt)) {
        units = last.units;
        band = last;
      } else {
        return {
          ...base,
          reason: `Duration ${m} min does not fall in a defined unit band`
        };
      }
    } else {
      units = band.units;
    }
  } else if (mode === 'MEDICAID_8_MINUTE_LADDER') {
    const derived = buildMedicaid8MinuteBands({
      unitMinutes: unitMinutes || 15,
      maxUnits: maxUnitsPerSession || 12,
      minMinutes: min || MEDICAID_8_MIN
    });
    band = derived.find((b) => m >= b.minMinutes && m <= b.maxMinutes) || null;
    if (!band) {
      const last = derived[derived.length - 1];
      if (last && m > last.maxMinutes && (max == null || m <= max)) {
        units = last.units;
        band = last;
      } else {
        return {
          ...base,
          reason: `Duration ${m} min is outside the unit ladder`
        };
      }
    } else {
      units = band.units;
    }
  } else if (mode === 'FIXED_BLOCK') {
    const unit = toInt(unitMinutes, 15) || 15;
    units = Math.floor(m / unit);
    if (units < 1) {
      return { ...base, reason: `Duration ${m} min is less than one ${unit}-minute block` };
    }
  } else if (mode === 'CUSTOM_BANDS') {
    return {
      ...base,
      reason: 'CUSTOM_BANDS requires ladder_bands_json'
    };
  } else {
    units = 1;
  }

  const maxU = toInt(maxUnitsPerSession, null);
  if (maxU != null && units > maxU) {
    units = maxU;
  }

  if (max != null && m > max && !overflowCode) {
    return {
      ...base,
      units,
      band,
      reason: `Duration ${m} min exceeds maximum ${max} min and no overflow service code is configured`
    };
  }

  return {
    ...base,
    claimable: units > 0,
    reason: units > 0 ? null : 'No billable units for this duration',
    units,
    band
  };
}

/** Normalize a DB row (agency_medical_service_codes or billing_policy_service_rules) */
export function ruleFromMedicalServiceCodeRow(row) {
  if (!row) return null;
  return {
    serviceCode: normalizeCode(row.service_code || row.serviceCode),
    description: row.description || row.service_description || null,
    unitCalcMode: row.unit_calc_mode || row.unitCalcMode || 'SINGLE',
    unitMinutes: row.unit_minutes ?? row.unitMinutes ?? null,
    minMinutes: row.min_minutes ?? row.minMinutes ?? null,
    maxMinutes: row.max_minutes ?? row.maxMinutes ?? null,
    maxUnitsPerSession: row.max_units_per_session ?? row.maxUnitsPerSession ?? null,
    maxUnitsPerDay: row.max_units_per_day ?? row.maxUnitsPerDay ?? null,
    ladderBandsJson: row.ladder_bands_json ?? row.ladderBandsJson ?? null,
    overflowServiceCode: row.overflow_service_code ?? row.overflowServiceCode ?? null,
    overflowAtMinutes: row.overflow_at_minutes ?? row.overflowAtMinutes ?? null,
    defaultPlaceOfService: row.default_place_of_service || row.cms_place_of_service || null
  };
}

export function resolveWithOverflowChain(minutes, primaryRule, lookupOverflowRule) {
  let result = resolveSessionBilling({ minutes, ...primaryRule, serviceCode: primaryRule.serviceCode });
  if (result.overflowApplied && result.effectiveServiceCode && typeof lookupOverflowRule === 'function') {
    const overflowRule = lookupOverflowRule(result.effectiveServiceCode);
    if (overflowRule) {
      const nested = resolveSessionBilling({
        minutes,
        ...overflowRule,
        serviceCode: overflowRule.serviceCode,
        // Prevent infinite ping-pong
        overflowServiceCode: null,
        overflowAtMinutes: null
      });
      return {
        ...nested,
        overflowApplied: true,
        requestedServiceCode: primaryRule.serviceCode,
        switchedFrom: primaryRule.serviceCode
      };
    }
  }
  return result;
}
