import pool from '../config/database.js';

class LearningSubscriptionPlan {
  static async listByAgency({ agencyId, activeOnly = true }) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const where = activeOnly ? 'AND is_active = TRUE' : '';
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_subscription_plans
       WHERE agency_id = ?
       ${where}
       ORDER BY is_active DESC, name ASC, id DESC`,
      [aid]
    );
    return rows || [];
  }

  static async create({
    agencyId,
    name,
    planType = 'INDIVIDUAL',
    monthlyFeeCents = 0,
    includedIndividualTokens = 0,
    includedGroupTokens = 0,
    cancellationLimitPerMonth = 2,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO learning_subscription_plans
         (agency_id, name, plan_type, monthly_fee_cents, included_individual_tokens, included_group_tokens,
          cancellation_limit_per_month, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        String(name || '').trim(),
        String(planType || 'INDIVIDUAL').toUpperCase(),
        Number(monthlyFeeCents || 0),
        Number(includedIndividualTokens || 0),
        Number(includedGroupTokens || 0),
        Number(cancellationLimitPerMonth || 2),
        createdByUserId
      ]
    );
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_subscription_plans
       WHERE id = ?
       LIMIT 1`,
      [result.insertId]
    );
    return rows?.[0] || null;
  }
}

export default LearningSubscriptionPlan;
