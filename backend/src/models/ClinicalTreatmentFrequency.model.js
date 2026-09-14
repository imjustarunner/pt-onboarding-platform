import pool from '../config/database.js';

export const TREATMENT_FREQUENCIES = ['Twice per week', 'Weekly', 'Biweekly (every two weeks)', 'Monthly'];
export default class ClinicalTreatmentFrequency {
  static async list({ agencyId, userId }) {
    let rows;
    try {
      [rows] = await pool.execute('SELECT name FROM clinical_treatment_frequency_catalog WHERE agency_id = ? AND user_id = ? ORDER BY name', [agencyId, userId]);
    } catch (error) {
      if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
      rows = [];
    }
    return [...new Set([...TREATMENT_FREQUENCIES, ...rows.map((row) => row.name)])];
  }
  static async add({ agencyId, userId, name }) {
    await pool.execute('INSERT IGNORE INTO clinical_treatment_frequency_catalog (agency_id, user_id, name) VALUES (?, ?, ?)', [agencyId, userId, name]);
    return this.list({ agencyId, userId });
  }
}
