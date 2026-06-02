import pool from '../config/database.js';

/**
 * Attach template document_type and employee_display_category to document tasks.
 */
export async function enrichDocumentTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return tasks;

  const docTasks = tasks.filter((t) => t.task_type === 'document' && t.reference_id);
  if (!docTasks.length) return tasks;

  const templateIds = [...new Set(docTasks.map((t) => Number(t.reference_id)).filter(Boolean))];
  if (!templateIds.length) return tasks;

  const placeholders = templateIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, document_type, employee_display_category, is_user_specific
     FROM document_templates
     WHERE id IN (${placeholders})`,
    templateIds
  );

  const byId = new Map(rows.map((r) => [Number(r.id), r]));

  return tasks.map((task) => {
    if (task.task_type !== 'document') return task;
    const tpl = byId.get(Number(task.reference_id));
    if (!tpl) return task;

    const meta =
      task.metadata && typeof task.metadata === 'object' ? { ...task.metadata } : {};

    return {
      ...task,
      document_type: tpl.document_type || meta.documentType || null,
      employee_display_category: tpl.employee_display_category || null,
      is_user_specific: Boolean(tpl.is_user_specific),
      metadata: {
        ...meta,
        documentType: tpl.document_type || meta.documentType || null,
        displayCategory: tpl.employee_display_category || meta.displayCategory || null,
        userSpecific: Boolean(tpl.is_user_specific),
      },
    };
  });
}
