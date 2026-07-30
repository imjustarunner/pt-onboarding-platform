/**
 * District 11 compliance activation:
 * - Scope optional School Badge lifecycle item
 * - Sync federal BG expiration at 3 years
 * - Notify provider + admins the first time D11 tracking activates
 */
import pool from '../config/database.js';
import {
  SCHOOL_BADGE_ITEM_KEY,
  listProviderDistrictFlags,
  providerHasDistrict11Assignment,
  schoolOrganizationIsDistrict11,
} from '../utils/districtCompliance.js';
import { scopeLifecycleItem } from './lifecycleScope.service.js';
import UserLifecycleChecklistItem from '../models/UserLifecycleChecklistItem.model.js';
import LifecycleChecklistDefinition from '../models/LifecycleChecklistDefinition.model.js';
import {
  FEDERAL_BG_ITEM_KEY,
  resolveAgencyIdForUser,
  syncFederalBackgroundExpiration,
} from './federalBackgroundCheck.service.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';

async function getAgencyAdminStaffUserIds(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND u.is_active = TRUE
       AND u.role IN ('admin','super_admin','support','staff')`,
    [agencyId]
  );
  return (rows || []).map((r) => r.id);
}

async function alreadyNotifiedActivation({ agencyId, userId, relatedEntityId }) {
  const [rows] = await pool.execute(
    `SELECT id FROM notifications
     WHERE agency_id = ?
       AND user_id = ?
       AND type = 'd11_background_tracking_activated'
       AND related_entity_type = 'user'
       AND related_entity_id = ?
       AND is_resolved = FALSE
     LIMIT 1`,
    [agencyId, userId, relatedEntityId]
  );
  return !!rows[0]?.id;
}

async function notifyD11Activation(providerUserId, agencyId) {
  if (!agencyId) return;

  const [userRows] = await pool.execute(
    `SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1`,
    [providerUserId]
  );
  const name =
    `${userRows?.[0]?.first_name || ''} ${userRows?.[0]?.last_name || ''}`.trim() ||
    `user ID ${providerUserId}`;

  const adminIds = await getAgencyAdminStaffUserIds(agencyId);
  const recipients = Array.from(new Set([providerUserId, ...adminIds]));
  const title = 'District 11 background check tracking activated';
  const message =
    `${name} is assigned to a District 11 school. Federal Background/Fingerprint Check ` +
    `expiration is now tracked at 3 years from the completion date, and an optional School Badge ` +
    `attestation is available on the Lifecycle checklist.`;

  await Promise.all(
    recipients.map(async (userId) => {
      if (
        await alreadyNotifiedActivation({
          agencyId,
          userId,
          relatedEntityId: providerUserId,
        })
      ) {
        return null;
      }
      return createNotificationAndDispatch(
        {
          type: 'd11_background_tracking_activated',
          severity: 'info',
          title,
          message,
          userId,
          agencyId,
          relatedEntityType: 'user',
          relatedEntityId: providerUserId,
          actorSource: 'System',
        },
        { context: {} }
      ).catch(() => null);
    })
  );
}

/**
 * Ensure D11 compliance artifacts for a provider when they have (or just gained) a D11 school.
 * Safe to call repeatedly (idempotent aside from one-shot activation notifications).
 */
export async function ensureD11ComplianceForProvider(
  providerUserId,
  { schoolOrganizationId = null, actorUserId = null, preferredAgencyId = null } = {}
) {
  const uid = Number(providerUserId);
  if (!Number.isInteger(uid) || uid <= 0) {
    return { applies: false };
  }

  let applies = false;
  if (schoolOrganizationId) {
    applies = await schoolOrganizationIsDistrict11(schoolOrganizationId);
    if (!applies) {
      applies = await providerHasDistrict11Assignment(uid);
    }
  } else {
    applies = await providerHasDistrict11Assignment(uid);
  }

  if (!applies) {
    const sync = await syncFederalBackgroundExpiration(uid, { preferredAgencyId }).catch(() => null);
    return { applies: false, sync };
  }

  const flags = await listProviderDistrictFlags(uid);
  const [scopedBefore] = await pool.execute(
    `SELECT id FROM user_lifecycle_scoped_items
     WHERE user_id = ? AND item_key = ?
     LIMIT 1`,
    [uid, SCHOOL_BADGE_ITEM_KEY]
  );
  const wasAlreadyScoped = !!scopedBefore?.[0]?.id;

  const sourceId = schoolOrganizationId || flags.schoolOrganizationIds[0] || null;
  await scopeLifecycleItem(uid, SCHOOL_BADGE_ITEM_KEY, 'school_assignment', sourceId);

  const badgeDef = await LifecycleChecklistDefinition.findByKey(SCHOOL_BADGE_ITEM_KEY);
  if (badgeDef?.id) {
    await UserLifecycleChecklistItem.ensureRows(uid, [badgeDef.id]);
  }

  // Also ensure federal BG row exists so expiration can be computed
  const [bgDefs] = await pool.execute(
    `SELECT id FROM lifecycle_checklist_definitions
     WHERE item_key = ? AND agency_id IS NULL LIMIT 1`,
    [FEDERAL_BG_ITEM_KEY]
  );
  if (bgDefs?.[0]?.id) {
    await UserLifecycleChecklistItem.ensureRows(uid, [bgDefs[0].id]);
  }

  const sync = await syncFederalBackgroundExpiration(uid, { preferredAgencyId }).catch(() => null);

  const newlyActivated = !wasAlreadyScoped;
  if (newlyActivated) {
    const agencyId =
      (await resolveAgencyIdForUser(uid, preferredAgencyId)) ||
      preferredAgencyId ||
      null;
    await notifyD11Activation(uid, agencyId).catch(() => null);
  }

  return {
    applies: true,
    newlyActivated,
    sync,
    flags,
    actorUserId: actorUserId || null,
  };
}

/** Fire-and-forget wrapper for assignment write paths. */
export function enqueueD11ComplianceEnsure(providerUserId, opts = {}) {
  setImmediate(() => {
    ensureD11ComplianceForProvider(providerUserId, opts).catch(() => null);
  });
}
