import pool from '../config/database.js';

/** Store wall-clock UTC (pool timezone is +00:00). */
function toMysqlDateTime(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`;
}

/** Normalize MySQL DATETIME / Date to an unambiguous UTC ISO string. */
function toIsoUtc(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString();
  }
  const s = String(value).trim();
  if (!s) return null;
  if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  // Naive DATETIME from a UTC-configured pool — treat as UTC.
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(`${normalized}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

class PayrollIndirectTimeSession {
  static _normalize(row) {
    if (!row) return null;
    return {
      id: Number(row.id),
      agencyId: Number(row.agency_id),
      userId: Number(row.user_id),
      status: String(row.status || 'open'),
      clockedInAt: toIsoUtc(row.clocked_in_at),
      breakStartedAt: toIsoUtc(row.break_started_at),
      breakSecondsTotal: Number(row.break_seconds_total || 0),
      clockedOutAt: toIsoUtc(row.clocked_out_at),
      clockedOutAtOriginal: toIsoUtc(row.clocked_out_at_original),
      createdAt: toIsoUtc(row.created_at) || row.created_at || null,
      updatedAt: toIsoUtc(row.updated_at) || row.updated_at || null
    };
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM payroll_indirect_time_sessions WHERE id = ? LIMIT 1',
      [Number(id)]
    );
    return this._normalize(rows?.[0] || null);
  }

  static async findOpenForUser({ agencyId, userId }) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_indirect_time_sessions
       WHERE agency_id = ? AND user_id = ? AND status IN ('open', 'on_break')
       ORDER BY id DESC
       LIMIT 1`,
      [Number(agencyId), Number(userId)]
    );
    const session = this._normalize(rows?.[0] || null);
    return this.healLegacyLocalClock(session);
  }

  /**
   * Early sessions stored Node local wall-time into a UTC pool, shifting display/elapsed
   * by the local UTC offset (often ~6h for Mountain). Heal open sessions once.
   */
  static async healLegacyLocalClock(session) {
    if (!session?.id || !session.clockedInAt || !session.createdAt) return session;
    if (!(session.status === 'open' || session.status === 'on_break')) return session;
    const cin = new Date(session.clockedInAt).getTime();
    const created = new Date(session.createdAt).getTime();
    if (!Number.isFinite(cin) || !Number.isFinite(created)) return session;
    const deltaMs = created - cin;
    const hourMs = 60 * 60 * 1000;
    if (deltaMs < 3.5 * hourMs || deltaMs > 11 * hourMs) return session;
    const nearestHour = Math.round(deltaMs / hourMs) * hourMs;
    if (Math.abs(deltaMs - nearestHour) > 5 * 60 * 1000) return session;

    const fixedIn = new Date(cin + nearestHour);
    let fixedBreak = null;
    if (session.breakStartedAt) {
      const bs = new Date(session.breakStartedAt).getTime();
      if (Number.isFinite(bs)) fixedBreak = new Date(bs + nearestHour);
    }
    await pool.execute(
      `UPDATE payroll_indirect_time_sessions
       SET clocked_in_at = ?, break_started_at = COALESCE(?, break_started_at)
       WHERE id = ? AND status IN ('open', 'on_break')
       LIMIT 1`,
      [toMysqlDateTime(fixedIn), fixedBreak ? toMysqlDateTime(fixedBreak) : null, session.id]
    );
    return this.findById(session.id);
  }

  static async clockIn({ agencyId, userId, at = new Date() }) {
    const existing = await this.findOpenForUser({ agencyId, userId });
    if (existing) return existing;
    const [result] = await pool.execute(
      `INSERT INTO payroll_indirect_time_sessions
       (agency_id, user_id, status, clocked_in_at, break_seconds_total)
       VALUES (?, ?, 'open', ?, 0)`,
      [Number(agencyId), Number(userId), toMysqlDateTime(at)]
    );
    return this.findById(result.insertId);
  }

  static async startBreak(id, at = new Date()) {
    const session = await this.findById(id);
    if (!session || session.status !== 'open') return session;
    await pool.execute(
      `UPDATE payroll_indirect_time_sessions
       SET status = 'on_break', break_started_at = ?
       WHERE id = ? LIMIT 1`,
      [toMysqlDateTime(at), Number(id)]
    );
    return this.findById(id);
  }

  static async endBreak(id, at = new Date()) {
    const session = await this.findById(id);
    if (!session || session.status !== 'on_break' || !session.breakStartedAt) return session;
    const started = new Date(session.breakStartedAt).getTime();
    const ended = (at instanceof Date ? at : new Date(at)).getTime();
    const add = Number.isFinite(started) && Number.isFinite(ended) && ended > started
      ? Math.floor((ended - started) / 1000)
      : 0;
    await pool.execute(
      `UPDATE payroll_indirect_time_sessions
       SET status = 'open',
           break_started_at = NULL,
           break_seconds_total = break_seconds_total + ?
       WHERE id = ? LIMIT 1`,
      [add, Number(id)]
    );
    return this.findById(id);
  }

  static async clockOut(id, at = new Date()) {
    let session = await this.findById(id);
    if (!session) return null;
    if (session.status === 'on_break') {
      session = await this.endBreak(id, at);
    }
    if (!session || session.status === 'closed') return session;
    const outAt = toMysqlDateTime(at);
    await pool.execute(
      `UPDATE payroll_indirect_time_sessions
       SET status = 'closed',
           clocked_out_at = ?,
           clocked_out_at_original = COALESCE(clocked_out_at_original, ?),
           break_started_at = NULL
       WHERE id = ? LIMIT 1`,
      [outAt, outAt, Number(id)]
    );
    return this.findById(id);
  }

  /**
   * Allow correcting a closed session's clock-out to an earlier time
   * (not before clock-in, not after the original clock-out).
   */
  static async adjustClockOutEarlier(id, { userId, agencyId, clockedOutAt }) {
    const session = await this.findById(id);
    if (!session) return null;
    if (Number(session.userId) !== Number(userId) || Number(session.agencyId) !== Number(agencyId)) {
      return null;
    }
    if (session.status !== 'closed' || !session.clockedOutAt || !session.clockedInAt) {
      const err = new Error('Session is not eligible for clock-out adjustment');
      err.status = 400;
      throw err;
    }
    const inMs = new Date(session.clockedInAt).getTime();
    const maxOutMs = new Date(
      session.clockedOutAtOriginal || session.clockedOutAt
    ).getTime();
    const nextOutMs = new Date(clockedOutAt).getTime();
    if (!Number.isFinite(nextOutMs)) {
      const err = new Error('Invalid clock-out time');
      err.status = 400;
      throw err;
    }
    if (nextOutMs < inMs + 60_000) {
      const err = new Error('Clock-out must be at least one minute after clock-in');
      err.status = 400;
      throw err;
    }
    if (nextOutMs > maxOutMs) {
      const err = new Error('Clock-out can only be moved earlier than the original clock-out');
      err.status = 400;
      throw err;
    }
    const currentOutMs = new Date(session.clockedOutAt).getTime();
    if (nextOutMs === currentOutMs) return session;
    await pool.execute(
      `UPDATE payroll_indirect_time_sessions
       SET clocked_out_at = ?,
           clocked_out_at_original = COALESCE(clocked_out_at_original, clocked_out_at)
       WHERE id = ? AND status = 'closed' AND user_id = ?
       LIMIT 1`,
      [toMysqlDateTime(new Date(nextOutMs)), Number(id), Number(userId)]
    );
    return this.findById(id);
  }

  /** Elapsed work seconds excluding breaks (includes active break not yet closed). */
  static workedSeconds(session, now = new Date()) {
    if (!session?.clockedInAt) return 0;
    const start = new Date(session.clockedInAt).getTime();
    const end = session.clockedOutAt
      ? new Date(session.clockedOutAt).getTime()
      : (now instanceof Date ? now : new Date(now)).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    let breakSecs = Number(session.breakSecondsTotal || 0);
    if (session.status === 'on_break' && session.breakStartedAt) {
      const bs = new Date(session.breakStartedAt).getTime();
      if (Number.isFinite(bs) && end > bs) breakSecs += Math.floor((end - bs) / 1000);
    }
    return Math.max(0, Math.floor((end - start) / 1000) - breakSecs);
  }
}

export default PayrollIndirectTimeSession;
