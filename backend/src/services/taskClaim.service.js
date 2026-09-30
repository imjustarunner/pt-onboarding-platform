import pool from '../config/database.js';
const fail = (status, message) => Object.assign(new Error(message), { status });
/** Serialize claims so a second teammate cannot replace the first claimant. */
export async function claimSharedTask({ taskId, userId }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT * FROM tasks WHERE id = ? FOR UPDATE', [taskId]);
    const task = rows[0];
    if (!task) throw fail(404, 'Task not found');
    if (task.task_type !== 'custom' || !task.task_list_id) throw fail(400, 'Task must be in a shared list to claim');
    const [members] = await connection.execute(`SELECT m.role FROM task_list_members m JOIN task_lists l ON l.id = m.task_list_id
      JOIN user_agencies ua ON ua.agency_id = l.agency_id AND ua.user_id = m.user_id
      WHERE m.task_list_id = ? AND m.user_id = ?`, [task.task_list_id, userId]);
    if (!members.length) throw fail(403, 'You must be a member of this team and agency to claim');
    if (Number(task.is_private) && Number(task.assigned_by_user_id) !== Number(userId) && Number(task.assigned_to_user_id) !== Number(userId)) throw fail(403, 'This task is private');
    if (['completed', 'overridden'].includes(task.status)) throw fail(409, 'This task is already closed');
    if (task.assigned_to_user_id && Number(task.assigned_to_user_id) !== Number(userId)) throw fail(409, 'Another teammate already owns this task. Refresh to see the assignment.');
    if (!task.assigned_to_user_id) {
      await connection.execute('UPDATE tasks SET assigned_to_user_id = ? WHERE id = ? AND assigned_to_user_id IS NULL', [userId, taskId]);
      await connection.execute('DELETE FROM task_collaborators WHERE task_id = ? AND user_id = ?', [taskId, userId]);
      await connection.execute("INSERT INTO task_audit_log (task_id, action_type, actor_user_id, target_user_id, metadata) VALUES (?, 'assigned', ?, ?, ?)", [taskId, userId, userId, JSON.stringify({ source: 'claim', taskListId: task.task_list_id })]);
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
