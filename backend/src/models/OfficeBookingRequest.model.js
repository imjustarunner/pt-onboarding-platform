import { allocateOfficeRoom,lockOfficeRequests,unlockOfficeRequests } from '../services/officeRoomAllocation.service.js';
import { assertRoomBookingStart } from '../utils/roomBookingWindow.js';
import OfficeLocation from './OfficeLocation.model.js';
import pool from '../config/database.js';

class OfficeBookingRequest {
  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM office_booking_requests WHERE id = ? LIMIT 1', [id]);
    return rows?.[0] || null;
  }

  static async create(input) {
    if (!['PROVIDER_REQUEST','INTAKE_REQUEST'].includes(input.requestType || 'PROVIDER_REQUEST')) return this.insert(input);
    const db = await pool.getConnection();
    let locked=false;
    try {
      await lockOfficeRequests(db); locked=true;
      await db.beginTransaction();
      const allocation=await allocateOfficeRoom(db,{officeId:input.officeLocationId,providerId:input.requestedProviderId,roomId:input.roomId,roomType:input.roomType || 'counseling',startAt:input.startAt,endAt:input.endAt,recurrence:input.recurrence || 'ONCE',occurrenceCount:input.bookedOccurrenceCount});
      const result=await this.insert({...input,roomId:allocation.roomId},db);
      await db.commit();
      await unlockOfficeRequests(db);locked=false;
      await this.notifyPending(result);
      return result;
    } catch(error) { await db.rollback(); throw error; }
    finally { if(locked)await unlockOfficeRequests(db); db.release(); }
  }
  static async notifyPending(result) {
    try {
      const {notifyOfficeRequestPending}=await import('../services/officeApprovalWorkflow.service.js');
      await notifyOfficeRequestPending({source:'booking',id:result.id,officeId:result.office_location_id,providerId:result.requested_provider_id});
    } catch(error) { console.error('[office-request] Pending alert failed',error.message); }
  }
  static async insert({
    requestType = 'PROVIDER_REQUEST',
    officeLocationId,
    roomId = null,
    requestedProviderId,
    clientId = null,
    startAt,
    endAt,
    recurrence = 'ONCE',
    bookedOccurrenceCount = null,
    openToAlternativeRoom = false,
    requesterNotes = null,
    appointmentTypeCode = null,
    appointmentSubtypeCode = null,
    serviceCode = null,
    modality = null,
    sessionContext = null
  }, db = pool) {
    if (['PROVIDER_REQUEST','INTAKE_REQUEST'].includes(requestType)) {
      const office = await OfficeLocation.findById(officeLocationId);
      assertRoomBookingStart(startAt,office?.timezone || 'America/Denver');
    }
    const occurrenceCount = Number.isInteger(Number(bookedOccurrenceCount)) && Number(bookedOccurrenceCount) > 0
      ? Number(bookedOccurrenceCount)
      : null;
    let result;
    try {
      [result] = await db.execute(
        `INSERT INTO office_booking_requests
          (request_type, status, office_location_id, room_id, requested_provider_id, client_id, start_at, end_at, recurrence, booked_occurrence_count, appointment_type_code, appointment_subtype_code, service_code, modality, open_to_alternative_room, requester_notes)
         VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          requestType,
          officeLocationId,
          roomId,
          requestedProviderId,
          clientId,
          startAt,
          endAt,
          recurrence,
          occurrenceCount,
          appointmentTypeCode,
          appointmentSubtypeCode,
          serviceCode,
          modality,
          openToAlternativeRoom ? 1 : 0,
          requesterNotes
        ]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      [result] = await db.execute(
        `INSERT INTO office_booking_requests
          (request_type, status, office_location_id, room_id, requested_provider_id, start_at, end_at, recurrence, open_to_alternative_room, requester_notes)
         VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          requestType,
          officeLocationId,
          roomId,
          requestedProviderId,
          startAt,
          endAt,
          recurrence,
          openToAlternativeRoom ? 1 : 0,
          requesterNotes
        ]
      );
    }
    if (sessionContext) await db.execute('UPDATE office_booking_requests SET session_context_json = ? WHERE id = ?', [JSON.stringify(sessionContext), result.insertId]);
    const [[row]] = await db.execute('SELECT * FROM office_booking_requests WHERE id=?',[result.insertId]);
    if(db===pool)await this.notifyPending(row);
    return row;
  }

  static async listPendingForAgencies(agencyIds, { officeLocationId = null } = {}) {
    const ids = (agencyIds || [])
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(', ');
    const params = [...ids];
    let where = `ola.agency_id IN (${placeholders}) AND r.status = 'PENDING'`;
    if (officeLocationId) {
      where += ' AND r.office_location_id = ?';
      params.push(parseInt(officeLocationId, 10));
    }

    const [rows] = await pool.execute(
      `SELECT DISTINCT
         r.*,
         ol.name AS office_location_name,
         ol.timezone AS office_timezone,
         rm.name AS room_name,
         rm.room_number AS room_number,
         rm.label AS room_label,
         u.first_name AS requester_first_name,
         u.last_name AS requester_last_name,
         u.email AS requester_email,
         c.full_name AS client_full_name,
         c.initials AS client_initials
       FROM office_booking_requests r
       JOIN office_locations ol ON r.office_location_id = ol.id
       JOIN office_location_agencies ola ON ola.office_location_id = ol.id
       LEFT JOIN office_rooms rm ON r.room_id = rm.id
       JOIN users u ON u.id = r.requested_provider_id
       LEFT JOIN clients c ON c.id = r.client_id
       WHERE ${where}
       ORDER BY r.created_at ASC`,
      params
    );
    return rows || [];
  }

  static async markDecided({ requestId, status, decidedByUserId, approverComment = null }) {
    await pool.execute(
      `UPDATE office_booking_requests
       SET status = ?,
           decided_by_user_id = ?,
           approver_comment = ?,
           decided_at = NOW(),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, decidedByUserId, approverComment, requestId]
    );
    return this.findById(requestId);
  }
}

export default OfficeBookingRequest;

