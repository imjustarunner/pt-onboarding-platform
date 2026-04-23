/**
 * Keeps `clients.client_status_id` in sync with the event workflow so the
 * "Intake Packet" status that the client carries on the roster automatically
 * advances as intake/treatment-plan steps are completed.
 *
 * Mapping (event workflow -> client_statuses.status_key):
 *   - Treatment plan complete (Participant)  -> 'current'
 *   - Intake accepted, TP not complete       -> 'pending'
 *   - Intake denied                          -> 'inactive'
 *   - Otherwise (new/in-progress registrant) -> 'packet'  (no-op if already set)
 *
 * Safety rails:
 *   - We NEVER downgrade a client who has already been promoted to a more
 *     advanced status by some other system (e.g. they're 'current' from a
 *     parallel event). Promotion priority:
 *       current (4) > pending (3) > packet (2) > inactive (1) > unknown (0)
 *   - We NEVER touch terminal/admin statuses (`archived`, `terminated`).
 *   - Missing status rows (e.g. an agency disabled 'pending') are silently
 *     skipped — we don't want to throw mid-workflow-save over UI config.
 *
 * This is intentionally a one-shot sync called from
 * `patchCompanyEventClientWorkflow` after a successful UPDATE; we don't watch
 * other tables. If you need to backfill, iterate through company_event_clients
 * and call `syncClientStatusForEvent` per row.
 */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';

const PROMOTION_RANK = {
  archived: 99,
  terminated: 99,
  current: 4,
  pending: 3,
  packet: 2,
  inactive: 1
};

const TERMINAL_KEYS = new Set(['archived', 'terminated']);

const rankOf = (key) => {
  const k = String(key || '').toLowerCase();
  return PROMOTION_RANK[k] || 0;
};

/**
 * Decide the desired status key based on a client's row in
 * company_event_clients.
 *
 * @param {{ intakeOutcome?: string|null, treatmentPlanComplete?: boolean }} workflow
 * @returns {'current'|'pending'|'packet'|'inactive'}
 */
export function deriveDesiredStatusKey(workflow) {
  const outcome = String(workflow?.intakeOutcome || '').toLowerCase();
  const tpComplete = !!workflow?.treatmentPlanComplete;

  if (tpComplete) return 'current';
  if (outcome === 'accepted') return 'pending';
  if (outcome === 'denied') return 'inactive';
  return 'packet';
}

/**
 * Sync a single client's status based on a particular event's workflow row.
 * Quietly no-ops on missing tables/rows so the caller never has to defensively
 * try/catch this for back-compat.
 *
 * @param {object} args
 * @param {number|string} args.clientId
 * @param {number|string} args.agencyId
 * @param {string|null} args.intakeOutcome - 'accepted' | 'denied' | null
 * @param {boolean} args.treatmentPlanComplete
 * @param {number|null} [args.actorUserId]  - used as the audit user on Client.update
 * @returns {Promise<{updated: boolean, fromKey: string|null, toKey: string|null, reason?: string}>}
 */
export async function syncClientStatusForEvent({
  clientId,
  agencyId,
  intakeOutcome,
  treatmentPlanComplete,
  actorUserId = null
}) {
  const cId = Number.parseInt(clientId, 10);
  const aId = Number.parseInt(agencyId, 10);
  if (!cId || !aId) return { updated: false, fromKey: null, toKey: null, reason: 'invalid_ids' };

  // Read current status (and the agency for safety, even though we trust the caller).
  let currentRow = null;
  try {
    const [rows] = await pool.execute(
      `SELECT c.id, c.client_status_id, cs.status_key AS current_key
       FROM clients c
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       WHERE c.id = ? AND c.agency_id = ?
       LIMIT 1`,
      [cId, aId]
    );
    currentRow = rows?.[0] || null;
  } catch (e) {
    return { updated: false, fromKey: null, toKey: null, reason: `lookup_failed:${e?.code || 'unknown'}` };
  }
  if (!currentRow) return { updated: false, fromKey: null, toKey: null, reason: 'client_not_found' };

  const fromKey = currentRow.current_key ? String(currentRow.current_key).toLowerCase() : null;
  if (fromKey && TERMINAL_KEYS.has(fromKey)) {
    // Never overwrite an admin-set terminal status from an event workflow change.
    return { updated: false, fromKey, toKey: null, reason: 'terminal_status' };
  }

  const desiredKey = deriveDesiredStatusKey({ intakeOutcome, treatmentPlanComplete });

  // Don't downgrade rank — e.g. if a parallel event already pushed them to
  // 'current', a new 'pending' from this event must not pull them backwards.
  if (fromKey && rankOf(fromKey) > rankOf(desiredKey)) {
    return { updated: false, fromKey, toKey: desiredKey, reason: 'no_downgrade' };
  }

  // Already in the desired state → nothing to do.
  if (fromKey === desiredKey) {
    return { updated: false, fromKey, toKey: desiredKey, reason: 'noop' };
  }

  const targetId = await getClientStatusIdByKey({ agencyId: aId, statusKey: desiredKey });
  if (!targetId) {
    return { updated: false, fromKey, toKey: desiredKey, reason: 'status_key_not_seeded' };
  }
  if (Number(targetId) === Number(currentRow.client_status_id)) {
    return { updated: false, fromKey, toKey: desiredKey, reason: 'noop_id_match' };
  }

  try {
    await Client.update(cId, { client_status_id: targetId }, actorUserId);
    return { updated: true, fromKey, toKey: desiredKey };
  } catch (e) {
    return { updated: false, fromKey, toKey: desiredKey, reason: `update_failed:${e?.code || 'unknown'}` };
  }
}
