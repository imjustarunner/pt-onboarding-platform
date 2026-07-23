import pool from '../config/database.js';

const STATUS_ENUM = [
  'in_available',
  'in_heads_down',
  'in_available_for_phone',
  'out_quick',
  'out_am',
  'out_pm',
  'out_full_day',
  'traveling_offsite'
];

/** Quick reasons for privileged away/status flow (chat + Timedown). */
const REASON_ENUM = [
  'meal',
  'fitness',
  'family',
  'personal',
  'call',
  'text',
  'call_text',
  'out_day',
  'available_offline',
  'custom'
];

const REASON_LABELS = {
  meal: 'Out for Meal',
  fitness: 'Out for Fitness',
  family: 'Out for Family',
  personal: 'Out for Personal',
  call: 'Available for Call',
  text: 'Available for Text',
  call_text: 'Available for Call & Text',
  out_day: 'Out for the Day',
  available_offline: 'Available · Logged out',
  custom: 'Away'
};

const MAX_SESSION_EXTEND_MS = 2 * 60 * 60 * 1000; // 2 hours

function toMysqlDatetime(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export default class UserPresenceStatus {
  static STATUS_ENUM = STATUS_ENUM;
  static REASON_ENUM = REASON_ENUM;
  static REASON_LABELS = REASON_LABELS;
  static MAX_SESSION_EXTEND_MS = MAX_SESSION_EXTEND_MS;

  static isValidStatus(status) {
    return STATUS_ENUM.includes(String(status || '').trim());
  }

  static isValidReason(reason) {
    return REASON_ENUM.includes(String(reason || '').trim());
  }

  static labelForReason(reason, fallback = null) {
    const key = String(reason || '').trim();
    return REASON_LABELS[key] || fallback || null;
  }

  static isAwayStatus(status) {
    const s = String(status || '').trim();
    return s.startsWith('out_') || s === 'traveling_offsite';
  }

  static isPrivilegedRole(role) {
    const r = String(role || '').toLowerCase();
    return r === 'admin' || r === 'super_admin' || r === 'support' || r === 'clinical_practice_assistant';
  }

  /**
   * Map a quick reason + optional duration to Team Board status enum.
   */
  static statusForReason(reason, durationMinutes = null) {
    const r = String(reason || '').trim();
    if (r === 'out_day') return 'out_full_day';
    if (r === 'available_offline') return 'in_available';
    if (r === 'call' || r === 'text' || r === 'call_text') return 'in_available_for_phone';
    if (durationMinutes != null && Number(durationMinutes) > 0) return 'out_quick';
    return 'out_quick';
  }

  /** Reachable facet stored on note when away (call / text / call_text). */
  static isReachableNote(note) {
    return ['call', 'text', 'call_text'].includes(String(note || '').trim());
  }

  static async findByUserId(userId) {
    const id = parseInt(userId, 10);
    if (!id) return null;
    const [rows] = await pool.execute(
      'SELECT * FROM user_presence_status WHERE user_id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  }

  static async upsertForUser(userId, data) {
    const id = parseInt(userId, 10);
    if (!id) return null;
    const {
      status,
      note,
      started_at,
      ends_at,
      expected_return_at,
      reason = null,
      display_label = null,
      session_extend_until = null
    } = data;
    if (!status || !this.isValidStatus(status)) return null;

    const startedAt = started_at ? new Date(started_at) : new Date();
    const endsAt = ends_at ? new Date(ends_at) : null;
    const expectedReturnAt = expected_return_at ? new Date(expected_return_at) : null;
    const extendUntil = session_extend_until ? new Date(session_extend_until) : null;
    const reasonVal = reason && this.isValidReason(reason) ? reason : reason || null;
    const label =
      display_label ||
      (reasonVal ? this.labelForReason(reasonVal) : null) ||
      null;

    await pool.execute(
      `INSERT INTO user_presence_status
        (user_id, status, note, started_at, ends_at, expected_return_at, reason, display_label, session_extend_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         note = VALUES(note),
         started_at = VALUES(started_at),
         ends_at = VALUES(ends_at),
         expected_return_at = VALUES(expected_return_at),
         reason = VALUES(reason),
         display_label = VALUES(display_label),
         session_extend_until = VALUES(session_extend_until)`,
      [
        id,
        status,
        note || null,
        toMysqlDatetime(startedAt),
        toMysqlDatetime(endsAt),
        toMysqlDatetime(expectedReturnAt),
        reasonVal,
        label,
        toMysqlDatetime(extendUntil)
      ]
    );
    return this.findByUserId(id);
  }

  /** Clear away status → In – Available (I'm back). */
  static async clearForUser(userId) {
    return this.upsertForUser(userId, {
      status: 'in_available',
      note: null,
      expected_return_at: null,
      ends_at: null,
      reason: null,
      display_label: 'Active',
      session_extend_until: null,
      started_at: new Date()
    });
  }

  /**
   * Earliest "back by" / end timestamp for a timed Away row (null = no timer).
   * Prefers expected_return_at, then ends_at, then session_extend_until.
   */
  static getTimedAwayExpiryMs(row) {
    if (!row) return null;
    const candidates = [
      row.presence_expected_return_at ?? row.expected_return_at,
      row.presence_ends_at ?? row.ends_at,
      row.presence_session_extend_until ?? row.session_extend_until
    ];
    for (const raw of candidates) {
      if (!raw) continue;
      const ms = new Date(raw).getTime();
      if (Number.isFinite(ms)) return ms;
    }
    return null;
  }

  /**
   * Timed Away (Out – Quick / meal / personal with a return time) whose timer has passed.
   * Day-level outs without an end/return time are left alone (manual clear / Planned Outs).
   */
  static isTimedAwayExpired(row, now = Date.now()) {
    if (!row) return false;
    const status = String(row.presence_status || row.rich_status || row.status || '').trim();
    if (!this.isAwayStatus(status)) return false;
    const expiryMs = this.getTimedAwayExpiryMs(row);
    if (expiryMs == null) return false;
    return expiryMs <= now;
  }

  /** Persist clear for one user when their timed Away return/end time has passed. */
  static async clearIfTimedAwayExpired(userId) {
    const id = parseInt(userId, 10);
    if (!id) return null;
    const row = await this.findByUserId(id);
    if (!this.isTimedAwayExpired(row)) return row;
    return this.clearForUser(id);
  }

  /**
   * Bulk-clear timed Away rows whose return/end/extend time is in the past.
   * Keeps day-level outs that have no timer timestamps.
   */
  static async clearExpiredTimedAwayStatuses() {
    try {
      const [result] = await pool.execute(
        `UPDATE user_presence_status
         SET status = 'in_available',
             note = NULL,
             expected_return_at = NULL,
             ends_at = NULL,
             reason = NULL,
             display_label = 'Active',
             session_extend_until = NULL,
             started_at = NOW()
         WHERE status IN ('out_quick', 'out_am', 'out_pm', 'out_full_day', 'traveling_offsite')
           AND (
             (expected_return_at IS NOT NULL AND expected_return_at < NOW())
             OR (ends_at IS NOT NULL AND ends_at < NOW())
             OR (
               session_extend_until IS NOT NULL
               AND session_extend_until < NOW()
               AND expected_return_at IS NULL
               AND ends_at IS NULL
               AND status = 'out_quick'
             )
           )`
      );
      return result?.affectedRows || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Fetch all users with staff-like roles and their presence status.
   * Used for SuperAdmin Team Board.
   */
  static async findAllWithUsers() {
    const STAFF_ROLES = ['staff', 'admin', 'super_admin', 'support'];

    let profilePhotoField = '';
    let preferredNameField = '';
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('profile_photo_path', 'preferred_name')",
        [dbName]
      );
      const names = (cols || []).map((c) => c.COLUMN_NAME);
      if (names.includes('profile_photo_path')) profilePhotoField = ', u.profile_photo_path';
      if (names.includes('preferred_name')) preferredNameField = ', u.preferred_name';
    } catch {
      /* best-effort */
    }

    const placeholders = STAFF_ROLES.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT u.id,
              u.first_name,
              u.last_name,
              u.email,
              u.role${profilePhotoField}${preferredNameField},
              up.last_heartbeat_at,
              up.last_activity_at,
              up.availability_level,
              ps.status AS presence_status,
              ps.note AS presence_note,
              ps.started_at AS presence_started_at,
              ps.ends_at AS presence_ends_at,
              ps.expected_return_at AS presence_expected_return_at,
              ps.reason AS presence_reason,
              ps.display_label AS presence_display_label,
              ps.session_extend_until AS presence_session_extend_until,
              (SELECT GROUP_CONCAT(agency_id ORDER BY agency_id SEPARATOR ',') FROM user_agencies WHERE user_id = u.id) AS agency_ids
       FROM users u
       LEFT JOIN user_presence up ON up.user_id = u.id
       LEFT JOIN user_presence_status ps ON ps.user_id = u.id
       WHERE u.role IN (${placeholders})
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       ORDER BY u.first_name ASC, u.last_name ASC`,
      STAFF_ROLES
    );
    return rows || [];
  }

  static async findAllWithUsersForAgency(agencyId) {
    const all = await this.findAllWithUsers();
    const aid = parseInt(agencyId, 10);
    if (!aid) return all;
    return all.filter((r) => {
      const ids = (r.agency_ids || '')
        .split(',')
        .map((x) => parseInt(x, 10))
        .filter((x) => !isNaN(x));
      return ids.includes(aid);
    });
  }
}
