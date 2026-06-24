/**
 * lifecycleSync.service.js
 *
 * Reads existing app data (tasks, user_info_values, credentialing, supervision sessions)
 * and marks lifecycle checklist items as auto-completed when the underlying data confirms
 * the work is done. HR manual overrides (manually_overridden=1) are never overwritten.
 *
 * Called on every Lifecycle tab load (Phase 1) and eventually from event hooks (Phase 2).
 */
import pool from '../config/database.js';
import LifecycleChecklistDefinition from '../models/LifecycleChecklistDefinition.model.js';
import UserLifecycleChecklistItem from '../models/UserLifecycleChecklistItem.model.js';

// ─────────────────────────────────────────────────────────────────────────────
// Derive completion from data sources
// ─────────────────────────────────────────────────────────────────────────────

async function resolveUserInfoField(userId, fieldKey) {
  // Returns { completed: bool, completedAt: Date|null }
  const [rows] = await pool.execute(
    `SELECT uiv.value, uiv.updated_at
     FROM user_info_values uiv
     JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
     WHERE uiv.user_id = ? AND uifd.field_key IN (?, ?)
     ORDER BY uiv.updated_at DESC
     LIMIT 1`,
    [userId, fieldKey, fieldKey]
  );
  const val = String(rows?.[0]?.value || '').trim();
  const completed = val.length > 0 && val !== 'none' && val !== 'not_started';
  return { completed, completedAt: completed ? (rows[0].updated_at || null) : null };
}

async function resolveDocumentTask(userId, integrationRef) {
  // Match document tasks where the template slug/name contains the ref string
  const ref = String(integrationRef || '').toLowerCase();
  const [rows] = await pool.execute(
    `SELECT t.id, t.status, t.completed_at
     FROM tasks t
     LEFT JOIN document_templates dt ON dt.id = t.reference_id AND t.task_type = 'document'
     WHERE t.user_id = ?
       AND t.task_type = 'document'
       AND t.status = 'completed'
       AND (LOWER(dt.title) LIKE ? OR LOWER(dt.document_type) LIKE ?)
     ORDER BY t.completed_at DESC
     LIMIT 1`,
    [userId, `%${ref}%`, `%${ref}%`]
  );
  const row = rows?.[0];
  return { completed: !!row, completedAt: row?.completed_at || null };
}

async function resolveTrainingTask(userId, integrationRef) {
  const ref = String(integrationRef || '').toLowerCase();
  const [rows] = await pool.execute(
    `SELECT t.id, t.status, t.completed_at
     FROM tasks t
     LEFT JOIN training_tracks tt ON tt.id = t.reference_id AND t.task_type = 'training'
     WHERE t.user_id = ?
       AND t.task_type = 'training'
       AND t.status = 'completed'
       AND (LOWER(tt.name) LIKE ? OR LOWER(tt.slug) LIKE ?)
     ORDER BY t.completed_at DESC
     LIMIT 1`,
    [userId, `%${ref}%`, `%${ref}%`]
  );
  const row = rows?.[0];
  return { completed: !!row, completedAt: row?.completed_at || null };
}

async function resolveAccountSetup(userId, integrationRef) {
  if (integrationRef === 'workspace_email') {
    const [rows] = await pool.execute(
      `SELECT email, created_at FROM users WHERE id = ? AND email IS NOT NULL AND email != '' LIMIT 1`,
      [userId]
    );
    return { completed: rows.length > 0, completedAt: rows[0]?.created_at || null };
  }
  return { completed: false, completedAt: null };
}

async function resolveCredentialing(userId) {
  // Considered approved if at least one insurance is marked approved for this user
  const [rows] = await pool.execute(
    `SELECT id FROM user_insurance_credentialing
     WHERE user_id = ? AND status = 'approved'
     LIMIT 1`,
    [userId]
  );
  return { completed: rows.length > 0, completedAt: null };
}

async function resolveSupervisionSession(userId) {
  // Considered met if at least one finalized supervision session exists
  const [rows] = await pool.execute(
    `SELECT id, session_finalized_at FROM supervision_sessions
     WHERE supervisee_id = ? AND session_finalized_at IS NOT NULL
     ORDER BY session_finalized_at ASC
     LIMIT 1`,
    [userId]
  );
  const row = rows?.[0];
  return { completed: !!row, completedAt: row?.session_finalized_at || null };
}

async function resolveBackgroundCheck(userId) {
  // background_check_status = 'complete' or 'passed' in user_info_values
  const [rows] = await pool.execute(
    `SELECT uiv.value, uiv.updated_at
     FROM user_info_values uiv
     JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
     WHERE uiv.user_id = ? AND uifd.field_key IN (
       'provider_background_check_status','background_check_status'
     )
     LIMIT 1`,
    [userId]
  );
  const val = String(rows?.[0]?.value || '').toLowerCase().trim();
  const completed = ['complete', 'passed', 'cleared', 'approved'].some((s) => val.includes(s));
  return { completed, completedAt: completed ? (rows[0].updated_at || null) : null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main sync
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync auto-completable lifecycle items for a user.
 * Safe to call repeatedly — idempotent and respects manually_overridden flag.
 */
export async function syncLifecycleItems(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return;

  const definitions = await LifecycleChecklistDefinition.findAll();

  for (const def of definitions) {
    if (def.integration_type === 'manual') continue;

    let result = { completed: false, completedAt: null };

    try {
      switch (def.integration_type) {
        case 'user_info_field': {
          // Special-case background check — it has compound logic
          if (def.item_key === 'background_check_complete') {
            result = await resolveBackgroundCheck(uid);
          } else {
            result = await resolveUserInfoField(uid, def.integration_ref || def.item_key);
          }
          break;
        }
        case 'document_task':
          result = await resolveDocumentTask(uid, def.integration_ref);
          break;
        case 'training_task':
          result = await resolveTrainingTask(uid, def.integration_ref);
          break;
        case 'account_setup':
          result = await resolveAccountSetup(uid, def.integration_ref);
          break;
        case 'credentialing':
          result = await resolveCredentialing(uid);
          break;
        case 'supervision_session':
          result = await resolveSupervisionSession(uid);
          break;
        default:
          continue;
      }
    } catch {
      // Non-fatal: table may not exist in all environments (e.g. supervision_sessions)
      continue;
    }

    await UserLifecycleChecklistItem.autoComplete(uid, def.id, result.completed, result.completedAt);
  }
}
