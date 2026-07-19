import pool from '../config/database.js';

class AgencyMeetingInviteGroup {
  static async listByAgencyIds(agencyIds = []) {
    const ids = Array.from(new Set((agencyIds || []).map((n) => Number(n || 0)).filter((n) => n > 0)));
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT g.id, g.agency_id, g.name, g.created_by_user_id,
              GROUP_CONCAT(m.user_id ORDER BY m.user_id ASC) AS user_ids
       FROM agency_meeting_invite_groups g
       LEFT JOIN agency_meeting_invite_group_members m ON m.group_id = g.id
       WHERE g.agency_id IN (${placeholders})
       GROUP BY g.id, g.agency_id, g.name, g.created_by_user_id
       ORDER BY g.name ASC, g.id ASC`,
      ids
    );
    return (rows || []).map((r) => ({
      id: Number(r.id || 0),
      agencyId: Number(r.agency_id || 0),
      name: String(r.name || '').trim(),
      createdByUserId: Number(r.created_by_user_id || 0) || null,
      userIds: String(r.user_ids || '')
        .split(',')
        .map((v) => Number(v || 0))
        .filter((n) => n > 0)
    })).filter((g) => g.id > 0 && g.name);
  }

  static async create({ agencyId, name, createdByUserId = null, userIds = [] }) {
    const aid = Number(agencyId || 0);
    const label = String(name || '').trim().slice(0, 120);
    if (!aid || !label) return null;
    const [result] = await pool.execute(
      `INSERT INTO agency_meeting_invite_groups (agency_id, name, created_by_user_id)
       VALUES (?, ?, ?)`,
      [aid, label, Number(createdByUserId || 0) || null]
    );
    const groupId = Number(result?.insertId || 0);
    if (!groupId) return null;
    const members = Array.from(new Set((userIds || []).map((n) => Number(n || 0)).filter((n) => n > 0)));
    for (const userId of members) {
      // eslint-disable-next-line no-await-in-loop
      await pool.execute(
        `INSERT IGNORE INTO agency_meeting_invite_group_members (group_id, user_id) VALUES (?, ?)`,
        [groupId, userId]
      );
    }
    return {
      id: groupId,
      agencyId: aid,
      name: label,
      createdByUserId: Number(createdByUserId || 0) || null,
      userIds: members
    };
  }

  static async replaceMembers(groupId, userIds = []) {
    const gid = Number(groupId || 0);
    if (!gid) return false;
    await pool.execute(`DELETE FROM agency_meeting_invite_group_members WHERE group_id = ?`, [gid]);
    const members = Array.from(new Set((userIds || []).map((n) => Number(n || 0)).filter((n) => n > 0)));
    for (const userId of members) {
      // eslint-disable-next-line no-await-in-loop
      await pool.execute(
        `INSERT IGNORE INTO agency_meeting_invite_group_members (group_id, user_id) VALUES (?, ?)`,
        [gid, userId]
      );
    }
    return true;
  }

  static async findById(groupId) {
    const gid = Number(groupId || 0);
    if (!gid) return null;
    const [groupRows] = await pool.execute(
      `SELECT id, agency_id, name, created_by_user_id FROM agency_meeting_invite_groups WHERE id = ? LIMIT 1`,
      [gid]
    );
    const g = groupRows?.[0];
    if (!g) return null;
    const [memberRows] = await pool.execute(
      `SELECT user_id FROM agency_meeting_invite_group_members WHERE group_id = ?`,
      [gid]
    );
    return {
      id: Number(g.id || 0),
      agencyId: Number(g.agency_id || 0),
      name: String(g.name || '').trim(),
      createdByUserId: Number(g.created_by_user_id || 0) || null,
      userIds: (memberRows || []).map((r) => Number(r.user_id || 0)).filter((n) => n > 0)
    };
  }

  static async deleteById(groupId) {
    const gid = Number(groupId || 0);
    if (!gid) return false;
    const [result] = await pool.execute(`DELETE FROM agency_meeting_invite_groups WHERE id = ?`, [gid]);
    return Number(result?.affectedRows || 0) > 0;
  }
}

export default AgencyMeetingInviteGroup;
