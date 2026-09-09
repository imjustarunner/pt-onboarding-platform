import pool from '../config/database.js';

const SESSION_MODES = new Set(['individual', 'group', 'either']);

function normalizeSessionMode(raw, fallback = 'either') {
  const s = String(raw || fallback).trim().toLowerCase();
  return SESSION_MODES.has(s) ? s : fallback;
}

class AgencyMedicalServiceCode {
  static mapRow(r) {
    if (!r) return null;
    return {
      ...r,
      id: Number(r.id),
      agencyId: Number(r.agency_id),
      serviceCode: String(r.service_code || '').toUpperCase(),
      description: r.description != null ? String(r.description) : null,
      unitCalcMode: r.unit_calc_mode || null,
      unitMinutes: r.unit_minutes == null ? null : Number(r.unit_minutes),
      minMinutes: r.min_minutes == null ? null : Number(r.min_minutes),
      maxMinutes: r.max_minutes == null ? null : Number(r.max_minutes),
      maxUnitsPerSession: r.max_units_per_session == null ? null : Number(r.max_units_per_session),
      maxUnitsPerDay: r.max_units_per_day == null ? null : Number(r.max_units_per_day),
      sessionMode: normalizeSessionMode(r.session_mode, 'either'),
      session_mode: normalizeSessionMode(r.session_mode, 'either'),
      isAddon: Number(r.is_addon || 0) === 1,
      isActive: Number(r.is_active || 0) === 1,
      defaultPlaceOfService: r.default_place_of_service || null
    };
  }

  static async listByAgency(agencyId, { includeInactive = false } = {}) {
    const [rows] = await pool.execute(
      `SELECT * FROM agency_medical_service_codes
       WHERE agency_id = ?
         AND (? = 1 OR is_active = 1)
       ORDER BY service_code ASC`,
      [agencyId, includeInactive ? 1 : 0]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async findByAgencyAndCode(agencyId, serviceCode) {
    const [rows] = await pool.execute(
      `SELECT * FROM agency_medical_service_codes
       WHERE agency_id = ? AND service_code = ?
       LIMIT 1`,
      [agencyId, String(serviceCode || '').trim().toUpperCase()]
    );
    return this.mapRow(rows?.[0] || null);
  }

  static async upsert(payload) {
    const {
      agencyId,
      serviceCode,
      description = null,
      unitCalcMode = 'SINGLE',
      unitMinutes = null,
      minMinutes = null,
      maxMinutes = null,
      maxUnitsPerSession = null,
      maxUnitsPerDay = null,
      ladderBandsJson = null,
      overflowServiceCode = null,
      overflowAtMinutes = null,
      defaultPlaceOfService = null,
      allowedPlaceOfService = null,
      allowedCredentialTiers = null,
      isAddon = false,
      isActive = true,
      sessionMode = 'either',
      createdByUserId = null
    } = payload;
    const code = String(serviceCode || '').trim().toUpperCase();
    const mode = normalizeSessionMode(sessionMode, 'either');
    const tiersJson = Array.isArray(allowedCredentialTiers) && allowedCredentialTiers.length
      ? JSON.stringify(allowedCredentialTiers.map((t) => String(t).toLowerCase()))
      : null;
    const allowedPosJson = Array.isArray(allowedPlaceOfService) && allowedPlaceOfService.length
      ? JSON.stringify(
        allowedPlaceOfService
          .map((p) => String(p || '').trim().slice(0, 2))
          .filter(Boolean)
      )
      : null;
    try {
      await pool.execute(
        `INSERT INTO agency_medical_service_codes
           (agency_id, service_code, description, unit_calc_mode, unit_minutes, min_minutes, max_minutes,
            max_units_per_session, max_units_per_day, ladder_bands_json, overflow_service_code, overflow_at_minutes,
            default_place_of_service, allowed_place_of_service_json, allowed_credential_tiers_json,
            is_addon, is_active, session_mode, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           description = VALUES(description),
           unit_calc_mode = VALUES(unit_calc_mode),
           unit_minutes = VALUES(unit_minutes),
           min_minutes = VALUES(min_minutes),
           max_minutes = VALUES(max_minutes),
           max_units_per_session = VALUES(max_units_per_session),
           max_units_per_day = VALUES(max_units_per_day),
           ladder_bands_json = VALUES(ladder_bands_json),
           overflow_service_code = VALUES(overflow_service_code),
           overflow_at_minutes = VALUES(overflow_at_minutes),
           default_place_of_service = VALUES(default_place_of_service),
           allowed_place_of_service_json = VALUES(allowed_place_of_service_json),
           allowed_credential_tiers_json = VALUES(allowed_credential_tiers_json),
           is_addon = VALUES(is_addon),
           is_active = VALUES(is_active),
           session_mode = VALUES(session_mode),
           updated_at = CURRENT_TIMESTAMP`,
        [
          agencyId,
          code,
          description,
          String(unitCalcMode || 'SINGLE').toUpperCase(),
          unitMinutes,
          minMinutes,
          maxMinutes,
          maxUnitsPerSession,
          maxUnitsPerDay,
          ladderBandsJson ? JSON.stringify(ladderBandsJson) : null,
          overflowServiceCode ? String(overflowServiceCode).toUpperCase() : null,
          overflowAtMinutes,
          defaultPlaceOfService || null,
          allowedPosJson,
          tiersJson,
          isAddon ? 1 : 0,
          isActive ? 1 : 0,
          mode,
          createdByUserId
        ]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      // Pre-migration 1403 / 995/975 fallback — omit session_mode and newer columns as needed
      try {
        await pool.execute(
          `INSERT INTO agency_medical_service_codes
             (agency_id, service_code, description, unit_calc_mode, unit_minutes, min_minutes, max_minutes,
              max_units_per_session, max_units_per_day, ladder_bands_json, overflow_service_code, overflow_at_minutes,
              default_place_of_service, allowed_place_of_service_json, allowed_credential_tiers_json,
              is_addon, is_active, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             description = VALUES(description),
             unit_calc_mode = VALUES(unit_calc_mode),
             unit_minutes = VALUES(unit_minutes),
             min_minutes = VALUES(min_minutes),
             max_minutes = VALUES(max_minutes),
             max_units_per_session = VALUES(max_units_per_session),
             max_units_per_day = VALUES(max_units_per_day),
             ladder_bands_json = VALUES(ladder_bands_json),
             overflow_service_code = VALUES(overflow_service_code),
             overflow_at_minutes = VALUES(overflow_at_minutes),
             default_place_of_service = VALUES(default_place_of_service),
             allowed_place_of_service_json = VALUES(allowed_place_of_service_json),
             allowed_credential_tiers_json = VALUES(allowed_credential_tiers_json),
             is_addon = VALUES(is_addon),
             is_active = VALUES(is_active),
             updated_at = CURRENT_TIMESTAMP`,
          [
            agencyId,
            code,
            description,
            String(unitCalcMode || 'SINGLE').toUpperCase(),
            unitMinutes,
            minMinutes,
            maxMinutes,
            maxUnitsPerSession,
            maxUnitsPerDay,
            ladderBandsJson ? JSON.stringify(ladderBandsJson) : null,
            overflowServiceCode ? String(overflowServiceCode).toUpperCase() : null,
            overflowAtMinutes,
            defaultPlaceOfService || null,
            allowedPosJson,
            tiersJson,
            isAddon ? 1 : 0,
            isActive ? 1 : 0,
            createdByUserId
          ]
        );
      } catch (e2) {
        if (e2?.code !== 'ER_BAD_FIELD_ERROR') throw e2;
        try {
          await pool.execute(
            `INSERT INTO agency_medical_service_codes
               (agency_id, service_code, description, unit_calc_mode, unit_minutes, min_minutes, max_minutes,
                max_units_per_session, max_units_per_day, ladder_bands_json, overflow_service_code, overflow_at_minutes,
                default_place_of_service, allowed_credential_tiers_json, is_addon, is_active, created_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               description = VALUES(description),
               unit_calc_mode = VALUES(unit_calc_mode),
               unit_minutes = VALUES(unit_minutes),
               min_minutes = VALUES(min_minutes),
               max_minutes = VALUES(max_minutes),
               max_units_per_session = VALUES(max_units_per_session),
               max_units_per_day = VALUES(max_units_per_day),
               ladder_bands_json = VALUES(ladder_bands_json),
               overflow_service_code = VALUES(overflow_service_code),
               overflow_at_minutes = VALUES(overflow_at_minutes),
               default_place_of_service = VALUES(default_place_of_service),
               allowed_credential_tiers_json = VALUES(allowed_credential_tiers_json),
               is_addon = VALUES(is_addon),
               is_active = VALUES(is_active),
               updated_at = CURRENT_TIMESTAMP`,
            [
              agencyId,
              code,
              description,
              String(unitCalcMode || 'SINGLE').toUpperCase(),
              unitMinutes,
              minMinutes,
              maxMinutes,
              maxUnitsPerSession,
              maxUnitsPerDay,
              ladderBandsJson ? JSON.stringify(ladderBandsJson) : null,
              overflowServiceCode ? String(overflowServiceCode).toUpperCase() : null,
              overflowAtMinutes,
              defaultPlaceOfService || null,
              tiersJson,
              isAddon ? 1 : 0,
              isActive ? 1 : 0,
              createdByUserId
            ]
          );
        } catch (e3) {
          if (e3?.code !== 'ER_BAD_FIELD_ERROR') throw e3;
          await pool.execute(
            `INSERT INTO agency_medical_service_codes
               (agency_id, service_code, description, unit_calc_mode, unit_minutes, min_minutes, max_minutes,
                max_units_per_session, max_units_per_day, ladder_bands_json, overflow_service_code, overflow_at_minutes,
                default_place_of_service, is_active, created_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               description = VALUES(description),
               unit_calc_mode = VALUES(unit_calc_mode),
               unit_minutes = VALUES(unit_minutes),
               min_minutes = VALUES(min_minutes),
               max_minutes = VALUES(max_minutes),
               max_units_per_session = VALUES(max_units_per_session),
               max_units_per_day = VALUES(max_units_per_day),
               ladder_bands_json = VALUES(ladder_bands_json),
               overflow_service_code = VALUES(overflow_service_code),
               overflow_at_minutes = VALUES(overflow_at_minutes),
               default_place_of_service = VALUES(default_place_of_service),
               is_active = VALUES(is_active),
               updated_at = CURRENT_TIMESTAMP`,
            [
              agencyId,
              code,
              description,
              String(unitCalcMode || 'SINGLE').toUpperCase(),
              unitMinutes,
              minMinutes,
              maxMinutes,
              maxUnitsPerSession,
              maxUnitsPerDay,
              ladderBandsJson ? JSON.stringify(ladderBandsJson) : null,
              overflowServiceCode ? String(overflowServiceCode).toUpperCase() : null,
              overflowAtMinutes,
              defaultPlaceOfService || null,
              isActive ? 1 : 0,
              createdByUserId
            ]
          );
        }
      }
    }
    return this.findByAgencyAndCode(agencyId, code);
  }

  /**
   * Opt-in missed-event billing override. Default mode is none (no insurance claim).
   */
  static async updateMissedBillingOverride(agencyId, serviceCode, {
    missedBillingMode = 'none',
    missedBillingServiceCode = null,
    missedBillingTriggers = 'no_show,late_cancel'
  } = {}) {
    const code = String(serviceCode || '').trim().toUpperCase();
    const mode = String(missedBillingMode || 'none').trim().toLowerCase();
    if (!['none', 'fee_ledger_only', 'secondary_claim_draft'].includes(mode)) {
      throw Object.assign(new Error('missedBillingMode must be none, fee_ledger_only, or secondary_claim_draft'), {
        status: 400
      });
    }
    await pool.execute(
      `UPDATE agency_medical_service_codes
       SET missed_billing_mode = ?,
           missed_billing_service_code = ?,
           missed_billing_triggers = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = ? AND service_code = ?`,
      [
        mode,
        missedBillingServiceCode ? String(missedBillingServiceCode).trim().toUpperCase() : null,
        String(missedBillingTriggers || 'no_show,late_cancel'),
        Number(agencyId),
        code
      ]
    );
    return this.findByAgencyAndCode(agencyId, code);
  }
}

export default AgencyMedicalServiceCode;
