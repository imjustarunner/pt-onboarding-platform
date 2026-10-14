import { activeOfficeProviderSql, inactiveOfficeProvider } from '../utils/officeProviderEligibility.js';
import { resolveClientProviderHolds } from '../services/publicProviderHold.service.js';
import pool from '../config/database.js';

function normalizeMySqlDateTime(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.replace('T', ' ').replace('Z', '').slice(0, 19);

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

class OfficeEvent {
  static lockNameForSlot({ roomId }) {
    // Different, overlapping time ranges must share the same lock.
    return `office_room:${Number(roomId)}`;
  }

  static duplicateSlotError(conflict = null) {
    const err = new Error('That office has an existing schedule event during this time.');
    err.status = 409;
    err.code = 'OFFICE_SLOT_CONFLICT';
    err.conflict = conflict || null;
    return err;
  }

  static async findActiveRoomConflicts({ roomId, startAt, endAt, excludeEventId = null, executor = pool }) {
    const normalizedStartAt = normalizeMySqlDateTime(startAt);
    const normalizedEndAt = normalizeMySqlDateTime(endAt);
    const params = [roomId, normalizedEndAt, normalizedStartAt];
    let excludeSql = '';
    if (excludeEventId) {
      excludeSql = 'AND e.id <> ?';
      params.push(excludeEventId);
    }
    const [rows] = await executor.execute(
      `SELECT
         e.id,
         e.office_location_id,
         e.room_id,
         e.start_at,
         e.end_at,
         e.status,
         e.slot_state,
         e.assigned_provider_id,
         e.booked_provider_id,
         e.client_id,
         e.session_context_json,
         CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS provider_name
       FROM office_events e
       LEFT JOIN users u ON u.id = COALESCE(e.booked_provider_id, e.assigned_provider_id)
       WHERE e.room_id = ?
         AND e.start_at < ?
         AND e.end_at > ?
         AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
         ${excludeSql}
       ORDER BY e.start_at ASC, e.id ASC
       LIMIT 10`,
      params
    );
    return rows || [];
  }

  static async withRoomSlotLock({ roomId, startAt, endAt, timeoutSeconds = 8 }, fn) {
    const conn = await pool.getConnection();
    const lockName = this.lockNameForSlot({ roomId, startAt, endAt });
    let lockAcquired = false;
    try {
      const [[lockRow]] = await conn.execute('SELECT GET_LOCK(?, ?) AS got_lock', [lockName, timeoutSeconds]);
      lockAcquired = Number(lockRow?.got_lock || 0) === 1;
      if (!lockAcquired) {
        const err = new Error('Office slot is busy. Please refresh and try again.');
        err.status = 409;
        err.code = 'OFFICE_SLOT_LOCK_TIMEOUT';
        throw err;
      }
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      if (lockAcquired) {
        try { await conn.execute('SELECT RELEASE_LOCK(?)', [lockName]); } catch { /* ignore */ }
      }
      conn.release();
    }
  }

  static async findById(id, executor = pool) {
    const [rows] = await executor.execute('SELECT * FROM office_events WHERE id = ? LIMIT 1', [id]);
    return rows?.[0] || null;
  }

  static async create({
    officeLocationId,
    roomId,
    startAt,
    endAt,
    status,
    slotState = null,
    standingAssignmentId = null,
    bookingPlanId = null,
    assignedProviderId = null,
    bookedProviderId = null,
    clientId = null,
    clinicalSessionId = null,
    noteContextId = null,
    billingContextId = null,
    source,
    recurrenceGroupId = null,
    notes = null,
    appointmentTypeCode = null,
    appointmentSubtypeCode = null,
    serviceCode = null,
    modality = null,
    createdByUserId,
    approvedByUserId = null,
    executor = pool
  }) {
    const normalizedStartAt = normalizeMySqlDateTime(startAt);
    const normalizedEndAt = normalizeMySqlDateTime(endAt);
    let result;
    try {
      [result] = await executor.execute(
        `INSERT INTO office_events
         (office_location_id, room_id, start_at, end_at, status, slot_state, standing_assignment_id, booking_plan_id, assigned_provider_id, booked_provider_id, client_id, clinical_session_id, note_context_id, billing_context_id, source, recurrence_group_id, notes, appointment_type_code, appointment_subtype_code, service_code, modality, created_by_user_id, approved_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          officeLocationId,
          roomId,
          normalizedStartAt,
          normalizedEndAt,
          status,
          slotState,
          standingAssignmentId,
          bookingPlanId,
          assignedProviderId,
          bookedProviderId,
          clientId,
          clinicalSessionId,
          noteContextId,
          billingContextId,
          source,
          recurrenceGroupId,
          notes,
          appointmentTypeCode,
          appointmentSubtypeCode,
          serviceCode,
          modality,
          createdByUserId,
          approvedByUserId
        ]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      [result] = await executor.execute(
        `INSERT INTO office_events
         (office_location_id, room_id, start_at, end_at, status, slot_state, standing_assignment_id, booking_plan_id, assigned_provider_id, booked_provider_id, source, recurrence_group_id, notes, created_by_user_id, approved_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          officeLocationId,
          roomId,
          normalizedStartAt,
          normalizedEndAt,
          status,
          slotState,
          standingAssignmentId,
          bookingPlanId,
          assignedProviderId,
          bookedProviderId,
          source,
          recurrenceGroupId,
          notes,
          createdByUserId,
          approvedByUserId
        ]
      );
    }
    if(clientId && String(status).toUpperCase()==='BOOKED') await resolveClientProviderHolds(executor,{clientId,userId:createdByUserId,reason:'PLACED_ON_SCHEDULE'});
    return this.findById(result.insertId, executor);
  }

  static async createIfRoomOpen(args) {
    const normalizedStartAt = normalizeMySqlDateTime(args.startAt);
    const normalizedEndAt = normalizeMySqlDateTime(args.endAt);
    return this.withRoomSlotLock({
      roomId: args.roomId,
      startAt: normalizedStartAt,
      endAt: normalizedEndAt
    }, async (conn) => {
      const conflicts = await this.findActiveRoomConflicts({
        roomId: args.roomId,
        startAt: normalizedStartAt,
        endAt: normalizedEndAt,
        executor: conn
      });
      if (conflicts.length) {
        const requestedProviderId = Number(args.bookedProviderId || args.assignedProviderId || 0) || null;
        const reusable = conflicts.length === 1
          && requestedProviderId
          && Number(conflicts[0].assigned_provider_id || conflicts[0].booked_provider_id || 0) === requestedProviderId
          && String(conflicts[0].status || '').toUpperCase() !== 'BOOKED'
          && !['ASSIGNED_BOOKED', 'COMPANY_HOLD'].includes(String(conflicts[0].slot_state || '').toUpperCase());
        if (reusable) {
          await conn.execute(
            `UPDATE office_events
             SET start_at = ?, end_at = ?, status = ?,
                 slot_state = COALESCE(?, slot_state),
                 booked_provider_id = ?,
                 client_id = COALESCE(?, client_id),
                 notes = COALESCE(?, notes),
                 appointment_type_code = COALESCE(?, appointment_type_code),
                 appointment_subtype_code = COALESCE(?, appointment_subtype_code),
                 service_code = COALESCE(?, service_code),
                 modality = COALESCE(?, modality),
                 approved_by_user_id = COALESCE(?, approved_by_user_id),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
              normalizedStartAt,
              normalizedEndAt,
              args.status,
              args.slotState || 'ASSIGNED_BOOKED',
              requestedProviderId,
              args.clientId || null,
              args.notes || null,
              args.appointmentTypeCode || null,
              args.appointmentSubtypeCode || null,
              args.serviceCode || null,
              args.modality || null,
              args.approvedByUserId || null,
              conflicts[0].id
            ]
          );
          if (args.sessionContext) await conn.execute('UPDATE office_events SET session_context_json = ? WHERE id = ?', [JSON.stringify(args.sessionContext), conflicts[0].id]);
          if(args.clientId && String(args.status).toUpperCase()==='BOOKED') await resolveClientProviderHolds(conn,{clientId:args.clientId,userId:args.createdByUserId,reason:'PLACED_ON_SCHEDULE'});
          return conflicts[0].id;
        }
        throw this.duplicateSlotError(conflicts[0]);
      }
      let result;
      try {
        [result] = await conn.execute(
          `INSERT INTO office_events
           (office_location_id, room_id, start_at, end_at, status, slot_state, standing_assignment_id, booking_plan_id, assigned_provider_id, booked_provider_id, client_id, clinical_session_id, note_context_id, billing_context_id, source, recurrence_group_id, notes, appointment_type_code, appointment_subtype_code, service_code, modality, created_by_user_id, approved_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            args.officeLocationId,
            args.roomId,
            normalizedStartAt,
            normalizedEndAt,
            args.status,
            args.slotState || null,
            args.standingAssignmentId || null,
            args.bookingPlanId || null,
            args.assignedProviderId || null,
            args.bookedProviderId || null,
            args.clientId || null,
            args.clinicalSessionId || null,
            args.noteContextId || null,
            args.billingContextId || null,
            args.source,
            args.recurrenceGroupId || null,
            args.notes || null,
            args.appointmentTypeCode || null,
            args.appointmentSubtypeCode || null,
            args.serviceCode || null,
            args.modality || null,
            args.createdByUserId,
            args.approvedByUserId || null
          ]
        );
      } catch (e) {
        if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
        [result] = await conn.execute(
          `INSERT INTO office_events
           (office_location_id, room_id, start_at, end_at, status, slot_state, standing_assignment_id, booking_plan_id, assigned_provider_id, booked_provider_id, source, recurrence_group_id, notes, created_by_user_id, approved_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            args.officeLocationId,
            args.roomId,
            normalizedStartAt,
            normalizedEndAt,
            args.status,
            args.slotState || null,
            args.standingAssignmentId || null,
            args.bookingPlanId || null,
            args.assignedProviderId || null,
            args.bookedProviderId || null,
            args.source,
            args.recurrenceGroupId || null,
            args.notes || null,
            args.createdByUserId,
            args.approvedByUserId || null
          ]
        );
      }
      if (args.sessionContext) await conn.execute('UPDATE office_events SET session_context_json = ? WHERE id = ?', [JSON.stringify(args.sessionContext), result.insertId]);
      if(args.clientId && String(args.status).toUpperCase()==='BOOKED') await resolveClientProviderHolds(conn,{clientId:args.clientId,userId:args.createdByUserId,reason:'PLACED_ON_SCHEDULE'});
      return result.insertId;
    }).then((id) => this.findById(id));
  }

  static async listForOfficeWindow({ officeLocationId, startAt, endAt }) {
    const [rows] = await pool.execute(
      `SELECT
         e.*,
         r.name AS room_name,
         r.room_number AS room_number,
         r.label AS room_label,
         bu.first_name AS booked_provider_first_name,
         bu.last_name AS booked_provider_last_name,
         au.first_name AS assigned_provider_first_name,
         au.last_name AS assigned_provider_last_name,
         sa.provider_id AS standing_assignment_provider_id,
         sa.booking_agency_id,
         su.first_name AS standing_provider_first_name,
         su.last_name AS standing_provider_last_name
       FROM office_events e
       JOIN office_rooms r ON e.room_id = r.id
       LEFT JOIN users bu ON e.booked_provider_id = bu.id
       LEFT JOIN users au ON e.assigned_provider_id = au.id
       LEFT JOIN office_standing_assignments sa ON e.standing_assignment_id = sa.id
       LEFT JOIN users su ON sa.provider_id = su.id
       WHERE e.office_location_id = ?
         AND e.start_at < ?
         AND e.end_at > ?
         AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
         AND (e.end_at<UTC_TIMESTAMP() OR COALESCE(e.booked_provider_id,e.assigned_provider_id,sa.provider_id) IS NULL
           OR EXISTS (SELECT 1 FROM users owner WHERE owner.id=COALESCE(e.booked_provider_id,e.assigned_provider_id,sa.provider_id) AND ${activeOfficeProviderSql('owner')}))`,
      [officeLocationId, endAt, startAt]
    );
    return rows || [];
  }

  static async findByRoomAndStart(roomId, startAt, executor = pool) {
    const normalizedStartAt = normalizeMySqlDateTime(startAt);
    const [rows] = await executor.execute(
      `SELECT *
       FROM office_events
       WHERE room_id = ?
         AND start_at = ?
       ORDER BY CASE WHEN UPPER(COALESCE(status, '')) = 'CANCELLED' THEN 1 ELSE 0 END ASC, id DESC
       LIMIT 1`,
      [roomId, normalizedStartAt]
    );
    return rows?.[0] || null;
  }

  static async upsertSlotState({
    officeLocationId,
    roomId,
    startAt,
    endAt,
    slotState,
    standingAssignmentId = null,
    bookingPlanId = null,
    recurrenceGroupId = null,
    assignedProviderId = null,
    bookedProviderId = null,
    createdByUserId,
    replaceCancelled = false,
    allowAutomaticReservationDowngrade = false,
    notes = null,
    _locked = false,
    executor = pool
  }) {
    const normalizedStartAt = normalizeMySqlDateTime(startAt);
    const normalizedEndAt = normalizeMySqlDateTime(endAt);
    if (!_locked) {
      return this.withRoomSlotLock({
        roomId,
        startAt: normalizedStartAt,
        endAt: normalizedEndAt
      }, async conn => {
        // Serialize materialization with provider offboarding. A previously read
        // template must not recreate reservations after its owner is archived.
        if (standingAssignmentId) {
          const [[source]] = await conn.execute(`SELECT a.is_active AS assignment_active,u.is_active,u.status,u.is_archived
            FROM office_standing_assignments a JOIN users u ON u.id=a.provider_id WHERE a.id=? FOR UPDATE`, [standingAssignmentId]);
          if (!source || !Number(source.assignment_active) || inactiveOfficeProvider(source)) return null;
        }
        return this.upsertSlotState({
        officeLocationId,
        roomId,
        startAt: normalizedStartAt,
        endAt: normalizedEndAt,
        slotState,
        standingAssignmentId,
        bookingPlanId,
        recurrenceGroupId,
        assignedProviderId,
        bookedProviderId,
        createdByUserId,
        replaceCancelled,
        allowAutomaticReservationDowngrade,
        notes,
        _locked: true,
        // All reads and writes must use the transaction holding the source-row
        // locks; a second connection would block on its foreign-key checks.
        executor: conn
        });
      });
    }
    // Recheck source rows while holding the room lock. A materializer may have
    // read a plan just before client termination stopped it.
    if (bookingPlanId) {
      const [[plan]] = await executor.execute('SELECT is_active FROM office_booking_plans WHERE id=?', [bookingPlanId]);
      if (!plan || Number(plan.is_active) === 0) return null;
    } else if (standingAssignmentId && slotState === 'ASSIGNED_BOOKED') {
      const [[assignment]] = await executor.execute('SELECT client_booking_released_at FROM office_standing_assignments WHERE id=?', [standingAssignmentId]);
      if (assignment?.client_booking_released_at) { slotState='ASSIGNED_AVAILABLE'; bookedProviderId=null; allowAutomaticReservationDowngrade=true; }
    }
    const [overlaps] = await executor.execute(`SELECT id,assigned_provider_id,booked_provider_id,start_at,end_at FROM office_events
      WHERE room_id=? AND start_at<? AND end_at>? AND status='BOOKED'`, [roomId,normalizedEndAt,normalizedStartAt]);
    if (overlaps.some(row => Number(row.booked_provider_id || row.assigned_provider_id) !== Number(assignedProviderId)
      || normalizeMySqlDateTime(row.start_at) !== normalizedStartAt || normalizeMySqlDateTime(row.end_at) !== normalizedEndAt)) return null;
    // Keep legacy `status` aligned for older code paths.
    const legacyStatus = (slotState === 'ASSIGNED_BOOKED' || slotState === 'COMPANY_HOLD') ? 'BOOKED' : 'RELEASED';

    const existing = await this.findByRoomAndStart(roomId, normalizedStartAt, executor);
    if (existing?.id) {
      const existingCancelled = String(existing.status || '').toUpperCase() === 'CANCELLED';
      // Explicit cancellations/forfeits are authoritative and must never be resurrected.
      if (existingCancelled) {
        const incomingStandingId = Number(standingAssignmentId || 0) || null;
        const existingStandingId = Number(existing.standing_assignment_id || 0) || null;
        const incomingProviderId = Number(assignedProviderId || 0) || null;
        const existingProviderId = Number(
          existing.assigned_provider_id || existing.booked_provider_id || 0
        ) || null;
        const shouldReactivateCancelledSlot = replaceCancelled
          || (incomingStandingId && incomingStandingId !== existingStandingId)
          || (incomingProviderId && incomingProviderId !== existingProviderId);

        if (shouldReactivateCancelledSlot) {
          const [linkedAppointments] = await executor.execute('SELECT id FROM appointments WHERE office_event_id = ? LIMIT 1', [existing.id]);
          if (existing.client_id || existing.clinical_session_id || existing.billing_context_id || existing.note_context_id || linkedAppointments.length) {
            throw Object.assign(new Error('This cancelled occurrence has a client record. Preserve it and schedule through the appointment workflow.'), { status: 409 });
          }
          await executor.execute(
            `UPDATE office_events
             SET office_location_id = ?,
                 room_id = ?,
                 start_at = ?,
                 end_at = ?,
                 status = ?,
                 slot_state = ?,
                 standing_assignment_id = ?,
                 booking_plan_id = ?,
                 recurrence_group_id = ?,
                 assigned_provider_id = ?,
                 booked_provider_id = ?,
                 client_id = NULL,
                 notes = COALESCE(?, notes),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
              officeLocationId,
              roomId,
              normalizedStartAt,
              normalizedEndAt,
              legacyStatus,
              slotState,
              standingAssignmentId,
              bookingPlanId,
              recurrenceGroupId,
              assignedProviderId,
              bookedProviderId,
              notes,
              existing.id
            ]
          );
          return await this.findById(existing.id, executor);
        }
        return await this.findById(existing.id, executor);
      }
      const existingIsBooked =
        String(existing.status || '').toUpperCase() === 'BOOKED'
        || String(existing.slot_state || '').toUpperCase() === 'ASSIGNED_BOOKED';
      const incomingAssignedId = Number(assignedProviderId || 0) || null;
      const existingBookedId = Number(existing.booked_provider_id || 0) || null;
      // Materialization should never downgrade a booked occurrence back to assigned_available/temporary
      // when the same provider still owns it. Explicit endpoints own unbooking transitions.
      // Exception: do NOT preserve a foreign booked_provider under a different standing assignee
      // (that creates assigned=A / booked=B ghosts, often after reassignment or rematerialize).
      let preserveBooked = existingIsBooked && String(slotState || '').toUpperCase() !== 'ASSIGNED_BOOKED';
      if (preserveBooked && allowAutomaticReservationDowngrade && existing.standing_assignment_id
        && (!existingBookedId || existingBookedId === incomingAssignedId)
        && !existing.client_id && !existing.clinical_session_id && !existing.billing_context_id && !existing.note_context_id) {
        const [linked] = await executor.execute('SELECT id FROM appointments WHERE office_event_id = ? LIMIT 1', [existing.id]);
        if (!linked.length) preserveBooked = false;
      }
      if (
        preserveBooked
        && incomingAssignedId
        && existingBookedId
        && existingBookedId !== incomingAssignedId
      ) {
        preserveBooked = false;
      }
      const effectiveSlotState = preserveBooked ? 'ASSIGNED_BOOKED' : slotState;
      const effectiveStatus = preserveBooked ? 'BOOKED' : legacyStatus;
      const effectiveBookedProviderId = preserveBooked
        ? (existingBookedId || bookedProviderId || incomingAssignedId || null)
        : bookedProviderId;
      await executor.execute(
        `UPDATE office_events
         SET office_location_id = ?,
             room_id = ?,
             start_at = ?,
             end_at = ?,
             status = ?,
             slot_state = ?,
             standing_assignment_id = ?,
             booking_plan_id = ?,
             recurrence_group_id = ?,
             assigned_provider_id = ?,
             booked_provider_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          officeLocationId,
          roomId,
          normalizedStartAt,
          normalizedEndAt,
          effectiveStatus,
          effectiveSlotState,
          standingAssignmentId,
          bookingPlanId,
          recurrenceGroupId,
          assignedProviderId,
          effectiveBookedProviderId,
          existing.id
        ]
      );
      return await this.findById(existing.id, executor);
    }

    // Minimal create (source will be refined once workflows are wired)
    return await this.create({
      officeLocationId,
      roomId,
      startAt: normalizedStartAt,
      endAt: normalizedEndAt,
      status: legacyStatus,
      slotState,
      standingAssignmentId,
      bookingPlanId,
      assignedProviderId,
      bookedProviderId,
      source: 'ADMIN_OVERRIDE',
      recurrenceGroupId,
      notes,
      createdByUserId,
      approvedByUserId: null,
      executor
    });
  }

  static async markBooked({
    eventId,
    bookedProviderId,
    appointmentTypeCode = null,
    appointmentSubtypeCode = null,
    serviceCode = null,
    modality = null,
    serviceLocationId = null,
    addonServiceCodes = null
  }) {
    const addonsJson = Array.isArray(addonServiceCodes) && addonServiceCodes.length
      ? JSON.stringify(addonServiceCodes.map((c) => String(c || '').toUpperCase().trim()).filter(Boolean))
      : null;
    try {
      await pool.execute(
        `UPDATE office_events
         SET status = 'BOOKED',
             slot_state = 'ASSIGNED_BOOKED',
             booked_provider_id = ?,
             appointment_type_code = COALESCE(?, appointment_type_code),
             appointment_subtype_code = COALESCE(?, appointment_subtype_code),
             service_code = COALESCE(?, service_code),
             modality = COALESCE(?, modality),
             service_location_id = COALESCE(?, service_location_id),
             addon_service_codes_json = COALESCE(?, addon_service_codes_json),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          bookedProviderId,
          appointmentTypeCode,
          appointmentSubtypeCode,
          serviceCode,
          modality,
          serviceLocationId,
          addonsJson,
          eventId
        ]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      try {
        await pool.execute(
          `UPDATE office_events
           SET status = 'BOOKED',
               slot_state = 'ASSIGNED_BOOKED',
               booked_provider_id = ?,
               appointment_type_code = COALESCE(?, appointment_type_code),
               appointment_subtype_code = COALESCE(?, appointment_subtype_code),
               service_code = COALESCE(?, service_code),
               modality = COALESCE(?, modality),
               service_location_id = COALESCE(?, service_location_id),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            bookedProviderId,
            appointmentTypeCode,
            appointmentSubtypeCode,
            serviceCode,
            modality,
            serviceLocationId,
            eventId
          ]
        );
      } catch (e2) {
        if (e2?.code !== 'ER_BAD_FIELD_ERROR') throw e2;
        try {
          await pool.execute(
            `UPDATE office_events
             SET status = 'BOOKED',
                 slot_state = 'ASSIGNED_BOOKED',
                 booked_provider_id = ?,
                 appointment_type_code = COALESCE(?, appointment_type_code),
                 appointment_subtype_code = COALESCE(?, appointment_subtype_code),
                 service_code = COALESCE(?, service_code),
                 modality = COALESCE(?, modality),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [bookedProviderId, appointmentTypeCode, appointmentSubtypeCode, serviceCode, modality, eventId]
          );
        } catch (e3) {
          if (e3?.code !== 'ER_BAD_FIELD_ERROR') throw e3;
          await pool.execute(
            `UPDATE office_events
             SET status = 'BOOKED',
                 slot_state = 'ASSIGNED_BOOKED',
                 booked_provider_id = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [bookedProviderId, eventId]
          );
        }
      }
    }
    return await this.findById(eventId);
  }

  static async setContextLinkage({
    eventId,
    clientId = null,
    clinicalSessionId = null,
    noteContextId = null,
    billingContextId = null
  }) {
    try {
      await pool.execute(
        `UPDATE office_events
         SET client_id = COALESCE(?, client_id),
             clinical_session_id = ?,
             note_context_id = ?,
             billing_context_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [clientId, clinicalSessionId, noteContextId, billingContextId, eventId]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      // Pre-migration fallback: keep existing row untouched.
    }
    if(clientId){
      const [events]=await pool.execute("SELECT status FROM office_events WHERE id=?",[eventId]);
      if(String(events[0]?.status).toUpperCase()==='BOOKED') await resolveClientProviderHolds(pool,{clientId,reason:'PLACED_ON_SCHEDULE'});
    }
    // Keep unified appointments aligned with office_events clinical session linkage.
    try {
      await pool.execute(
        `UPDATE appointments
         SET clinical_session_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE office_event_id = ?`,
        [clinicalSessionId, eventId]
      );
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }
    return await this.findById(eventId);
  }

  static async markAvailable({ eventId }) {
    await pool.execute(
      `UPDATE office_events
       SET status = 'RELEASED',
           slot_state = 'ASSIGNED_AVAILABLE',
           booked_provider_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [eventId]
    );
    return await this.findById(eventId);
  }

  static async listBookedForOfficeDate({ officeLocationId, date }) {
    // date: YYYY-MM-DD
    const day = String(date || '').slice(0, 10);
    if (!officeLocationId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];

    const startAt = `${day} 00:00:00`;
    const endAt = `${day} 23:59:59`;

    const [rows] = await pool.execute(
      `SELECT
         e.*,
         r.name AS room_name,
         r.svg_room_id AS room_svg_room_id,
         u.first_name AS provider_first_name,
         u.last_name AS provider_last_name
       FROM office_events e
       JOIN office_rooms r ON e.room_id = r.id
       LEFT JOIN users u ON e.booked_provider_id = u.id
       WHERE e.office_location_id = ?
         AND e.status = 'BOOKED'
         AND e.start_at >= ?
         AND e.start_at <= ?
       ORDER BY e.start_at ASC, r.sort_order ASC, r.name ASC`,
      [officeLocationId, startAt, endAt]
    );
    return rows || [];
  }

  static async cancelOccurrence({ eventId }) {
    await pool.execute(
      `UPDATE office_events
       SET status = 'CANCELLED',
           slot_state = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [eventId]
    );
    return await this.findById(eventId);
  }

  static async cancelFutureByStandingAssignment({ standingAssignmentId, startAt }) {
    const [result] = await pool.execute(
      `UPDATE office_events
       SET status = 'CANCELLED',
           slot_state = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE standing_assignment_id = ?
         AND start_at >= ?`,
      [standingAssignmentId, startAt]
    );
    return Number(result?.affectedRows || 0);
  }

  /** Cancel event for a specific slot when it was created by a standing assignment (e.g. off-week when assignment weekly + booking biweekly). */
  static async cancelSlotIfFromStandingAssignment({ roomId, startAt, endAt, standingAssignmentId }) {
    const normalizedStart = normalizeMySqlDateTime(startAt);
    const normalizedEnd = normalizeMySqlDateTime(endAt);
    if (!roomId || !normalizedStart || !normalizedEnd || !standingAssignmentId) return 0;
    const [result] = await pool.execute(
      `UPDATE office_events
       SET status = 'CANCELLED',
           slot_state = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE room_id = ?
         AND start_at = ?
         AND standing_assignment_id = ?`,
      [roomId, normalizedStart, standingAssignmentId]
    );
    return Number(result?.affectedRows || 0);
  }

  static async cancelFutureByRecurrenceGroup({ recurrenceGroupId, startAt }) {
    const [result] = await pool.execute(
      `UPDATE office_events
       SET status = 'CANCELLED',
           slot_state = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE recurrence_group_id = ?
         AND start_at >= ?`,
      [recurrenceGroupId, startAt]
    );
    return Number(result?.affectedRows || 0);
  }

  static async setOutcome({ eventId, outcome = null, cancellationReason = null }) {
    const normalizedOutcome = String(outcome || '').trim().toUpperCase() || null;
    const normalizedReason = String(cancellationReason || '').trim() || null;
    const allowed = new Set(['MISSED', 'NO_SHOW', 'CANCELED', 'COMPLETED']);
    if (normalizedOutcome && !allowed.has(normalizedOutcome)) {
      const err = new Error('Invalid outcome');
      err.status = 400;
      throw err;
    }
    if (normalizedOutcome === 'CANCELED' && !normalizedReason) {
      const err = new Error('cancellationReason is required when outcome is CANCELED');
      err.status = 400;
      throw err;
    }

    await pool.execute(
      `UPDATE office_events
       SET status_outcome = ?,
           cancellation_reason = CASE
             WHEN ? = 'CANCELED' THEN ?
             ELSE NULL
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [normalizedOutcome, normalizedOutcome, normalizedReason, eventId]
    );
    return await this.findById(eventId);
  }
}

export default OfficeEvent;
