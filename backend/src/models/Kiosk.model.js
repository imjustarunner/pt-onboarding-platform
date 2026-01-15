import pool from '../config/database.js';
import crypto from 'crypto';

class KioskModel {
  static hashPin(pin) {
    const normalized = String(pin || '').trim();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  static async createCheckin({ locationId, providerId, slotSignature, checkinDate, checkinTime, pinHash }) {
    const [result] = await pool.execute(
      `INSERT INTO kiosk_checkins
       (location_id, provider_id, slot_signature, checkin_date, checkin_time, pin_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [locationId, providerId, slotSignature, checkinDate, checkinTime, pinHash]
    );
    return this.getCheckinById(result.insertId);
  }

  static async getCheckinById(id) {
    const [rows] = await pool.execute('SELECT * FROM kiosk_checkins WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async listCheckinsForLocationDate(locationId, date) {
    const [rows] = await pool.execute(
      `SELECT kc.*,
              u.first_name AS provider_first_name,
              u.last_name AS provider_last_name
       FROM kiosk_checkins kc
       JOIN users u ON kc.provider_id = u.id
       WHERE kc.location_id = ? AND kc.checkin_date = ?
       ORDER BY kc.created_at DESC`,
      [locationId, date]
    );
    return rows;
  }

  static async createSurvey({ locationId, providerId, surveyType, slotSignature, surveyDate, pinHash, answers, score }) {
    const [result] = await pool.execute(
      `INSERT INTO kiosk_surveys
       (location_id, provider_id, survey_type, slot_signature, survey_date, pin_hash, answers, score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [locationId, providerId, surveyType, slotSignature, surveyDate, pinHash, JSON.stringify(answers), score]
    );
    return this.getSurveyById(result.insertId);
  }

  static async getSurveyById(id) {
    const [rows] = await pool.execute('SELECT * FROM kiosk_surveys WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async findSurveys({ providerId, slotSignature, pinHash, surveyType = null, limit = 50 }) {
    const params = [providerId, slotSignature, pinHash];
    let where = 'provider_id = ? AND slot_signature = ? AND pin_hash = ?';
    if (surveyType) {
      where += ' AND survey_type = ?';
      params.push(surveyType);
    }
    params.push(limit);
    const [rows] = await pool.execute(
      `SELECT * FROM kiosk_surveys
       WHERE ${where}
       ORDER BY survey_date DESC, created_at DESC
       LIMIT ?`,
      params
    );
    return rows;
  }
}

export default KioskModel;

