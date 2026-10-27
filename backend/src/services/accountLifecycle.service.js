import pool from '../config/database.js';

const stateOf = (user) => ({
  status: user.status,
  isActive: user.is_active,
  isArchived: user.is_archived,
  archivedAt: user.archived_at,
  archivedByUserId: user.archived_by_user_id
});

// Keep the state change and its evidence together. An audit failure must roll
// back the account change, rather than leave an unexplained archive/activation.
// Existing callers with a transaction must propagate errors and roll it back.
export async function changeAccountLifecycle({
  userId, actorUserId = null, actorType = null, agencyId = null,
  source, reason, mutate, connection = null
}) {
  if (!source || !reason) throw new Error('Account changes require a source and reason');
  const conn = connection || await pool.getConnection();
  const owned = !connection;
  try {
    if (owned) await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT id, status, is_active, is_archived, archived_at, archived_by_user_id
       FROM users WHERE id = ? FOR UPDATE`, [userId]
    );
    const before = rows[0];
    if (!before) {
      if (owned) await conn.commit();
      return { affectedRows: 0 };
    }
    const result = await mutate(conn, before);
    const [afterRows] = await conn.execute(
      `SELECT id, status, is_active, is_archived, archived_at, archived_by_user_id
       FROM users WHERE id = ?`, [userId]
    );
    const after = afterRows[0];
    if (!after) throw new Error('Account disappeared during lifecycle change');
    if (JSON.stringify(stateOf(before)) !== JSON.stringify(stateOf(after))) {
      let actor = null;
      if (actorUserId) {
        const [actors] = await conn.execute('SELECT id, first_name, last_name, role FROM users WHERE id = ?', [actorUserId]);
        if (actors[0]) actor = {
          id: actors[0].id,
          name: `${actors[0].first_name || ''} ${actors[0].last_name || ''}`.trim(),
          role: actors[0].role
        };
      }
      const archived = Number(after.is_archived) === 1 || after.status === 'ARCHIVED';
      const wasArchived = Number(before.is_archived) === 1 || before.status === 'ARCHIVED';
      const reactivated = Number(after.is_active) === 1 && Number(after.is_archived) !== 1 && after.status === 'ACTIVE_EMPLOYEE';
      await conn.execute(
        `INSERT INTO user_activity_log (action_type, user_id, agency_id, metadata)
         VALUES (?, ?, ?, ?)`,
        [archived && !wasArchived ? 'user_account_archived' : reactivated ? 'user_account_reactivated' : 'user_account_status_changed',
          actorUserId || null, agencyId || null, JSON.stringify({
            targetType: 'user', targetId: Number(userId), source, reason,
            actorType: actorUserId ? 'user' : actorType || 'unknown', actor,
            before: stateOf(before), after: stateOf(after)
          })]
      );
    }
    if (owned) await conn.commit();
    return result;
  } catch (error) {
    if (owned) await conn.rollback();
    throw error;
  } finally {
    if (owned) conn.release();
  }
}
