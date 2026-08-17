import pool from '../config/database.js';
import { CATEGORY_IDS, LEVEL_IDS } from './PayrollCompensationLevel.model.js';

const DEFAULT_TIER_BONUS = Object.freeze({ 1: 0, 2: 2, 3: 4 });
const DEFAULT_SPANISH_BONUS = Object.freeze({ 1: 0, 2: 2, 3: 4 });
const DEFAULT_LOCATION_BONUS = Object.freeze({ 1: 0, 2: 0, 3: 0 });

function parseBonusJson(raw, fallback) {
  if (!raw) return { ...fallback };
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      1: Number(obj?.[1] ?? obj?.['1'] ?? fallback[1]) || 0,
      2: Number(obj?.[2] ?? obj?.['2'] ?? fallback[2]) || 0,
      3: Number(obj?.[3] ?? obj?.['3'] ?? fallback[3]) || 0
    };
  } catch {
    return { ...fallback };
  }
}

function normalizeBonusMap(fieldsBonus, fallback) {
  if (!fieldsBonus || typeof fieldsBonus !== 'object') return { ...fallback };
  return {
    1: Number(fieldsBonus[1] ?? fieldsBonus['1'] ?? 0) || 0,
    2: Number(fieldsBonus[2] ?? fieldsBonus['2'] ?? 0) || 0,
    3: Number(fieldsBonus[3] ?? fieldsBonus['3'] ?? 0) || 0
  };
}

function rowToProfile(row) {
  if (!row) return null;
  const tierBonus = parseBonusJson(row.tier_bonus_json, DEFAULT_TIER_BONUS);
  // Optional separate FFS / H tier maps; null when unset so calc falls back to shared tierBonus.
  const tierBonusFfs = row.tier_bonus_ffs_json != null
    ? parseBonusJson(row.tier_bonus_ffs_json, tierBonus)
    : null;
  const tierBonusHcode = row.tier_bonus_hcode_json != null
    ? parseBonusJson(row.tier_bonus_hcode_json, tierBonus)
    : null;
  return {
    id: row.id,
    agencyId: Number(row.agency_id),
    category: Number(row.category),
    level: Number(row.level),
    creditRate: row.credit_rate != null ? Number(row.credit_rate) : null,
    creditRateProbation: row.credit_rate_probation != null ? Number(row.credit_rate_probation) : null,
    hcodeRate: row.hcode_rate != null ? Number(row.hcode_rate) : null,
    hcodeRateProbation: row.hcode_rate_probation != null ? Number(row.hcode_rate_probation) : null,
    indirectRate: row.indirect_rate != null ? Number(row.indirect_rate) : null,
    supportActivityRate: row.support_activity_rate != null ? Number(row.support_activity_rate) : null,
    autoIndirectMinutesPerHour: Number(row.auto_indirect_minutes_per_hour ?? 10) || 10,
    tierBonus,
    tierBonusFfs,
    tierBonusHcode,
    spanishBonus: parseBonusJson(row.spanish_bonus_json, DEFAULT_SPANISH_BONUS),
    locationBonus: parseBonusJson(row.location_bonus_json, DEFAULT_LOCATION_BONUS)
  };
}

const PayrollPaySystemRate = {
  DEFAULT_TIER_BONUS,
  DEFAULT_SPANISH_BONUS,
  DEFAULT_LOCATION_BONUS,

  async listForAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_pay_system_rates WHERE agency_id = ? ORDER BY category, level`,
      [agencyId]
    );
    const byKey = new Map((rows || []).map((r) => [`${r.category}:${r.level}`, r]));
    const result = [];
    for (const cat of CATEGORY_IDS) {
      for (const lvl of LEVEL_IDS) {
        const existing = byKey.get(`${cat}:${lvl}`);
        result.push(existing
          ? rowToProfile(existing)
          : {
              id: null,
              agencyId,
              category: cat,
              level: lvl,
              creditRate: null,
              creditRateProbation: null,
              hcodeRate: null,
              hcodeRateProbation: null,
              indirectRate: null,
              supportActivityRate: null,
              autoIndirectMinutesPerHour: 10,
              tierBonus: { ...DEFAULT_TIER_BONUS },
              tierBonusFfs: null,
              tierBonusHcode: null,
              spanishBonus: { ...DEFAULT_SPANISH_BONUS },
              locationBonus: { ...DEFAULT_LOCATION_BONUS }
            });
      }
    }
    return result;
  },

  async get(agencyId, category, level) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_pay_system_rates
       WHERE agency_id = ? AND category = ? AND level = ?
       LIMIT 1`,
      [agencyId, category, level]
    );
    return rowToProfile(rows?.[0] || null);
  },

  async upsert(agencyId, category, level, fields = {}) {
    const tierBonus = normalizeBonusMap(fields.tierBonus, DEFAULT_TIER_BONUS);
    const spanishBonus = normalizeBonusMap(fields.spanishBonus, DEFAULT_SPANISH_BONUS);
    const locationBonus = normalizeBonusMap(fields.locationBonus, DEFAULT_LOCATION_BONUS);
    const updateFfs = fields.tierBonusFfs !== undefined;
    const updateHcode = fields.tierBonusHcode !== undefined;
    const tierBonusFfsJson = !updateFfs
      ? null
      : (fields.tierBonusFfs === null
        ? null
        : JSON.stringify(normalizeBonusMap(fields.tierBonusFfs, tierBonus)));
    const tierBonusHcodeJson = !updateHcode
      ? null
      : (fields.tierBonusHcode === null
        ? null
        : JSON.stringify(normalizeBonusMap(fields.tierBonusHcode, tierBonus)));

    await pool.execute(
      `INSERT INTO payroll_pay_system_rates
         (agency_id, category, level,
          credit_rate, credit_rate_probation, hcode_rate, hcode_rate_probation,
          indirect_rate, support_activity_rate, auto_indirect_minutes_per_hour,
          tier_bonus_json, tier_bonus_ffs_json, tier_bonus_hcode_json,
          spanish_bonus_json, location_bonus_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         credit_rate = VALUES(credit_rate),
         credit_rate_probation = VALUES(credit_rate_probation),
         hcode_rate = VALUES(hcode_rate),
         hcode_rate_probation = VALUES(hcode_rate_probation),
         indirect_rate = VALUES(indirect_rate),
         support_activity_rate = VALUES(support_activity_rate),
         auto_indirect_minutes_per_hour = VALUES(auto_indirect_minutes_per_hour),
         tier_bonus_json = VALUES(tier_bonus_json),
         tier_bonus_ffs_json = IF(? = 1, VALUES(tier_bonus_ffs_json), tier_bonus_ffs_json),
         tier_bonus_hcode_json = IF(? = 1, VALUES(tier_bonus_hcode_json), tier_bonus_hcode_json),
         spanish_bonus_json = VALUES(spanish_bonus_json),
         location_bonus_json = VALUES(location_bonus_json),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId, category, level,
        fields.creditRate != null && fields.creditRate !== '' ? Number(fields.creditRate) : null,
        fields.creditRateProbation != null && fields.creditRateProbation !== '' ? Number(fields.creditRateProbation) : null,
        fields.hcodeRate != null && fields.hcodeRate !== '' ? Number(fields.hcodeRate) : null,
        fields.hcodeRateProbation != null && fields.hcodeRateProbation !== '' ? Number(fields.hcodeRateProbation) : null,
        fields.indirectRate != null && fields.indirectRate !== '' ? Number(fields.indirectRate) : null,
        fields.supportActivityRate != null && fields.supportActivityRate !== '' ? Number(fields.supportActivityRate) : null,
        fields.autoIndirectMinutesPerHour != null ? Number(fields.autoIndirectMinutesPerHour) : 10,
        JSON.stringify(tierBonus),
        tierBonusFfsJson,
        tierBonusHcodeJson,
        JSON.stringify(spanishBonus),
        JSON.stringify(locationBonus),
        updateFfs ? 1 : 0,
        updateHcode ? 1 : 0
      ]
    );
  },

  async isAgencyEnabled(agencyId) {
    try {
      const [rows] = await pool.execute(
        `SELECT new_pay_system_enabled FROM agencies WHERE id = ? LIMIT 1`,
        [agencyId]
      );
      return Number(rows?.[0]?.new_pay_system_enabled || 0) === 1;
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') return false;
      throw e;
    }
  },

  async setAgencyEnabled(agencyId, enabled) {
    await pool.execute(
      `UPDATE agencies SET new_pay_system_enabled = ? WHERE id = ?`,
      [enabled ? 1 : 0, agencyId]
    );
  }
};

export default PayrollPaySystemRate;
