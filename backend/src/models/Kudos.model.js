import pool from '../config/database.js';

class Kudos {
  static MONTHLY_GIVE_KUDOS = 1;
  static MAX_GIVE_KUDOS_ROLLOVER = 2;

  static getCurrentMonthStart() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  static toMonthStartDate(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }

  static monthsBetween(start, end) {
    if (!start || !end) return 0;
    const diff = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
    return Math.max(0, diff);
  }

  static formatMonthStartForSql(value) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  }

  static async refreshGiveBalanceInTransaction(connection, userId, agencyId, { forUpdate = false } = {}) {
    const lockClause = forUpdate ? ' FOR UPDATE' : '';
    const [rows] = await connection.execute(
      `SELECT balance, last_refill_month
       FROM user_kudos_give_balance
       WHERE user_id = ? AND agency_id = ?${lockClause}`,
      [userId, agencyId]
    );

    const currentMonthStart = this.getCurrentMonthStart();
    const currentMonthSql = this.formatMonthStartForSql(currentMonthStart);

    if (!rows?.length) {
      await connection.execute(
        `INSERT INTO user_kudos_give_balance (user_id, agency_id, balance, last_refill_month)
         VALUES (?, ?, ?, ?)`,
        [userId, agencyId, this.MONTHLY_GIVE_KUDOS, currentMonthSql]
      );
      return this.MONTHLY_GIVE_KUDOS;
    }

    const row = rows[0];
    const existingBalance = Math.max(0, Number(row.balance || 0));
    const lastRefillMonth = this.toMonthStartDate(row.last_refill_month);
    const elapsedMonths = this.monthsBetween(lastRefillMonth, currentMonthStart);

    if (elapsedMonths <= 0) {
      return existingBalance;
    }

    const refreshedBalance = Math.min(
      this.MAX_GIVE_KUDOS_ROLLOVER,
      existingBalance + (elapsedMonths * this.MONTHLY_GIVE_KUDOS)
    );

    await connection.execute(
      `UPDATE user_kudos_give_balance
       SET balance = ?, last_refill_month = ?
       WHERE user_id = ? AND agency_id = ?`,
      [refreshedBalance, currentMonthSql, userId, agencyId]
    );

    return refreshedBalance;
  }

  static async getGiveBalance(userId, agencyId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const balance = await this.refreshGiveBalanceInTransaction(connection, userId, agencyId, { forUpdate: true });
      await connection.commit();
      return balance;
    } catch (e) {
      try { await connection.rollback(); } catch {}
      throw e;
    } finally {
      connection.release();
    }
  }

  static async createPeerKudosWithGiveBalance({ fromUserId, toUserId, agencyId, reason }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const giveBalance = await this.refreshGiveBalanceInTransaction(connection, fromUserId, agencyId, { forUpdate: true });

      if (giveBalance <= 0) {
        const err = new Error('No kudos remaining to give this month');
        err.code = 'NO_KUDOS_GIVE_BALANCE';
        err.status = 400;
        throw err;
      }

      await connection.execute(
        `UPDATE user_kudos_give_balance
         SET balance = balance - 1
         WHERE user_id = ? AND agency_id = ?`,
        [fromUserId, agencyId]
      );

      const [ins] = await connection.execute(
        `INSERT INTO kudos (from_user_id, to_user_id, agency_id, reason, source, approval_status, payroll_period_id)
         VALUES (?, ?, ?, ?, 'peer', 'pending', NULL)`,
        [fromUserId, toUserId, agencyId, reason]
      );

      await connection.commit();
      const created = await this.findById(ins.insertId);
      return {
        kudos: created,
        remainingGiveBalance: Math.max(0, giveBalance - 1)
      };
    } catch (e) {
      try { await connection.rollback(); } catch {}
      throw e;
    } finally {
      connection.release();
    }
  }

  /**
   * Create a kudos record.
   * Peer kudos: approval_status=pending, no points until admin approves.
   * Notes-complete: approval_status=approved, points added immediately.
   */
  static async create({ fromUserId, toUserId, agencyId, reason, source = 'peer', payrollPeriodId = null }) {
    const approvalStatus = source === 'notes_complete' ? 'approved' : 'pending';
    const [ins] = await pool.execute(
      `INSERT INTO kudos (from_user_id, to_user_id, agency_id, reason, source, approval_status, payroll_period_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fromUserId, toUserId, agencyId, reason, source, approvalStatus, payrollPeriodId]
    );
    const kudosId = ins.insertId;

    if (approvalStatus === 'approved') {
      await this.incrementPoints(toUserId, agencyId, 1);
    }
    return this.findById(kudosId);
  }

  /**
   * Approve a pending peer kudos; adds 1 point to recipient
   */
  static async approve(id) {
    const [rows] = await pool.execute(
      `UPDATE kudos SET approval_status = 'approved'
       WHERE id = ? AND approval_status = 'pending' AND source = 'peer'`,
      [id]
    );
    if (rows.affectedRows === 0) return null;
    const k = await this.findById(id);
    if (k) await this.incrementPoints(k.to_user_id, k.agency_id, 1);
    return k;
  }

  /**
   * Reject a pending peer kudos
   */
  static async reject(id) {
    const [rows] = await pool.execute(
      `UPDATE kudos SET approval_status = 'rejected'
       WHERE id = ? AND approval_status = 'pending' AND source = 'peer'`,
      [id]
    );
    return rows.affectedRows > 0 ? this.findById(id) : null;
  }

  /**
   * List pending peer kudos for admin approval (agency-scoped)
   */
  static async listPending(agencyId, { limit = 50, offset = 0 } = {}) {
    const lim = Math.max(0, Math.min(100, Number(limit) || 50));
    const off = Math.max(0, Number(offset) || 0);
    const [rows] = await pool.execute(
      `SELECT k.*,
              f.first_name AS from_first_name,
              f.last_name AS from_last_name,
              f.preferred_name AS from_preferred_name,
              f.profile_photo_path AS from_profile_photo_path,
              t.first_name AS to_first_name,
              t.last_name AS to_last_name,
              t.preferred_name AS to_preferred_name
       FROM kudos k
       LEFT JOIN users f ON k.from_user_id = f.id
       LEFT JOIN users t ON k.to_user_id = t.id
       WHERE k.agency_id = ? AND k.approval_status = 'pending' AND k.source = 'peer'
       ORDER BY k.created_at ASC
       LIMIT ${lim} OFFSET ${off}`,
      [agencyId]
    );
    return rows || [];
  }

  /**
   * Count pending peer kudos for admin
   */
  static async countPending(agencyId) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM kudos
       WHERE agency_id = ? AND approval_status = 'pending' AND source = 'peer'`,
      [agencyId]
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  /**
   * Increment (or init) user_kudos_points for a user in an agency
   */
  static async incrementPoints(userId, agencyId, amount = 1) {
    await pool.execute(
      `INSERT INTO user_kudos_points (user_id, agency_id, points)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE points = points + ?`,
      [userId, agencyId, amount, amount]
    );
  }

  /**
   * Find kudos by ID with sender/recipient info
   */
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT k.*,
              f.first_name AS from_first_name,
              f.last_name AS from_last_name,
              f.preferred_name AS from_preferred_name,
              t.first_name AS to_first_name,
              t.last_name AS to_last_name
       FROM kudos k
       LEFT JOIN users f ON k.from_user_id = f.id
       LEFT JOIN users t ON k.to_user_id = t.id
       WHERE k.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * List kudos received by a user in an agency (paginated)
   */
  static async listReceivedByUser(userId, agencyId, { limit = 20, offset = 0 } = {}) {
    const lim = Math.max(0, Math.min(100, Number(limit) || 20));
    const off = Math.max(0, Number(offset) || 0);
    const [rows] = await pool.execute(
      `SELECT k.*,
              f.first_name AS from_first_name,
              f.last_name AS from_last_name,
              f.preferred_name AS from_preferred_name,
              f.profile_photo_path AS from_profile_photo_path
       FROM kudos k
       LEFT JOIN users f ON k.from_user_id = f.id
       WHERE k.to_user_id = ? AND k.agency_id = ?
       ORDER BY k.created_at DESC
       LIMIT ${lim} OFFSET ${off}`,
      [userId, agencyId]
    );
    return rows || [];
  }

  /**
   * Get total received count for pagination
   */
  static async countReceivedByUser(userId, agencyId) {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM kudos WHERE to_user_id = ? AND agency_id = ?',
      [userId, agencyId]
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  /**
   * Get user's points in an agency
   */
  static async getPoints(userId, agencyId) {
    const [rows] = await pool.execute(
      'SELECT points FROM user_kudos_points WHERE user_id = ? AND agency_id = ?',
      [userId, agencyId]
    );
    return Number(rows[0]?.points ?? 0);
  }

  /**
   * Check if notes-complete was already awarded for this user/agency/period
   */
  static async hasNotesCompletionAward(userId, agencyId, payrollPeriodId) {
    const [rows] = await pool.execute(
      'SELECT 1 FROM kudos_notes_completion WHERE user_id = ? AND agency_id = ? AND payroll_period_id = ? LIMIT 1',
      [userId, agencyId, payrollPeriodId]
    );
    return rows.length > 0;
  }

  /**
   * Record notes completion award (idempotency). Returns true if inserted, false if duplicate.
   */
  static async recordNotesCompletionAward(userId, agencyId, payrollPeriodId) {
    try {
      const [res] = await pool.execute(
        'INSERT INTO kudos_notes_completion (user_id, agency_id, payroll_period_id) VALUES (?, ?, ?)',
        [userId, agencyId, payrollPeriodId]
      );
      return res.affectedRows > 0;
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062) return false;
      throw e;
    }
  }

  /**
   * Leaderboard: top recipients in agency by points
   */
  static async getLeaderboard(agencyId, { limit = 10 } = {}) {
    const lim = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));
    const [rows] = await pool.execute(
      `SELECT ukp.user_id, ukp.points,
              u.first_name, u.last_name, u.preferred_name, u.profile_photo_path
       FROM user_kudos_points ukp
       JOIN users u ON ukp.user_id = u.id
       WHERE ukp.agency_id = ? AND ukp.points > 0
       ORDER BY ukp.points DESC
       LIMIT ${lim}`,
      [agencyId]
    );
    return rows || [];
  }

  /**
   * List reward tiers for an agency (ordered by points_threshold ASC)
   */
  static async listRewardTiers(agencyId) {
    const [rows] = await pool.execute(
      `SELECT id, agency_id, tier_name, points_threshold, reward_description, sort_order, created_at, updated_at
       FROM kudos_reward_tiers
       WHERE agency_id = ?
       ORDER BY sort_order ASC, points_threshold ASC`,
      [agencyId]
    );
    return rows || [];
  }

  /**
   * Create a reward tier
   */
  static async createRewardTier({ agencyId, tierName, pointsThreshold, rewardDescription = null, sortOrder = 0 }) {
    const [ins] = await pool.execute(
      `INSERT INTO kudos_reward_tiers (agency_id, tier_name, points_threshold, reward_description, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [agencyId, tierName, pointsThreshold, rewardDescription, sortOrder]
    );
    return this.findRewardTierById(ins.insertId);
  }

  /**
   * Find reward tier by ID
   */
  static async findRewardTierById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM kudos_reward_tiers WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Update a reward tier
   */
  static async updateRewardTier(id, { tierName, pointsThreshold, rewardDescription, sortOrder }) {
    const updates = [];
    const params = [];
    if (tierName !== undefined) {
      updates.push('tier_name = ?');
      params.push(tierName);
    }
    if (pointsThreshold !== undefined) {
      updates.push('points_threshold = ?');
      params.push(pointsThreshold);
    }
    if (rewardDescription !== undefined) {
      updates.push('reward_description = ?');
      params.push(rewardDescription);
    }
    if (sortOrder !== undefined) {
      updates.push('sort_order = ?');
      params.push(sortOrder);
    }
    if (updates.length === 0) return this.findRewardTierById(id);
    params.push(id);
    await pool.execute(
      `UPDATE kudos_reward_tiers SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    return this.findRewardTierById(id);
  }

  /**
   * Delete a reward tier
   */
  static async deleteRewardTier(id) {
    await pool.execute('DELETE FROM kudos_reward_tiers WHERE id = ?', [id]);
    return true;
  }

  /**
   * Get user's tier progress: earned tiers, next tier, points to next
   */
  static async getTierProgress(userId, agencyId) {
    const points = await this.getPoints(userId, agencyId);
    const tiers = await this.listRewardTiers(agencyId);
    const earned = (tiers || []).filter((t) => Number(t.points_threshold || 0) <= points);
    const nextTier = (tiers || []).find((t) => Number(t.points_threshold || 0) > points);
    const pointsToNext = nextTier
      ? Math.max(0, Number(nextTier.points_threshold || 0) - points)
      : null;

    const currentTier = earned.length ? earned[earned.length - 1] : null;
    return {
      points,
      earnedTiers: earned.map((t) => ({
        id: t.id,
        tierName: t.tier_name,
        pointsThreshold: t.points_threshold,
        rewardDescription: t.reward_description
      })),
      currentTier: currentTier
        ? {
            id: currentTier.id,
            tierName: currentTier.tier_name,
            pointsThreshold: currentTier.points_threshold,
            rewardDescription: currentTier.reward_description
          }
        : null,
      nextTier: nextTier
        ? {
            id: nextTier.id,
            tierName: nextTier.tier_name,
            pointsThreshold: nextTier.points_threshold,
            rewardDescription: nextTier.reward_description,
            pointsToNext
          }
        : null,
      pointsToNextTier: pointsToNext
    };
  }
}

export default Kudos;
