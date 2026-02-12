import pool from '../config/database.js';

class LearningSubscription {
  static async findActiveForClient({ agencyId, clientId, at = null }) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return null;
    const when = at ? String(at).slice(0, 19).replace('T', ' ') : null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_subscriptions
       WHERE agency_id = ?
         AND client_id = ?
         AND status = 'ACTIVE'
         AND current_period_start <= COALESCE(?, CURRENT_TIMESTAMP)
         AND current_period_end > COALESCE(?, CURRENT_TIMESTAMP)
       ORDER BY id DESC
       LIMIT 1`,
      [aid, cid, when, when]
    );
    return rows?.[0] || null;
  }

  static async listForClient({ agencyId, clientId, limit = 50 }) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return [];
    const lim = Math.min(Math.max(Number(limit || 50), 1), 200);
    const [rows] = await pool.execute(
      `SELECT s.*, p.name AS plan_name, p.plan_type, p.monthly_fee_cents, p.included_individual_tokens, p.included_group_tokens
       FROM learning_subscriptions s
       JOIN learning_subscription_plans p ON p.id = s.plan_id
       WHERE s.agency_id = ?
         AND s.client_id = ?
       ORDER BY s.id DESC
       LIMIT ${lim}`,
      [aid, cid]
    );
    return rows || [];
  }

  static async create({
    agencyId,
    planId,
    clientId,
    guardianUserId = null,
    status = 'ACTIVE',
    currentPeriodStart,
    currentPeriodEnd,
    autoRenew = true,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO learning_subscriptions
         (agency_id, plan_id, client_id, guardian_user_id, status, current_period_start, current_period_end, auto_renew, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        planId,
        clientId,
        guardianUserId,
        String(status || 'ACTIVE').toUpperCase(),
        currentPeriodStart,
        currentPeriodEnd,
        autoRenew ? 1 : 0,
        createdByUserId
      ]
    );
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_subscriptions
       WHERE id = ?
       LIMIT 1`,
      [result.insertId]
    );
    return rows?.[0] || null;
  }

  static async updateStatus({ subscriptionId, status }) {
    const sid = Number(subscriptionId || 0);
    if (!sid) return null;
    await pool.execute(
      `UPDATE learning_subscriptions
       SET status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [String(status || '').toUpperCase(), sid]
    );
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_subscriptions
       WHERE id = ?
       LIMIT 1`,
      [sid]
    );
    return rows?.[0] || null;
  }

  static async findById(subscriptionId) {
    const sid = Number(subscriptionId || 0);
    if (!sid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_subscriptions
       WHERE id = ?
       LIMIT 1`,
      [sid]
    );
    return rows?.[0] || null;
  }

  static async listDueForRenewal({ agencyId = null, nowDateTime = null, limit = 200 }) {
    const values = [];
    const where = [];
    where.push(`s.status = 'ACTIVE'`);
    where.push(`s.auto_renew = TRUE`);
    if (Number(agencyId || 0) > 0) {
      where.push('s.agency_id = ?');
      values.push(Number(agencyId));
    }
    where.push('s.current_period_end <= COALESCE(?, CURRENT_TIMESTAMP)');
    values.push(nowDateTime ? String(nowDateTime).slice(0, 19).replace('T', ' ') : null);
    const lim = Math.min(Math.max(Number(limit || 200), 1), 1000);
    const [rows] = await pool.execute(
      `SELECT s.*, p.included_individual_tokens, p.included_group_tokens
       FROM learning_subscriptions s
       JOIN learning_subscription_plans p ON p.id = s.plan_id
       WHERE ${where.join(' AND ')}
       ORDER BY s.current_period_end ASC
       LIMIT ${lim}`,
      values
    );
    return rows || [];
  }

  static async advancePeriodByDays({ subscriptionId, days = 30 }) {
    const sid = Number(subscriptionId || 0);
    const d = Number(days || 30);
    if (!sid || d <= 0) return null;
    await pool.execute(
      `UPDATE learning_subscriptions
       SET current_period_start = current_period_end,
           current_period_end = DATE_ADD(current_period_end, INTERVAL ? DAY),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [d, sid]
    );
    return await this.findById(sid);
  }
}

export default LearningSubscription;
