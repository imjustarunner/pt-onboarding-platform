import pool from '../config/database.js';

class PublicAppointmentRequest {
  static async create({
    agencyId,
    providerId,
    modality,
    requestedStartAt,
    requestedEndAt,
    clientName,
    clientEmail,
    clientPhone = null,
    notes = null
  }) {
    const aid = Number(agencyId || 0);
    const pid = Number(providerId || 0);
    if (!aid || !pid) throw new Error('Invalid agencyId/providerId');

    const mod = String(modality || '').trim().toUpperCase();
    if (mod !== 'VIRTUAL' && mod !== 'IN_PERSON') throw new Error('Invalid modality');

    const start = String(requestedStartAt || '').trim();
    const end = String(requestedEndAt || '').trim();
    if (!start || !end) throw new Error('Missing requested_start_at/requested_end_at');

    const name = String(clientName || '').trim().slice(0, 255);
    const email = String(clientEmail || '').trim().slice(0, 320);
    if (!name) throw new Error('client_name is required');
    if (!email) throw new Error('client_email is required');

    const phone = clientPhone === null ? null : String(clientPhone || '').trim().slice(0, 64);
    const memo = notes === null ? null : String(notes || '').trim().slice(0, 4000);

    const [r] = await pool.execute(
      `INSERT INTO public_appointment_requests
        (agency_id, provider_id, modality, requested_start_at, requested_end_at, client_name, client_email, client_phone, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [aid, pid, mod, start, end, name, email, phone || null, memo || null]
    );

    const id = Number(r?.insertId || 0);
    const [rows] = await pool.execute(
      `SELECT *
       FROM public_appointment_requests
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  }

  static async listPending({ agencyId, limit = 200 }) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const lim = Math.max(1, Math.min(1000, Number(limit || 200)));
    const [rows] = await pool.execute(
      `SELECT *
       FROM public_appointment_requests
       WHERE agency_id = ?
         AND status = 'PENDING'
       ORDER BY created_at DESC
       LIMIT ${lim}`,
      [aid]
    );
    return rows || [];
  }

  static async setStatus({ agencyId, requestId, status }) {
    const aid = Number(agencyId || 0);
    const rid = Number(requestId || 0);
    const st = String(status || '').trim().toUpperCase();
    if (!aid || !rid) return false;
    if (!['APPROVED', 'DECLINED', 'CANCELLED', 'PENDING'].includes(st)) return false;
    const [r] = await pool.execute(
      `UPDATE public_appointment_requests
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND agency_id = ?`,
      [st, rid, aid]
    );
    return Number(r?.affectedRows || 0) > 0;
  }
}

export default PublicAppointmentRequest;

