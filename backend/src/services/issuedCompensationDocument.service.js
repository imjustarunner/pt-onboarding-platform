import pool from '../config/database.js';

/** The released document is evidence of the compensation schedule in its generation.
 * Generic file/HTML editing must never replace it, including after signing. Draft
 * compensation continues to use its dedicated optimistic save/release workflow.
 */
export async function assertGenericCompensationDocumentWritable({documentId = null, taskId = null}, db = pool) {
  const [[generation]] = await db.execute(`SELECT cg.id FROM contract_generations cg
    WHERE (JSON_UNQUOTE(JSON_EXTRACT(cg.token_values_json,'$.draftKind'))='provider_update_compensation'
      OR JSON_UNQUOTE(JSON_EXTRACT(cg.token_values_json,'$.createdVia'))='employee_compensation_ui')
    AND (cg.user_specific_document_id=? OR cg.task_id=? OR cg.task_id IN (
      SELECT reference_id FROM tasks WHERE id=? AND document_action_type='countersignature'
    )) LIMIT 1`, [documentId ?? null, taskId ?? null, taskId ?? null]);
  if (generation) {
    throw Object.assign(new Error('An issued compensation agreement cannot be replaced or deleted. Create a separately reviewed compensation amendment to change its terms.'), {status: 409});
  }
}
