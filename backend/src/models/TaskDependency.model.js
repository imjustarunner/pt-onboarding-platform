import pool from '../config/database.js';

class TaskDependency {
  /**
   * Add a dependency: task_id will be blocked until depends_on_id is completed.
   */
  static async add({ taskId, dependsOnId, createdBy = null }) {
    await pool.execute(
      `INSERT IGNORE INTO task_dependencies (task_id, depends_on_id, created_by)
       VALUES (?, ?, ?)`,
      [taskId, dependsOnId, createdBy]
    );
  }

  /**
   * Remove a specific dependency.
   */
  static async remove({ taskId, dependsOnId }) {
    await pool.execute(
      'DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?',
      [taskId, dependsOnId]
    );
  }

  /**
   * List all tasks that depend on the given task (i.e., tasks waiting for it).
   */
  static async listDependents(dependsOnId) {
    const [rows] = await pool.execute(
      `SELECT td.task_id, t.title, t.status, t.task_list_id, t.assigned_to_user_id
       FROM task_dependencies td
       JOIN tasks t ON t.id = td.task_id
       WHERE td.depends_on_id = ?`,
      [dependsOnId]
    );
    return rows;
  }

  /**
   * List all tasks that the given task depends on (i.e., its blockers).
   */
  static async listBlockers(taskId) {
    const [rows] = await pool.execute(
      `SELECT td.depends_on_id AS blocker_id, t.title, t.status
       FROM task_dependencies td
       JOIN tasks t ON t.id = td.depends_on_id
       WHERE td.task_id = ?`,
      [taskId]
    );
    return rows;
  }

  /**
   * After a task is completed, unlock any dependents whose ALL blockers are now done.
   * Returns the number of tasks unlocked.
   */
  static async unlockDependents(completedTaskId) {
    // Find all tasks waiting on this task
    const dependents = await this.listDependents(completedTaskId);
    let unlocked = 0;

    for (const dep of dependents) {
      if (dep.status !== 'waiting') continue;

      // Check if ALL blockers for this dependent are now completed/overridden
      const [blockers] = await pool.execute(
        `SELECT td.depends_on_id, t.status
         FROM task_dependencies td
         JOIN tasks t ON t.id = td.depends_on_id
         WHERE td.task_id = ?`,
        [dep.task_id]
      );

      const allDone = blockers.every(
        (b) => b.status === 'completed' || b.status === 'overridden'
      );

      if (allDone) {
        await pool.execute(
          `UPDATE tasks SET status = 'pending' WHERE id = ? AND status = 'waiting'`,
          [dep.task_id]
        );
        unlocked++;
      }
    }

    return unlocked;
  }

  /**
   * Get all dependencies for a set of task IDs in one query.
   * Returns { [taskId]: { blockers: [...], dependents: [...] } }
   */
  static async getForTasks(taskIds) {
    if (!taskIds.length) return {};
    const placeholders = taskIds.map(() => '?').join(',');

    const [blockerRows] = await pool.execute(
      `SELECT td.task_id, td.depends_on_id AS blocker_id, t.title AS blocker_title, t.status AS blocker_status
       FROM task_dependencies td
       JOIN tasks t ON t.id = td.depends_on_id
       WHERE td.task_id IN (${placeholders})`,
      taskIds
    );

    const [dependentRows] = await pool.execute(
      `SELECT td.depends_on_id AS task_id, td.task_id AS dependent_id, t.title AS dependent_title, t.status AS dependent_status
       FROM task_dependencies td
       JOIN tasks t ON t.id = td.task_id
       WHERE td.depends_on_id IN (${placeholders})`,
      taskIds
    );

    const result = {};
    for (const tid of taskIds) {
      result[tid] = { blockers: [], dependents: [] };
    }
    for (const r of blockerRows) {
      if (result[r.task_id]) {
        result[r.task_id].blockers.push({ id: r.blocker_id, title: r.blocker_title, status: r.blocker_status });
      }
    }
    for (const r of dependentRows) {
      if (result[r.task_id]) {
        result[r.task_id].dependents.push({ id: r.dependent_id, title: r.dependent_title, status: r.dependent_status });
      }
    }
    return result;
  }
}

export default TaskDependency;
