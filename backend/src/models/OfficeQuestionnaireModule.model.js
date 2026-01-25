import pool from '../config/database.js';

class OfficeQuestionnaireModule {
  static async listForOffice({ officeLocationId }) {
    try {
      const [rows] = await pool.execute(
        `SELECT
           oqm.office_location_id,
           oqm.module_id,
           oqm.agency_id,
           oqm.is_active,
           m.title AS module_title,
           m.description AS module_description
         FROM office_questionnaire_modules oqm
         JOIN modules m ON oqm.module_id = m.id
         WHERE oqm.office_location_id = ?
           AND oqm.is_active = TRUE
         ORDER BY m.title ASC`,
        [officeLocationId]
      );
      return rows || [];
    } catch (e) {
      // If migrations haven't been run yet, don't break Building Settings.
      if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') return [];
      throw e;
    }
  }

  static async upsert({ officeLocationId, moduleId, agencyId = null, isActive = true }) {
    try {
      await pool.execute(
        `INSERT INTO office_questionnaire_modules (office_location_id, module_id, agency_id, is_active)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
        [officeLocationId, moduleId, agencyId, isActive ? 1 : 0]
      );
      return true;
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
        throw new Error('Questionnaires tables are not available yet. Run office kiosk migrations.');
      }
      throw e;
    }
  }

  static async remove({ officeLocationId, moduleId, agencyId = null }) {
    try {
      const [result] = await pool.execute(
        `DELETE FROM office_questionnaire_modules
         WHERE office_location_id = ?
           AND module_id = ?
           AND agency_id <=> ?`,
        [officeLocationId, moduleId, agencyId]
      );
      return result.affectedRows > 0;
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') return false;
      throw e;
    }
  }
}

export default OfficeQuestionnaireModule;

