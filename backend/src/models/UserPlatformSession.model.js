import pool from '../config/database.js';

/**
 * Immutable-ish platform session ledger.
 * Clients may heartbeat while open; once ended_at is set, rows are frozen.
 */
export default class UserPlatformSession {
  static async startSession({
    sessionId,
    userId,
    agencyId = null,
    ipAddress = null,
    userAgent = null,
    startedAt = null
  }) {
    if (!sessionId || !userId) return null;
    const started = startedAt ? new Date(startedAt) : new Date();
    try {
      await pool.execute(
        `INSERT INTO user_platform_sessions
          (session_id, user_id, agency_id, started_at, ip_address, user_agent, phase, last_heartbeat_at, last_meaningful_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
         ON DUPLICATE KEY UPDATE
           user_id = VALUES(user_id),
           agency_id = COALESCE(VALUES(agency_id), agency_id),
           updated_at = CURRENT_TIMESTAMP(3)`,
        [
          String(sessionId),
          Number(userId),
          agencyId != null ? Number(agencyId) : null,
          started,
          ipAddress ? String(ipAddress).slice(0, 64) : null,
          userAgent ? String(userAgent).slice(0, 512) : null,
          started,
          started
        ]
      );
      return this.findBySessionId(sessionId);
    } catch (err) {
      console.error('[UserPlatformSession.startSession]', err.message);
      return null;
    }
  }

  static async findBySessionId(sessionId) {
    if (!sessionId) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM user_platform_sessions WHERE session_id = ? LIMIT 1`,
      [String(sessionId)]
    );
    return rows?.[0] || null;
  }

  /**
   * Apply a heartbeat tick. Server accrues time from last_heartbeat_at → now,
   * capped so clients cannot claim more than wall-clock elapsed.
   */
  static async heartbeat({
    sessionId,
    meaningful = false,
    passive = false,
    phase = null, // 'active' | 'timedown'
    agencyId = null
  }) {
    const row = await this.findBySessionId(sessionId);
    if (!row || row.ended_at || row.phase === 'ended') return row;

    const now = new Date();
    const lastHb = row.last_heartbeat_at ? new Date(row.last_heartbeat_at) : new Date(row.started_at);
    let deltaSec = Math.max(0, Math.floor((now - lastHb) / 1000));
    // Cap single tick (tab sleep / clock skew / cheating) at 2 minutes
    deltaSec = Math.min(deltaSec, 120);

    const currentPhase = phase || row.phase || 'active';
    let active = Number(row.active_seconds || 0);
    let inactive = Number(row.inactive_seconds || 0);
    let billable = Number(row.billable_active_seconds || 0);
    let meaningfulCount = Number(row.meaningful_event_count || 0);
    let passiveCount = Number(row.passive_event_count || 0);
    let timedownCount = Number(row.timedown_count || 0);

    if (currentPhase === 'timedown') {
      inactive += deltaSec;
    } else {
      active += deltaSec;
      const lastMeaningful = row.last_meaningful_at ? new Date(row.last_meaningful_at) : null;
      const meaningfulRecently =
        meaningful ||
        (lastMeaningful && now - lastMeaningful <= 90 * 1000);
      if (meaningful) meaningfulCount += 1;
      else if (passive) passiveCount += 1;

      // Billable: meaningful activity within the last 90s while tab is active.
      // Mousemove-only keep-alive does not refresh last_meaningful_at, so it won't pay.
      if (meaningfulRecently) {
        billable += deltaSec;
      }
    }

    // Entering timedown increments count once
    if (currentPhase === 'timedown' && row.phase !== 'timedown') {
      timedownCount += 1;
    }

    const { suspicionScore, suspicionFlags } = this.computeSuspicion({
      active,
      inactive,
      billable,
      meaningfulCount,
      passiveCount,
      timedownCount,
      startedAt: row.started_at,
      now
    });

    await pool.execute(
      `UPDATE user_platform_sessions SET
         active_seconds = ?,
         inactive_seconds = ?,
         billable_active_seconds = ?,
         meaningful_event_count = ?,
         passive_event_count = ?,
         timedown_count = ?,
         suspicion_score = ?,
         suspicion_flags = ?,
         phase = ?,
         agency_id = COALESCE(?, agency_id),
         last_heartbeat_at = ?,
         last_meaningful_at = CASE WHEN ? THEN ? ELSE last_meaningful_at END,
         updated_at = CURRENT_TIMESTAMP(3)
       WHERE session_id = ? AND ended_at IS NULL`,
      [
        active,
        inactive,
        billable,
        meaningfulCount,
        passiveCount,
        timedownCount,
        suspicionScore,
        JSON.stringify(suspicionFlags),
        currentPhase === 'timedown' ? 'timedown' : 'active',
        agencyId != null ? Number(agencyId) : null,
        now,
        meaningful ? 1 : 0,
        now,
        String(sessionId)
      ]
    );

    return this.findBySessionId(sessionId);
  }

  static computeSuspicion({
    active,
    inactive,
    billable,
    meaningfulCount,
    passiveCount,
    timedownCount,
    startedAt,
    now
  }) {
    const flags = [];
    let score = 0;
    const elapsed = Math.max(1, Math.floor((new Date(now) - new Date(startedAt)) / 1000));
    const totalTracked = active + inactive;

    // Claimed more time than wall clock (should be impossible after caps, but flag)
    if (totalTracked > elapsed + 30) {
      flags.push('over_elapsed');
      score += 40;
    }

    // Almost no meaningful interaction vs lots of passive mouse noise
    const eventTotal = meaningfulCount + passiveCount;
    if (eventTotal >= 20 && meaningfulCount / eventTotal < 0.05) {
      flags.push('mousemove_only');
      score += 35;
    }

    // Long active wall time with near-zero billable (tab left open)
    if (active >= 600 && billable < active * 0.1) {
      flags.push('low_engagement');
      score += 25;
    }

    // Many timedown dismissals in one session (keep-alive spam)
    if (timedownCount >= 5) {
      flags.push('timedown_spam');
      score += 20;
    }

    // Billable nearly equals full elapsed with almost no inactivity — possible bot keep-alive
    if (elapsed >= 1800 && billable >= elapsed * 0.95 && inactive < 30 && meaningfulCount < 10) {
      flags.push('suspiciously_continuous');
      score += 30;
    }

    return {
      suspicionScore: Math.min(100, score),
      suspicionFlags: flags
    };
  }

  static async endSession({
    sessionId,
    reason = 'logout',
    finalPhase = null
  }) {
    const row = await this.findBySessionId(sessionId);
    if (!row) return null;
    if (row.ended_at) return row;

    // Final accrual tick
    await this.heartbeat({
      sessionId,
      meaningful: false,
      phase: finalPhase || (row.phase === 'timedown' ? 'timedown' : 'active')
    });

    const fresh = await this.findBySessionId(sessionId);
    const now = new Date();
    const started = new Date(fresh.started_at);
    const wall = Math.max(0, Math.floor((now - started) / 1000));
    // Clamp totals so active+inactive never exceeds wall clock
    let active = Number(fresh.active_seconds || 0);
    let inactive = Number(fresh.inactive_seconds || 0);
    if (active + inactive > wall) {
      const scale = wall / (active + inactive);
      active = Math.floor(active * scale);
      inactive = Math.max(0, wall - active);
    }
    let billable = Math.min(Number(fresh.billable_active_seconds || 0), active);

    const { suspicionScore, suspicionFlags } = this.computeSuspicion({
      active,
      inactive,
      billable,
      meaningfulCount: Number(fresh.meaningful_event_count || 0),
      passiveCount: Number(fresh.passive_event_count || 0),
      timedownCount: Number(fresh.timedown_count || 0),
      startedAt: fresh.started_at,
      now
    });

    await pool.execute(
      `UPDATE user_platform_sessions SET
         ended_at = ?,
         end_reason = ?,
         phase = 'ended',
         active_seconds = ?,
         inactive_seconds = ?,
         billable_active_seconds = ?,
         suspicion_score = ?,
         suspicion_flags = ?,
         updated_at = CURRENT_TIMESTAMP(3)
       WHERE session_id = ? AND ended_at IS NULL`,
      [
        now,
        String(reason || 'logout').slice(0, 32),
        active,
        inactive,
        billable,
        suspicionScore,
        JSON.stringify(suspicionFlags),
        String(sessionId)
      ]
    );

    return this.findBySessionId(sessionId);
  }

  static async listForAgency({
    agencyId,
    userId = null,
    startDate = null,
    endDate = null,
    limit = 50,
    offset = 0,
    minSuspicion = null
  }) {
    const where = ['ups.agency_id = ?'];
    const params = [Number(agencyId)];

    if (userId) {
      where.push('ups.user_id = ?');
      params.push(Number(userId));
    }
    if (startDate) {
      where.push('ups.started_at >= ?');
      params.push(startDate);
    }
    if (endDate) {
      where.push('ups.started_at < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(endDate);
    }
    if (minSuspicion != null && Number.isFinite(Number(minSuspicion))) {
      where.push('ups.suspicion_score >= ?');
      params.push(Number(minSuspicion));
    }

    const lim = Math.min(200, Math.max(1, Number(limit) || 50));
    const off = Math.max(0, Number(offset) || 0);

    const [rows] = await pool.execute(
      `SELECT
         ups.*,
         u.email AS user_email,
         u.username AS user_username,
         TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS user_name
       FROM user_platform_sessions ups
       LEFT JOIN users u ON u.id = ups.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY ups.started_at DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM user_platform_sessions ups
       WHERE ${where.join(' AND ')}`,
      params
    );

    return {
      rows: rows || [],
      total: Number(countRows?.[0]?.total || 0)
    };
  }
}
