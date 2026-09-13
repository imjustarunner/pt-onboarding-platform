import { resolveClientProviderHolds } from '../services/publicProviderHold.service.js';
import pool from '../config/database.js';

const LIVE_STATUSES = new Set([
  'draft',
  'scheduled',
  'confirmed',
  'client_confirmed',
  'completed',
  'canceled_by_provider',
  'canceled_by_client',
  'canceled_by_guardian',
  'canceled_by_organization',
  'late_canceled',
  'no_show',
  'rescheduled',
  'reschedule_requested',
  'cancellation_requested',
  'voided'
]);

const VIDEO_ROOM_MODES = new Set(['unique_session', 'my_room']);
const NOTIFICATION_MODES = new Set(['default', 'customizable']);

function parseJsonSafe(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function normalizeVideoRoomMode(raw, fallback = 'unique_session') {
  const s = String(raw || fallback).trim().toLowerCase();
  return VIDEO_ROOM_MODES.has(s) ? s : fallback;
}

function normalizeNotificationMode(raw, fallback = 'default') {
  const s = String(raw || fallback).trim().toLowerCase();
  return NOTIFICATION_MODES.has(s) ? s : fallback;
}

class Appointment {
  static normalizeStatus(raw, fallback = 'scheduled') {
    const s = String(raw || fallback).trim().toLowerCase();
    return LIVE_STATUSES.has(s) ? s : fallback;
  }

  static mapRow(r) {
    if (!r) return null;
    return {
      id: Number(r.id),
      agencyId: Number(r.agency_id),
      parentAgencyId: r.parent_agency_id == null ? null : Number(r.parent_agency_id),
      businessType: r.business_type ? String(r.business_type) : null,
      tenantServiceId: r.tenant_service_id == null ? null : Number(r.tenant_service_id),
      providerUserId: r.provider_user_id == null ? null : Number(r.provider_user_id),
      startAt: r.start_at || null,
      endAt: r.end_at || null,
      modality: r.modality ? String(r.modality).toUpperCase() : null,
      officeLocationId: r.office_location_id == null ? null : Number(r.office_location_id),
      roomId: r.room_id == null ? null : Number(r.room_id),
      status: String(r.status || 'scheduled'),
      participantMode: String(r.participant_mode || 'individual'),
      officeEventId: r.office_event_id == null ? null : Number(r.office_event_id),
      officeBookingRequestId: r.office_booking_request_id == null ? null : Number(r.office_booking_request_id),
      providerScheduleEventId: r.provider_schedule_event_id == null ? null : Number(r.provider_schedule_event_id),
      serviceLocationId: r.service_location_id == null ? null : Number(r.service_location_id),
      sourceTimezone: r.source_timezone || 'America/Denver',
      clinicalSessionId: r.clinical_session_id == null ? null : Number(r.clinical_session_id),
      packageEntitlementId: r.package_entitlement_id == null ? null : Number(r.package_entitlement_id),
      cancellationPolicyId: r.cancellation_policy_id == null ? null : Number(r.cancellation_policy_id),
      cancelDeadlineAt: r.cancel_deadline_at || null,
      cancellationReason: r.cancellation_reason != null ? String(r.cancellation_reason) : null,
      cancellationFeeCents: r.cancellation_fee_cents == null ? null : Number(r.cancellation_fee_cents),
      cancellationRecommendationJson: parseJsonSafe(r.cancellation_recommendation_json, null),
      canceledAt: r.canceled_at || null,
      canceledByUserId: r.canceled_by_user_id == null ? null : Number(r.canceled_by_user_id),
      source: String(r.source || 'staff_grid'),
      title: r.title != null ? String(r.title) : null,
      notes: r.notes != null ? String(r.notes) : null,
      othersPresentNames: r.others_present_names != null ? String(r.others_present_names) : null,
      videoRoomMode: normalizeVideoRoomMode(r.video_room_mode, 'unique_session'),
      notificationMode: normalizeNotificationMode(r.notification_mode, 'default'),
      serviceCode: r.service_code ? String(r.service_code).toUpperCase() : null,
      addonServiceCodes: (() => {
        const raw = parseJsonSafe(r.addon_service_codes_json, []);
        return Array.isArray(raw)
          ? raw.map((c) => String(c || '').toUpperCase().trim()).filter(Boolean)
          : [];
      })(),
      createdByUserId: r.created_by_user_id == null ? null : Number(r.created_by_user_id),
      updatedByUserId: r.updated_by_user_id == null ? null : Number(r.updated_by_user_id),
      createdAt: r.created_at || null,
      updatedAt: r.updated_at || null
    };
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM appointments WHERE id = ? LIMIT 1`, [Number(id)]);
    return this.mapRow(rows?.[0]);
  }

  static async findByOfficeEventId(officeEventId) {
    const oid = Number(officeEventId || 0);
    if (!oid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM appointments WHERE office_event_id = ? ORDER BY id DESC LIMIT 1`,
      [oid]
    );
    return this.mapRow(rows?.[0]);
  }

  static async findByProviderScheduleEventId(pseId) {
    const pid = Number(pseId || 0);
    if (!pid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM appointments WHERE provider_schedule_event_id = ? ORDER BY id DESC LIMIT 1`,
      [pid]
    );
    return this.mapRow(rows?.[0]);
  }

  static async listForAgencyInWindow({ agencyId, windowStart, windowEnd, providerUserId = null, clientId = null }) {
    const cid = Number(clientId || 0);
    if (cid) {
      const p = [cid, Number(agencyId), windowEnd, windowStart];
      let q = `
        SELECT DISTINCT a.* FROM appointments a
        INNER JOIN appointment_participants ap ON ap.appointment_id = a.id AND ap.client_id = ?
        WHERE a.agency_id = ?
          AND a.start_at < ?
          AND a.end_at > ?
      `;
      if (providerUserId) {
        q += ` AND a.provider_user_id = ?`;
        p.push(Number(providerUserId));
      }
      q += ` ORDER BY a.start_at DESC LIMIT 100`;
      const [rows] = await pool.execute(q, p);
      return (rows || []).map((r) => this.mapRow(r));
    }

    const plainParams = [Number(agencyId), windowEnd, windowStart];
    let sql = `
      SELECT * FROM appointments
      WHERE agency_id = ?
        AND start_at < ?
        AND end_at > ?
    `;
    if (providerUserId) {
      sql += ` AND provider_user_id = ?`;
      plainParams.push(Number(providerUserId));
    }
    sql += ` ORDER BY start_at ASC LIMIT 500`;
    const [rows] = await pool.execute(sql, plainParams);
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async listIdsByOfficeEventIds(officeEventIds = []) {
    const ids = Array.from(new Set((officeEventIds || []).map((n) => Number(n)).filter((n) => n > 0)));
    if (!ids.length) return new Map();
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT id, office_event_id FROM appointments
       WHERE office_event_id IN (${placeholders})`,
      ids
    );
    const map = new Map();
    for (const r of rows || []) {
      const oid = Number(r.office_event_id || 0);
      if (oid) map.set(oid, Number(r.id));
    }
    return map;
  }

  static async listIdsByProviderScheduleEventIds(pseIds = []) {
    const ids = Array.from(new Set((pseIds || []).map((n) => Number(n)).filter((n) => n > 0)));
    if (!ids.length) return new Map();
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT id, provider_schedule_event_id, status, notes FROM appointments
       WHERE provider_schedule_event_id IN (${placeholders})`,
      ids
    );
    const map = new Map();
    for (const r of rows || []) {
      const pid = Number(r.provider_schedule_event_id || 0);
      if (pid) {
        map.set(pid, {
          id: Number(r.id),
          status: String(r.status || 'scheduled').toLowerCase(),
          notes: r.notes != null ? String(r.notes) : null
        });
      }
    }
    return map;
  }

  static async create(row) {
    const othersPresentNames = row.othersPresentNames != null
      ? String(row.othersPresentNames).trim().slice(0, 500) || null
      : null;
    const videoRoomMode = normalizeVideoRoomMode(row.videoRoomMode, 'unique_session');
    const notificationMode = normalizeNotificationMode(row.notificationMode, 'default');
    const baseParams = [
      Number(row.agencyId),
      row.parentAgencyId || null,
      row.businessType || null,
      row.tenantServiceId || null,
      row.providerUserId || null,
      row.startAt,
      row.endAt,
      row.modality || null,
      row.officeLocationId || null,
      row.roomId || null,
      this.normalizeStatus(row.status),
      row.participantMode === 'multi' ? 'multi' : 'individual',
      row.officeEventId || null,
      row.officeBookingRequestId || null,
      row.providerScheduleEventId || null,
      row.clinicalSessionId || null,
      row.packageEntitlementId || null,
      row.cancellationPolicyId || null,
      row.cancelDeadlineAt || null,
      String(row.source || 'staff_grid').slice(0, 64),
      row.title || null,
      row.notes || null,
      row.createdByUserId || null,
      row.updatedByUserId || row.createdByUserId || null
    ];
    try {
      const [result] = await pool.execute(
        `INSERT INTO appointments (
           agency_id, parent_agency_id, business_type, tenant_service_id, provider_user_id,
           start_at, end_at, modality, office_location_id, room_id, status, participant_mode,
           office_event_id, office_booking_request_id, provider_schedule_event_id, clinical_session_id, package_entitlement_id,
           cancellation_policy_id, cancel_deadline_at,
           source, title, notes, others_present_names, video_room_mode, notification_mode,
           created_by_user_id, updated_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ...baseParams.slice(0, 22),
          othersPresentNames,
          videoRoomMode,
          notificationMode,
          baseParams[22],
          baseParams[23]
        ]
      );
      return this.findById(result.insertId);
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [result] = await pool.execute(
        `INSERT INTO appointments (
           agency_id, parent_agency_id, business_type, tenant_service_id, provider_user_id,
           start_at, end_at, modality, office_location_id, room_id, status, participant_mode,
           office_event_id, office_booking_request_id, provider_schedule_event_id, clinical_session_id, package_entitlement_id,
           cancellation_policy_id, cancel_deadline_at,
           source, title, notes, created_by_user_id, updated_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        baseParams
      );
      return this.findById(result.insertId);
    }
  }

  static async setServiceCodes(id, { serviceCode = null, addonServiceCodes = [] } = {}) {
    const aid = Number(id || 0);
    if (!aid) return null;
    const code = serviceCode ? String(serviceCode).trim().toUpperCase().slice(0, 32) : null;
    const addons = Array.isArray(addonServiceCodes)
      ? addonServiceCodes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean)
      : [];
    const json = addons.length ? JSON.stringify(addons) : null;
    try {
      await pool.execute(
        `UPDATE appointments
         SET service_code = COALESCE(?, service_code),
             addon_service_codes_json = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [code, json, aid]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      return this.findById(aid);
    }
    return this.findById(aid);
  }

  static async update(id, patch = {}) {
    const existing = await this.findById(id);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    const recJson = next.cancellationRecommendationJson != null
      ? JSON.stringify(next.cancellationRecommendationJson)
      : null;
    const othersPresentNames = next.othersPresentNames != null
      ? String(next.othersPresentNames).trim().slice(0, 500) || null
      : null;
    const videoRoomMode = normalizeVideoRoomMode(next.videoRoomMode, existing.videoRoomMode || 'unique_session');
    const notificationMode = normalizeNotificationMode(next.notificationMode, existing.notificationMode || 'default');
    try {
      await pool.execute(
        `UPDATE appointments SET
           business_type = ?, tenant_service_id = ?, provider_user_id = ?,
           start_at = ?, end_at = ?, modality = ?, office_location_id = ?, room_id = ?,
           status = ?, participant_mode = ?, office_event_id = ?, provider_schedule_event_id = ?,
           clinical_session_id = ?, package_entitlement_id = ?,
           cancellation_policy_id = ?, cancel_deadline_at = ?, cancellation_reason = ?,
           cancellation_fee_cents = ?, cancellation_recommendation_json = ?,
           canceled_at = ?, canceled_by_user_id = ?,
           title = ?, notes = ?,
           others_present_names = ?, video_room_mode = ?, notification_mode = ?,
           updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          next.businessType || null,
          next.tenantServiceId || null,
          next.providerUserId || null,
          next.startAt,
          next.endAt,
          next.modality || null,
          next.officeLocationId || null,
          next.roomId || null,
          this.normalizeStatus(next.status),
          next.participantMode === 'multi' ? 'multi' : 'individual',
          next.officeEventId || null,
          next.providerScheduleEventId || null,
          next.clinicalSessionId || null,
          next.packageEntitlementId || null,
          next.cancellationPolicyId || null,
          next.cancelDeadlineAt || null,
          next.cancellationReason || null,
          next.cancellationFeeCents == null ? null : Number(next.cancellationFeeCents),
          recJson,
          next.canceledAt || null,
          next.canceledByUserId || null,
          next.title || null,
          next.notes || null,
          othersPresentNames,
          videoRoomMode,
          notificationMode,
          next.updatedByUserId || null,
          Number(id)
        ]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      await pool.execute(
        `UPDATE appointments SET
           business_type = ?, tenant_service_id = ?, provider_user_id = ?,
           start_at = ?, end_at = ?, modality = ?, office_location_id = ?, room_id = ?,
           status = ?, participant_mode = ?, office_event_id = ?, provider_schedule_event_id = ?,
           clinical_session_id = ?, package_entitlement_id = ?,
           cancellation_policy_id = ?, cancel_deadline_at = ?, cancellation_reason = ?,
           cancellation_fee_cents = ?, cancellation_recommendation_json = ?,
           canceled_at = ?, canceled_by_user_id = ?,
           title = ?, notes = ?,
           updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          next.businessType || null,
          next.tenantServiceId || null,
          next.providerUserId || null,
          next.startAt,
          next.endAt,
          next.modality || null,
          next.officeLocationId || null,
          next.roomId || null,
          this.normalizeStatus(next.status),
          next.participantMode === 'multi' ? 'multi' : 'individual',
          next.officeEventId || null,
          next.providerScheduleEventId || null,
          next.clinicalSessionId || null,
          next.packageEntitlementId || null,
          next.cancellationPolicyId || null,
          next.cancelDeadlineAt || null,
          next.cancellationReason || null,
          next.cancellationFeeCents == null ? null : Number(next.cancellationFeeCents),
          recJson,
          next.canceledAt || null,
          next.canceledByUserId || null,
          next.title || null,
          next.notes || null,
          next.updatedByUserId || null,
          Number(id)
        ]
      );
    }
    return this.findById(id);
  }

  static async listParticipants(appointmentId) {
    const [rows] = await pool.execute(
      `SELECT * FROM appointment_participants WHERE appointment_id = ? ORDER BY sort_order ASC, id ASC`,
      [Number(appointmentId)]
    );
    return (rows || []).map((r) => ({
      id: Number(r.id),
      appointmentId: Number(r.appointment_id),
      role: String(r.role || 'client'),
      clientId: r.client_id == null ? null : Number(r.client_id),
      userId: r.user_id == null ? null : Number(r.user_id),
      displayName: r.display_name != null ? String(r.display_name) : null,
      isBillingResponsible: Number(r.is_billing_responsible) === 1,
      receivesReminders: Number(r.receives_reminders) === 1,
      sortOrder: Number(r.sort_order || 0)
    }));
  }

  static async replaceParticipants(appointmentId, participants = []) {
    const aid = Number(appointmentId);
    await pool.execute(`DELETE FROM appointment_participants WHERE appointment_id = ?`, [aid]);
    let i = 0;
    for (const p of participants || []) {
      const clientId = Number(p.clientId || p.client_id || 0) || null;
      const userId = Number(p.userId || p.user_id || 0) || null;
      if (!clientId && !userId && !String(p.displayName || p.display_name || '').trim()) continue;
      await pool.execute(
        `INSERT INTO appointment_participants (
           appointment_id, role, client_id, user_id, display_name,
           is_billing_responsible, receives_reminders, sort_order
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          aid,
          String(p.role || 'client').slice(0, 32),
          clientId,
          userId,
          p.displayName || p.display_name || null,
          p.isBillingResponsible || p.is_billing_responsible ? 1 : 0,
          p.receivesReminders === false || p.receives_reminders === 0 ? 0 : 1,
          Number(p.sortOrder ?? p.sort_order ?? i)
        ]
      );
      i += 1;
    }
    const [scheduled]=await pool.execute("SELECT created_by_user_id FROM appointments WHERE id=? AND status IN ('scheduled','confirmed') AND end_at>UTC_TIMESTAMP()",[aid]);
    if(scheduled.length) {
      for(const clientId of new Set(participants.map(p=>Number(p.clientId || p.client_id || 0)).filter(Boolean))) {
        await resolveClientProviderHolds(pool,{clientId,userId:scheduled[0].created_by_user_id,reason:'PLACED_ON_SCHEDULE'});
      }
    }
    return this.listParticipants(aid);
  }

  static async upsertBilling(appointmentId, billing = {}) {
    const aid = Number(appointmentId);
    const settlementMode = String(billing.settlementMode || billing.settlement_mode || 'self_pay').slice(0, 64);
    const [existing] = await pool.execute(
      `SELECT id FROM appointment_billing WHERE appointment_id = ? LIMIT 1`,
      [aid]
    );
    if (existing?.[0]?.id) {
      await pool.execute(
        `UPDATE appointment_billing SET
           settlement_mode = ?,
           responsible_party_type = ?,
           responsible_client_id = ?,
           amount_cents = ?,
           package_entitlement_id = ?,
           payment_status = ?,
           notes = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE appointment_id = ?`,
        [
          settlementMode,
          billing.responsiblePartyType || billing.responsible_party_type || null,
          billing.responsibleClientId || billing.responsible_client_id || null,
          billing.amountCents ?? billing.amount_cents ?? null,
          billing.packageEntitlementId || billing.package_entitlement_id || null,
          String(billing.paymentStatus || billing.payment_status || 'none').slice(0, 64),
          billing.notes || null,
          aid
        ]
      );
    } else {
      await pool.execute(
        `INSERT INTO appointment_billing (
           appointment_id, settlement_mode, responsible_party_type, responsible_client_id,
           amount_cents, package_entitlement_id, payment_status, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          aid,
          settlementMode,
          billing.responsiblePartyType || billing.responsible_party_type || null,
          billing.responsibleClientId || billing.responsible_client_id || null,
          billing.amountCents ?? billing.amount_cents ?? null,
          billing.packageEntitlementId || billing.package_entitlement_id || null,
          String(billing.paymentStatus || billing.payment_status || 'none').slice(0, 64),
          billing.notes || null
        ]
      );
    }
    const [rows] = await pool.execute(
      `SELECT * FROM appointment_billing WHERE appointment_id = ? LIMIT 1`,
      [aid]
    );
    const r = rows?.[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      appointmentId: Number(r.appointment_id),
      settlementMode: String(r.settlement_mode),
      responsiblePartyType: r.responsible_party_type,
      responsibleClientId: r.responsible_client_id == null ? null : Number(r.responsible_client_id),
      amountCents: r.amount_cents == null ? null : Number(r.amount_cents),
      packageEntitlementId: r.package_entitlement_id == null ? null : Number(r.package_entitlement_id),
      paymentStatus: String(r.payment_status || 'none'),
      notes: r.notes
    };
  }

  static async getBilling(appointmentId) {
    const [rows] = await pool.execute(
      `SELECT * FROM appointment_billing WHERE appointment_id = ? LIMIT 1`,
      [Number(appointmentId)]
    );
    const r = rows?.[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      appointmentId: Number(r.appointment_id),
      settlementMode: String(r.settlement_mode),
      responsiblePartyType: r.responsible_party_type,
      responsibleClientId: r.responsible_client_id == null ? null : Number(r.responsible_client_id),
      amountCents: r.amount_cents == null ? null : Number(r.amount_cents),
      packageEntitlementId: r.package_entitlement_id == null ? null : Number(r.package_entitlement_id),
      paymentStatus: String(r.payment_status || 'none'),
      notes: r.notes
    };
  }
}

export default Appointment;
