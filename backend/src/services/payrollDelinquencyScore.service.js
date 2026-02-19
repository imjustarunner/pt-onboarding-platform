/**
 * Rolling delinquency score for clinical notes.
 * +1 each checkpoint where undone notes exist, -1 when cleared (min 0).
 * Escalate prominence when score >= 2.
 */
import pool from '../config/database.js';

export async function getScore(userId, agencyId) {
  if (!userId || !agencyId) return 0;
  const [rows] = await pool.execute(
    'SELECT score FROM user_payroll_delinquency_scores WHERE user_id = ? AND agency_id = ?',
    [userId, agencyId]
  ).catch(() => [[]]);
  return Math.max(0, Number(rows?.[0]?.score ?? 0));
}

export async function incrementScore(userId, agencyId) {
  if (!userId || !agencyId) return;
  await pool.execute(
    `INSERT INTO user_payroll_delinquency_scores (user_id, agency_id, score)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE score = LEAST(score + 1, 10), updated_at = CURRENT_TIMESTAMP`,
    [userId, agencyId]
  );
}

export async function decrementScore(userId, agencyId) {
  if (!userId || !agencyId) return;
  await pool.execute(
    `UPDATE user_payroll_delinquency_scores
     SET score = GREATEST(0, score - 1), updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND agency_id = ? AND score > 0`,
    [userId, agencyId]
  );
}
