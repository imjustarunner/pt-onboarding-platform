import pool from '../config/database.js';
import OfficeLocation from './OfficeLocation.model.js';

class KioskAgencyAssignment {
  static DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  static async findByKioskUserId(kioskUserId, options = {}) {
    const { asOfDate = new Date() } = options;
    const dateStr = asOfDate instanceof Date ? asOfDate.toISOString().slice(0, 10) : String(asOfDate).slice(0, 10);
    const dayOfWeek = asOfDate instanceof Date ? asOfDate.getDay() : new Date(asOfDate).getDay();
    const dayName = this.DAY_NAMES[dayOfWeek];

    const [rows] = await pool.execute(
      `SELECT kaa.*, a.name as agency_name, ol.name as location_name, p.name as program_name
       FROM kiosk_agency_assignments kaa
       JOIN agencies a ON a.id = kaa.agency_id
       LEFT JOIN office_locations ol ON ol.id = kaa.office_location_id
       LEFT JOIN programs p ON p.id = kaa.program_id
       WHERE kaa.kiosk_user_id = ? AND kaa.is_active = TRUE
         AND (kaa.valid_from IS NULL OR kaa.valid_from <= ?)
         AND (kaa.valid_until IS NULL OR kaa.valid_until >= ?)
       ORDER BY a.name, ol.name, p.name`,
      [kioskUserId, dateStr, dateStr]
    );

    const filtered = (rows || []).filter((r) => {
      const allowedDays = r.allowed_days_json
        ? (typeof r.allowed_days_json === 'string' ? JSON.parse(r.allowed_days_json) : r.allowed_days_json)
        : null;
      if (!allowedDays || !Array.isArray(allowedDays) || allowedDays.length === 0) return true;
      return allowedDays.map((d) => String(d).toLowerCase()).includes(dayName);
    });
    return filtered;
  }

  static async getContextForKiosk(kioskUserId, options = {}) {
    const assignments = await this.findByKioskUserId(kioskUserId, options);
    if (!assignments?.length) return null;

    const agencies = [];
    const seenAgencyIds = new Set();
    for (const a of assignments) {
      if (seenAgencyIds.has(a.agency_id)) continue;
      seenAgencyIds.add(a.agency_id);
      const agencyAssignments = assignments.filter((x) => x.agency_id === a.agency_id);
      const locationIds = new Set();
      const locations = [];
      for (const aa of agencyAssignments) {
        if (aa.office_location_id && !locationIds.has(aa.office_location_id)) {
          locationIds.add(aa.office_location_id);
          const allowedDays = aa.allowed_days_json
            ? (typeof aa.allowed_days_json === 'string' ? JSON.parse(aa.allowed_days_json) : aa.allowed_days_json)
            : null;
          locations.push({
            id: aa.office_location_id,
            name: aa.location_name,
            program_id: aa.program_id,
            allowed_days: allowedDays,
            settings: aa.settings_json
              ? (typeof aa.settings_json === 'string' ? JSON.parse(aa.settings_json) : aa.settings_json)
              : { allowed_modes: ['clock', 'guardian', 'event', 'client_check_in'], default_mode: 'clock', show_mode_selector: true }
          });
        }
      }
      if (locationIds.size === 0) {
        const allLocs = await OfficeLocation.findByAgencyMembership(a.agency_id);
        for (const loc of allLocs || []) {
          if (!locationIds.has(loc.id)) {
            locationIds.add(loc.id);
            locations.push({
              id: loc.id,
              name: loc.name,
              program_id: null,
              allowed_days: null,
              settings: { allowed_modes: ['clock', 'guardian', 'event', 'client_check_in'], default_mode: 'clock', show_mode_selector: true }
            });
          }
        }
      }
      const programs = [];
      for (const aa of agencyAssignments) {
        if (aa.program_id && !programs.some((p) => p.id === aa.program_id)) {
          programs.push({ id: aa.program_id, name: aa.program_name });
        }
      }
      const defaultSettings = {
        allowed_modes: ['clock', 'guardian', 'event', 'client_check_in'],
        default_mode: 'clock',
        show_mode_selector: true,
        kiosk_type: 'lobby'
      };
      agencies.push({
        id: a.agency_id,
        name: a.agency_name,
        assignments: agencyAssignments.map((aa) => ({
          office_location_id: aa.office_location_id,
          program_id: aa.program_id,
          valid_from: aa.valid_from,
          valid_until: aa.valid_until,
          allowed_days: aa.allowed_days_json
            ? (typeof aa.allowed_days_json === 'string' ? JSON.parse(aa.allowed_days_json) : aa.allowed_days_json)
            : null,
          settings: aa.settings_json
            ? { ...defaultSettings, ...(typeof aa.settings_json === 'string' ? JSON.parse(aa.settings_json) : aa.settings_json) }
            : defaultSettings
        })),
        locations,
        programs
      });
    }
    return {
      agencies,
      singleAgency: agencies.length === 1 ? agencies[0] : null
    };
  }

  static async listByOffice(officeLocationId) {
    const [rows] = await pool.execute(
      `SELECT kaa.*, a.name as agency_name, ol.name as location_name, p.name as program_name,
              u.first_name as kiosk_first_name, u.last_name as kiosk_last_name
       FROM kiosk_agency_assignments kaa
       JOIN agencies a ON a.id = kaa.agency_id
       JOIN users u ON u.id = kaa.kiosk_user_id
       LEFT JOIN office_locations ol ON ol.id = kaa.office_location_id
       LEFT JOIN programs p ON p.id = kaa.program_id
       WHERE kaa.office_location_id = ? AND kaa.is_active = TRUE
       ORDER BY u.last_name, u.first_name, a.name`,
      [officeLocationId]
    );
    return rows || [];
  }

  static async create({
    kioskUserId,
    agencyId,
    officeLocationId = null,
    programId = null,
    settingsJson = null,
    validFrom = null,
    validUntil = null,
    allowedDaysJson = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO kiosk_agency_assignments (kiosk_user_id, agency_id, office_location_id, program_id, settings_json, valid_from, valid_until, allowed_days_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        kioskUserId,
        agencyId,
        officeLocationId,
        programId,
        settingsJson ? JSON.stringify(settingsJson) : null,
        validFrom,
        validUntil,
        allowedDaysJson ? JSON.stringify(allowedDaysJson) : null
      ]
    );
    return result.insertId;
  }
}

export default KioskAgencyAssignment;
