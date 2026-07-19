import pool from '../config/database.js';

class AgencyMedicalServiceCode {
  static async listByAgency(agencyId, { includeInactive = false } = {}) {
    const [rows] = await pool.execute(
      `SELECT * FROM agency_medical_service_codes
       WHERE agency_id = ?
         AND (? = 1 OR is_active = 1)
       ORDER BY service_code ASC`,
      [agencyId, includeInactive ? 1 : 0]
    );
    return rows || [];
  }

  static async findByAgencyAndCode(agencyId, serviceCode) {
    const [rows] = await pool.execute(
      `SELECT * FROM agency_medical_service_codes
       WHERE agency_id = ? AND service_code = ?
       LIMIT 1`,
      [agencyId, String(serviceCode || '').trim().toUpperCase()]
    );
    return rows?.[0] || null;
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
      createdByUserId = null
    } = payload;
    const code = String(serviceCode || '').trim().toUpperCase();
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
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      // Pre-migration 995/975 fallback
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
      } catch (e2) {
        if (e2?.code !== 'ER_BAD_FIELD_ERROR') throw e2;
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
    return this.findByAgencyAndCode(agencyId, code);
  }
}

export default AgencyMedicalServiceCode;
