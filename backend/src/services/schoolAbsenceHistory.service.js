import pool from '../config/database.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';

export function createSchoolAbsenceHistory({ database = pool, encrypt = maybeEncryptNotePayload, decrypt = maybeDecryptNotePayload } = {}) {
  const decode = value => value ? JSON.parse(decrypt(value)) : null;
  function display(row) {
    const item = decode(row.snapshot_payload);
    return { id: Number(row.id), agencyId: Number(row.agency_id), providerId: Number(row.provider_id), clientId: Number(row.client_id),
      schoolId: Number(row.school_id), date: String(row.absence_date).slice(0, 10), actorUserId: Number(row.actor_user_id),
      actorName: row.actor_name || null, recordedAt: row.recorded_at, urgent: !!Number(row.urgent), reason: item.reason,
      absenceSource: item.absenceSource, schoolName: item.source.assignment.school_name, providerName: item.source.assignment.provider_name,
      clientName: item.clients[0].clientName, slots: item.source.assignment.slots || [], message: item.message,
      delivery: decode(row.delivery_payload) || { held: 1, reason: 'Delivery has not completed. Review before contacting again.' },
      nonBillable: true, source: 'school_soft_schedule' };
  }
  async function begin(token, item, actorUserId) {
    await database.execute(`INSERT IGNORE INTO school_day_absence_history
      (agency_id,provider_id,client_id,school_id,absence_date,review_token,actor_user_id,reason_category,urgent,snapshot_payload)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [item.agencyId,item.providerId,item.clientId,item.schoolId,item.date,token,actorUserId,
      item.reasonCategory || 'provider_unavailable',item.urgent === false ? 0 : 1,encrypt(JSON.stringify(item))]);
    const [[row]] = await database.execute(`SELECT id FROM school_day_absence_history
      WHERE agency_id=? AND provider_id=? AND client_id=? AND school_id=? AND absence_date=?`, [item.agencyId,item.providerId,item.clientId,item.schoolId,item.date]);
    return row.id;
  }
  async function finish(id, delivery) {
    await database.execute('UPDATE school_day_absence_history SET delivery_payload=? WHERE id=?', [encrypt(JSON.stringify(delivery)), id]);
  }
  async function list({ agencyId, providerId = null, clientId = null, startDate = null, endDate = null }) {
    const [rows] = await database.execute(`SELECT h.*, DATE_FORMAT(h.absence_date,'%Y-%m-%d') AS absence_date,
      CONCAT_WS(' ',u.first_name,u.last_name) AS actor_name FROM school_day_absence_history h
      LEFT JOIN users u ON u.id=h.actor_user_id WHERE h.agency_id=?
      AND (? IS NULL OR h.provider_id=?) AND (? IS NULL OR h.client_id=?)
      AND (? IS NULL OR h.absence_date>=?) AND (? IS NULL OR h.absence_date<?)
      ORDER BY h.absence_date DESC,h.id DESC LIMIT 500`, [agencyId,providerId,providerId,clientId,clientId,startDate,startDate,endDate,endDate]);
    return rows.map(display);
  }
  return { begin, finish, list };
}
export const schoolAbsenceHistory = createSchoolAbsenceHistory();
