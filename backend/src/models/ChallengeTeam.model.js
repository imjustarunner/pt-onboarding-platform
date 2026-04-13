/**
 * ChallengeTeam model
 * Teams within Summit Stats Team Challenge seasons (`learning_program_classes`).
 * Program Managers create teams; provider_plus users can be assigned as Team Manager / Team Lead.
 */
import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

class ChallengeTeam {
  static async findById(id) {
    const teamId = toInt(id);
    if (!teamId) return null;
    const [rows] = await pool.execute(
      `SELECT t.*, u.first_name AS manager_first_name, u.last_name AS manager_last_name
       FROM challenge_teams t
       LEFT JOIN users u ON u.id = t.team_manager_user_id
       WHERE t.id = ?
       LIMIT 1`,
      [teamId]
    );
    return rows?.[0] || null;
  }

  static async listByChallenge(learningClassId) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const [rows] = await pool.execute(
      `SELECT t.*, u.first_name AS manager_first_name, u.last_name AS manager_last_name
       FROM challenge_teams t
       LEFT JOIN users u ON u.id = t.team_manager_user_id
       WHERE t.learning_class_id = ?
       ORDER BY t.team_name ASC, t.id ASC`,
      [classId]
    );
    return rows || [];
  }

  static async create({ learningClassId, teamName, teamManagerUserId = null }) {
    const classId = toInt(learningClassId);
    const name = String(teamName || '').trim();
    if (!classId || !name) return null;
    const [result] = await pool.execute(
      `INSERT INTO challenge_teams (learning_class_id, team_name, team_manager_user_id)
       VALUES (?, ?, ?)`,
      [classId, name, teamManagerUserId ? toInt(teamManagerUserId) : null]
    );
    return this.findById(result.insertId);
  }

  static async update(teamId, patch = {}) {
    const id = toInt(teamId);
    if (!id) return null;
    const mapping = {
      teamName: 'team_name',
      teamManagerUserId: 'team_manager_user_id'
    };
    const setParts = [];
    const values = [];
    for (const [k, col] of Object.entries(mapping)) {
      if (patch[k] === undefined) continue;
      if (k === 'teamManagerUserId') {
        setParts.push(`${col} = ?`);
        values.push(patch[k] ? toInt(patch[k]) : null);
        continue;
      }
      setParts.push(`${col} = ?`);
      values.push(patch[k]);
    }
    if (!setParts.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE challenge_teams SET ${setParts.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async delete(teamId) {
    const id = toInt(teamId);
    if (!id) return false;
    const [result] = await pool.execute(`DELETE FROM challenge_teams WHERE id = ?`, [id]);
    return Number(result?.affectedRows || 0) > 0;
  }

  static async listMembers(teamId) {
    const id = toInt(teamId);
    if (!id) return [];
    const [rows] = await pool.execute(
      `SELECT m.*, u.first_name, u.last_name, u.email
       FROM challenge_team_members m
       INNER JOIN users u ON u.id = m.provider_user_id
       WHERE m.team_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [id]
    );
    return rows || [];
  }

  static async addMember({ teamId, providerUserId }) {
    const tId = toInt(teamId);
    const pId = toInt(providerUserId);
    if (!tId || !pId) return false;
    const [result] = await pool.execute(
      `INSERT INTO challenge_team_members (team_id, provider_user_id, joined_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE joined_at = COALESCE(joined_at, NOW())`,
      [tId, pId]
    );
    return Number(result?.affectedRows || 0) > 0;
  }

  static async removeMember({ teamId, providerUserId }) {
    const tId = toInt(teamId);
    const pId = toInt(providerUserId);
    if (!tId || !pId) return false;
    const [result] = await pool.execute(
      `DELETE FROM challenge_team_members WHERE team_id = ? AND provider_user_id = ?`,
      [tId, pId]
    );
    return Number(result?.affectedRows || 0) > 0;
  }

  static async getTeamForUser(learningClassId, providerUserId) {
    const classId = toInt(learningClassId);
    const pId = toInt(providerUserId);
    if (!classId || !pId) return null;
    // First check team_members table (normal roster)
    const [memberRows] = await pool.execute(
      `SELECT t.*, m.joined_at
       FROM challenge_teams t
       INNER JOIN challenge_team_members m ON m.team_id = t.id
       WHERE t.learning_class_id = ? AND m.provider_user_id = ?
       LIMIT 1`,
      [classId, pId]
    );
    if (memberRows?.length) return memberRows[0];
    // Fallback: check if user is team captain (team_manager_user_id)
    const [captainRows] = await pool.execute(
      `SELECT t.*, NULL AS joined_at
       FROM challenge_teams t
       WHERE t.learning_class_id = ? AND t.team_manager_user_id = ?
       LIMIT 1`,
      [classId, pId]
    );
    return captainRows?.[0] || null;
  }
}

export default ChallengeTeam;
