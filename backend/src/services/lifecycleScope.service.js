/**
 * lifecycleScope.service.js
 *
 * Records which lifecycle checklist items apply to a user based on
 * package assignment, document tasks, or HR manual actions.
 */
import pool from '../config/database.js';
import UserLifecycleScopedItem from '../models/UserLifecycleScopedItem.model.js';
import LifecycleChecklistDefinition from '../models/LifecycleChecklistDefinition.model.js';

export async function scopeLifecycleItem(userId, itemKey, source = 'package', sourceId = null) {
  return UserLifecycleScopedItem.scope(userId, itemKey, source, sourceId);
}

export async function scopeLifecycleItems(userId, itemKeys, source = 'package', sourceId = null) {
  return UserLifecycleScopedItem.scopeMany(userId, itemKeys, source, sourceId);
}

/**
 * Scope all offboarding checklist items when a user is terminated.
 */
export async function scopeOffboardingChecklist(userId) {
  const defs = await LifecycleChecklistDefinition.findByPhase('offboarding');
  const keys = defs.map((d) => d.item_key).filter(Boolean);
  return scopeLifecycleItems(userId, keys, 'offboarding', null);
}

/**
 * Scope lifecycle keys from an onboarding/pre-hire package assignment.
 */
export async function scopeFromPackageAssignment(userId, packageId) {
  const uid = Number(userId);
  const pid = Number(packageId);
  if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(pid) || pid <= 0) return;

  const keys = new Set();

  const [pkgRows] = await pool.execute(
    'SELECT lifecycle_item_keys FROM onboarding_packages WHERE id = ? LIMIT 1',
    [pid]
  );
  const rawKeys = pkgRows[0]?.lifecycle_item_keys;
  const parsed = typeof rawKeys === 'string' ? JSON.parse(rawKeys) : rawKeys;
  if (Array.isArray(parsed)) {
    for (const k of parsed) {
      if (k) keys.add(String(k).trim());
    }
  }

  const [docRows] = await pool.execute(
    `SELECT dt.lifecycle_item_key
     FROM onboarding_package_documents opd
     JOIN document_templates dt ON dt.id = opd.document_template_id
     WHERE opd.package_id = ?
       AND dt.lifecycle_item_key IS NOT NULL
       AND dt.lifecycle_item_key != ''`,
    [pid]
  );
  for (const row of docRows || []) {
    if (row.lifecycle_item_key) keys.add(String(row.lifecycle_item_key).trim());
  }

  await scopeLifecycleItems(uid, [...keys], 'package', pid);
}

/**
 * Backfill scope rows from existing document tasks (for users hired before this feature).
 */
export async function backfillScopeFromExistingAssignments(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return;

  const [rows] = await pool.execute(
    `SELECT t.id AS task_id,
            dt.lifecycle_item_key AS template_key,
            t.metadata
     FROM tasks t
     LEFT JOIN document_templates dt ON dt.id = t.reference_id AND t.task_type = 'document'
     WHERE t.assigned_to_user_id = ?
       AND t.task_type = 'document'
       AND t.status NOT IN ('archived', 'overridden')`,
    [uid]
  );

  for (const row of rows || []) {
    let metaKey = null;
    try {
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      metaKey = meta?.lifecycleItemKey || null;
    } catch {
      metaKey = null;
    }
    const key = row.template_key || metaKey;
    if (key) {
      await scopeLifecycleItem(uid, key, 'backfill', row.task_id);
    }
  }

  const [pkgMetaRows] = await pool.execute(
    `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.fromPackage')) AS package_id
     FROM tasks t
     WHERE t.assigned_to_user_id = ?
       AND t.metadata IS NOT NULL
       AND JSON_EXTRACT(t.metadata, '$.fromPackage') IS NOT NULL`,
    [uid]
  );
  for (const row of pkgMetaRows || []) {
    const pid = parseInt(row.package_id, 10);
    if (Number.isFinite(pid) && pid > 0) {
      await scopeFromPackageAssignment(uid, pid);
    }
  }
}
