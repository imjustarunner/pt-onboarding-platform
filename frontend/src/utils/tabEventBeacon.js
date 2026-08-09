/**
 * tabEventBeacon
 * Lightweight fire-and-forget helper to log a tab switch or inline action
 * to the backend (POST /api/user-nav/tab-event).
 * Swallows all errors silently — never block user flow.
 */
import api from '../services/api.js';

/**
 * @param {object} opts
 * @param {string} opts.page   - Normalized page key, e.g. 'caseload-hub-schools-staff'
 * @param {string} opts.tab    - Tab id or action id clicked, e.g. 'events'
 * @param {string} [opts.actionType]  - 'admin_tab_view' (default) or 'admin_action'
 * @param {number} [opts.agencyId]
 * @param {object} [opts.extra]       - Any extra context (filters, entity ids, etc.)
 */
export function fireTabEvent({ page, tab, actionType = 'admin_tab_view', agencyId, extra } = {}) {
  if (!page || !tab) return;
  api.post(
    '/user-nav/tab-event',
    { actionType, page, tab, agencyId: agencyId || undefined, extra: extra || undefined },
    { skipGlobalLoading: true }
  ).catch(() => {});
}
