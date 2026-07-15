import crypto from 'crypto';
import pool from '../config/database.js';

const VALID_STATUSES = new Set(['scheduled', 'joining', 'active', 'ended']);

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default class CounselingSession {
  static generateInviteToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  static generatePublicId() {
    return crypto.randomUUID();
  }

  static async create({
    agencyId,
    providerUserId,
    clientUserId = null,
    appointmentId = null,
    title = null,
    vonageSessionId = null,
    vonageApplicationId = null,
    roomUniqueName = null,
    status = 'scheduled',
    guestInviteToken = null,
    guestInviteExpiresAt = null,
    publicId = null
  }) {
    const token = guestInviteToken || this.generateInviteToken();
    const pub = publicId || this.generatePublicId();
    const [result] = await pool.execute(
      `INSERT INTO counseling_sessions
        (agency_id, provider_user_id, client_user_id, appointment_id, status,
         vonage_session_id, vonage_application_id, room_unique_name, title,
         guest_invite_token, guest_invite_expires_at, public_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(agencyId),
        Number(providerUserId),
        clientUserId != null ? Number(clientUserId) : null,
        appointmentId != null ? Number(appointmentId) : null,
        VALID_STATUSES.has(status) ? status : 'scheduled',
        vonageSessionId || null,
        vonageApplicationId || null,
        roomUniqueName || null,
        title || null,
        token,
        guestInviteExpiresAt || null,
        pub
      ]
    );
    return this.findById(result.insertId);
  }

  static async findByInviteToken(token) {
    const [rows] = await pool.execute(
      `SELECT * FROM counseling_sessions WHERE guest_invite_token = ? LIMIT 1`,
      [String(token || '')]
    );
    return rows[0] || null;
  }

  static async findByPublicId(publicId) {
    const [rows] = await pool.execute(
      `SELECT * FROM counseling_sessions WHERE public_id = ? LIMIT 1`,
      [String(publicId || '')]
    );
    return rows[0] || null;
  }

  /** Accept numeric DB id or opaque public_id UUID. */
  static async findByIdOrPublicId(idOrPublic) {
    const raw = String(idOrPublic || '').trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return this.findById(raw);
    return this.findByPublicId(raw);
  }

  static async findByAppointmentId(appointmentId) {
    const [rows] = await pool.execute(
      `SELECT * FROM counseling_sessions
       WHERE appointment_id = ? AND status != 'ended'
       ORDER BY id DESC
       LIMIT 1`,
      [Number(appointmentId)]
    );
    return rows[0] || null;
  }

  static async ensureInviteToken(id) {
    const row = await this.findById(id);
    if (!row) return null;
    if (row.guest_invite_token) return row;
    const token = this.generateInviteToken();
    await pool.execute(
      `UPDATE counseling_sessions SET guest_invite_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [token, Number(id)]
    );
    return this.findById(id);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM counseling_sessions WHERE id = ? LIMIT 1`,
      [Number(id)]
    );
    return rows[0] || null;
  }

  static async ensurePublicId(id) {
    const row = await this.findById(id);
    if (!row) return null;
    if (row.public_id) return row;
    const pub = this.generatePublicId();
    await pool.execute(
      `UPDATE counseling_sessions SET public_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [pub, Number(id)]
    );
    return this.findById(id);
  }

  static async listForUser({ userId, agencyId = null, limit = 50 }) {
    const params = [Number(userId), Number(userId)];
    let sql = `
      SELECT * FROM counseling_sessions
      WHERE (provider_user_id = ? OR client_user_id = ?)
    `;
    if (agencyId != null) {
      sql += ` AND agency_id = ?`;
      params.push(Number(agencyId));
    }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(Math.min(Number(limit) || 50, 100));
    const [rows] = await pool.execute(sql, params);
    return rows;
  }

  static async update(id, fields = {}) {
    const allowed = [
      'status',
      'client_user_id',
      'appointment_id',
      'vonage_session_id',
      'vonage_application_id',
      'room_unique_name',
      'title',
      'started_at',
      'ended_at',
      'guest_invite_token',
      'guest_invite_expires_at'
    ];
    const sets = [];
    const params = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        if (key === 'status' && !VALID_STATUSES.has(fields[key])) continue;
        sets.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }
    if (!sets.length) return this.findById(id);
    params.push(Number(id));
    await pool.execute(
      `UPDATE counseling_sessions SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      params
    );
    return this.findById(id);
  }

  static async setVideoRoom(id, { vonageSessionId, roomUniqueName, vonageApplicationId }) {
    return this.update(id, {
      vonage_session_id: vonageSessionId || null,
      room_unique_name: roomUniqueName || null,
      vonage_application_id:
        vonageApplicationId !== undefined ? vonageApplicationId || null : undefined
    });
  }

  static toPublic(row, { includeInviteToken = false } = {}) {
    if (!row) return null;
    const out = {
      id: row.id,
      publicId: row.public_id || null,
      agencyId: row.agency_id,
      providerUserId: row.provider_user_id,
      clientUserId: row.client_user_id,
      appointmentId: row.appointment_id,
      status: row.status,
      vonageSessionId: row.vonage_session_id,
      roomUniqueName: row.room_unique_name,
      title: row.title,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      hasGuestInvite: !!row.guest_invite_token
    };
    if (includeInviteToken) {
      out.guestInviteToken = row.guest_invite_token || null;
      out.guestInviteExpiresAt = row.guest_invite_expires_at || null;
    }
    return out;
  }
}

export { parseJson };
