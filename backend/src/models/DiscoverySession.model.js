import crypto from 'crypto';
import pool from '../config/database.js';

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function toSqlDatetime(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

class DiscoverySession {
  static generateAccessToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  static normalizeOptions(options = []) {
    if (!Array.isArray(options)) return [];
    return options
      .map((o) => {
        const startAt = o?.startAt || o?.start_at || null;
        const endAt = o?.endAt || o?.end_at || null;
        if (!startAt || !endAt) return null;
        const start = new Date(startAt);
        const end = new Date(endAt);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
        return {
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          label: String(o?.label || '').trim() || null
        };
      })
      .filter(Boolean)
      .slice(0, 6);
  }

  static hydrate(row) {
    if (!row) return null;
    return {
      ...row,
      proposed_options: parseJson(row.proposed_options_json, []),
      id: Number(row.id),
      agency_id: Number(row.agency_id),
      provider_id: Number(row.provider_id),
      client_id: Number(row.client_id),
      countdown_minutes: Number(row.countdown_minutes || 15)
    };
  }

  static async create({
    agencyId,
    providerId,
    clientId,
    publicAppointmentRequestId = null,
    options = [],
    countdownMinutes = 15,
    clientEmail,
    clientName,
    clientPhone = null,
    notes = null,
    createdByUserId = null,
    tokenExpiresAt = null,
    status = 'PROPOSED'
  }) {
    const accessToken = this.generateAccessToken();
    const normalized = this.normalizeOptions(options);
    if (!normalized.length) {
      throw new Error('At least one valid time option is required');
    }
    const [result] = await pool.execute(
      `INSERT INTO discovery_sessions
        (agency_id, provider_id, client_id, public_appointment_request_id, access_token, token_expires_at,
         status, proposed_options_json, countdown_minutes, client_email, client_name, client_phone, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(agencyId),
        Number(providerId),
        Number(clientId),
        publicAppointmentRequestId ? Number(publicAppointmentRequestId) : null,
        accessToken,
        toSqlDatetime(tokenExpiresAt),
        String(status || 'PROPOSED').toUpperCase(),
        JSON.stringify(normalized),
        Math.max(5, Math.min(180, Number(countdownMinutes) || 15)),
        String(clientEmail || '').trim().toLowerCase(),
        String(clientName || '').trim(),
        clientPhone ? String(clientPhone).trim() : null,
        notes ? String(notes).trim() : null,
        createdByUserId ? Number(createdByUserId) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM discovery_sessions WHERE id = ? LIMIT 1`, [Number(id)]);
    return this.hydrate(rows?.[0] || null);
  }

  static async findByToken(token) {
    const t = String(token || '').trim();
    if (!t) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM discovery_sessions WHERE access_token = ? LIMIT 1`,
      [t]
    );
    return this.hydrate(rows?.[0] || null);
  }

  static async listForAgency({ agencyId, clientId = null, status = null, limit = 50 } = {}) {
    const clauses = ['agency_id = ?'];
    const params = [Number(agencyId)];
    if (clientId) {
      clauses.push('client_id = ?');
      params.push(Number(clientId));
    }
    if (status) {
      clauses.push('status = ?');
      params.push(String(status).toUpperCase());
    }
    params.push(Math.max(1, Math.min(200, Number(limit) || 50)));
    const [rows] = await pool.execute(
      `SELECT * FROM discovery_sessions
       WHERE ${clauses.join(' AND ')}
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`,
      params
    );
    return (rows || []).map((r) => this.hydrate(r));
  }

  static async markBooked(id, {
    optionIndex,
    bookedStartAt,
    bookedEndAt,
    providerScheduleEventId = null
  }) {
    await pool.execute(
      `UPDATE discovery_sessions
       SET status = 'BOOKED',
           selected_option_index = ?,
           booked_start_at = ?,
           booked_end_at = ?,
           provider_schedule_event_id = COALESCE(?, provider_schedule_event_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        Number(optionIndex),
        toSqlDatetime(bookedStartAt),
        toSqlDatetime(bookedEndAt),
        providerScheduleEventId ? Number(providerScheduleEventId) : null,
        Number(id)
      ]
    );
    return this.findById(id);
  }

  static async setVideoRoom(id, { vonageSessionId, roomUniqueName }) {
    await pool.execute(
      `UPDATE discovery_sessions
       SET vonage_session_id = ?, room_unique_name = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [vonageSessionId || null, roomUniqueName || null, Number(id)]
    );
    return this.findById(id);
  }

  static async updateMeta(id, { countdownMinutes = undefined, notes = undefined, status = undefined } = {}) {
    const sets = [];
    const params = [];
    if (countdownMinutes !== undefined) {
      sets.push('countdown_minutes = ?');
      params.push(Math.max(5, Math.min(180, Number(countdownMinutes) || 15)));
    }
    if (notes !== undefined) {
      sets.push('notes = ?');
      params.push(notes ? String(notes) : null);
    }
    if (status !== undefined) {
      sets.push('status = ?');
      params.push(String(status).toUpperCase());
    }
    if (!sets.length) return this.findById(id);
    params.push(Number(id));
    await pool.execute(
      `UPDATE discovery_sessions SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      params
    );
    return this.findById(id);
  }

  static async listBookedStartingBetween(startSql, endSql) {
    const [rows] = await pool.execute(
      `SELECT * FROM discovery_sessions
       WHERE status = 'BOOKED'
         AND booked_start_at >= ?
         AND booked_start_at < ?
       ORDER BY booked_start_at ASC`,
      [startSql, endSql]
    );
    return (rows || []).map((r) => this.hydrate(r));
  }
}

export default DiscoverySession;
