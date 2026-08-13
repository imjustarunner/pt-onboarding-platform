/**
 * Daily calendar-driven school-year lifecycle automation.
 */
import pool from '../config/database.js';
import {
  isSpringUpdateOpenDay,
  isSpringUpdateDueDay,
  isJulyRolloverDay,
  isFallConfirmationDueDay,
  springUpdateDueAt,
  fallConfirmationDueAt
} from '../utils/schoolYearCalendar.js';
import { computeCurrentSchoolYearLabel, computeCurrentSchoolYearShort } from '../utils/schoolYear.js';
import {
  openSpringUpdateForAgency,
  applyJulyRolloverStatuses
} from './clientYearDisposition.service.js';
import { LIFECYCLE_STATUS_KEYS, setClientLifecycleStatus } from './clientLifecycleStatus.service.js';

async function agencyIdsWithSchoolClients() {
  const [rows] = await pool.execute(
    `SELECT DISTINCT c.agency_id AS id
     FROM clients c
     WHERE c.client_type = 'school'
       AND c.agency_id IS NOT NULL
       AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')`
  );
  return (rows || []).map((r) => Number(r.id)).filter(Boolean);
}

async function notifyAdminsProviderYearUpdate({ agencyId }) {
  try {
    const Task = (await import('../models/Task.model.js')).default;
    if (!Task?.create) return;
    const { inferTaskCategoryFromTitle, normalizeTaskCategories } = await import('../constants/taskCategories.js');
    const title = 'Provider Year Update released — review agency requirements';
    const categories = normalizeTaskCategories(inferTaskCategoryFromTitle(title));
    await Task.create({
      taskType: 'custom',
      title,
      description:
        'July rollover: Provider Year Update was auto-enabled/pushed. Review agency requirements and complete PYU. This is separate from Collaborative School Year Update.',
      assignedByUserId: 501,
      assignedToAgencyId: agencyId,
      urgency: 'high',
      isPrivate: false,
      categories
    }).catch((e) => {
      console.warn('[clientLifecycleCalendar] PYU task failed', e?.message || e);
    });
  } catch (e) {
    console.warn('[clientLifecycleCalendar] PYU notify failed', e?.message || e);
  }
}

async function enableProviderYearUpdateCampaigns({ agencyId }) {
  try {
    const pyu = await import('./providerYearUpdate.service.js');
    const schoolYear = typeof pyu.currentSchoolYear === 'function'
      ? pyu.currentSchoolYear()
      : computeCurrentSchoolYearShort();
    await pyu.enableCampaign({ agencyId, schoolYear, userId: null });
    if (typeof pyu.pushCampaign === 'function') {
      await pyu.pushCampaign({ agencyId, schoolYear, userId: null }).catch((e) => {
        console.warn('[clientLifecycleCalendar] PYU push skipped', e?.message || e);
      });
    }
  } catch (e) {
    console.warn('[clientLifecycleCalendar] PYU enable failed', e?.message || e);
  }
}

async function prepareCollaborativeYearUpdate({ agencyId }) {
  try {
    const reinit = await import('./schoolReinit.service.js');
    // Ensure draft/enabled campaign exists; do not auto-push (plan: enablement Action for Admin).
    if (typeof reinit.getOrCreateCampaign === 'function') {
      await reinit.getOrCreateCampaign(agencyId, null);
    }
    const Task = (await import('../models/Task.model.js')).default;
    if (Task?.create) {
      const { inferTaskCategoryFromTitle, normalizeTaskCategories } = await import('../constants/taskCategories.js');
      const title = 'Enable Collaborative School Year Update';
      const categories = normalizeTaskCategories(inferTaskCategoryFromTitle(title));
      await Task.create({
        taskType: 'custom',
        title,
        description:
          'July rollover: review and enable the Collaborative School Year Update for each school so school staff can complete their year setup. Do not collapse this with Provider Year Update.',
        assignedByUserId: 501,
        assignedToAgencyId: agencyId,
        urgency: 'high',
        isPrivate: false,
        categories
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('[clientLifecycleCalendar] collaborative prepare failed', e?.message || e);
  }
}

async function markSpringOverdue({ agencyId }) {
  const year = computeCurrentSchoolYearLabel();
  const [rows] = await pool.execute(
    `SELECT c.id
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     LEFT JOIN client_year_dispositions d
       ON d.client_id = c.id AND d.school_year = ?
     WHERE c.agency_id = ?
       AND c.client_type = 'school'
       AND LOWER(COALESCE(cs.status_key, '')) = 'spring_update_pending'
       AND (d.spring_completed_at IS NULL)`,
    [year, agencyId]
  );
  return { overdue: (rows || []).length, due: springUpdateDueAt(new Date().getFullYear()) };
}

async function markFallConfirmationDue({ agencyId }) {
  const year = computeCurrentSchoolYearLabel();
  const [rows] = await pool.execute(
    `SELECT c.id, d.spring_outcome
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     LEFT JOIN client_year_dispositions d
       ON d.client_id = c.id AND d.school_year = ?
     WHERE c.agency_id = ?
       AND c.client_type = 'school'
       AND LOWER(COALESCE(cs.status_key, '')) NOT IN ('terminated', 'archived', 'being_seen', 'waitlist')
       AND (d.fall_completed_at IS NULL)
       AND (
         d.spring_outcome IN ('returning', 'unknown')
         OR LOWER(COALESCE(cs.status_key, '')) IN ('returning', 'continuation_unknown', 'confirmation_pending')
       )`,
    [year, agencyId]
  );
  let updated = 0;
  for (const r of rows || []) {
    const key =
      r.spring_outcome === 'unknown'
        ? LIFECYCLE_STATUS_KEYS.CONTINUATION_UNKNOWN
        : LIFECYCLE_STATUS_KEYS.CONFIRMATION_PENDING;
    await setClientLifecycleStatus({
      clientId: r.id,
      statusKey: key,
      note: `Fall confirmation due (${fallConfirmationDueAt(new Date().getFullYear())?.toDateString?.() || '2nd Monday Aug'})`
    });
    updated += 1;
  }
  return { updated };
}

export async function runClientLifecycleCalendarJob({ now = new Date() } = {}) {
  const results = {
    ranAt: now.toISOString(),
    springOpen: false,
    springDue: false,
    julyRollover: false,
    fallDue: false,
    agencies: 0,
    portalSchoolYear: computeCurrentSchoolYearLabel(now)
  };

  const agencyIds = await agencyIdsWithSchoolClients();
  results.agencies = agencyIds.length;

  if (isSpringUpdateOpenDay(now)) {
    results.springOpen = true;
    for (const agencyId of agencyIds) {
      try {
        results[`spring_${agencyId}`] = await openSpringUpdateForAgency({ agencyId });
      } catch (e) {
        console.error('[clientLifecycleCalendar] spring open failed', agencyId, e?.message || e);
      }
    }
  }

  if (isSpringUpdateDueDay(now)) {
    results.springDue = true;
    for (const agencyId of agencyIds) {
      try {
        results[`spring_due_${agencyId}`] = await markSpringOverdue({ agencyId });
      } catch (e) {
        console.error('[clientLifecycleCalendar] spring due failed', agencyId, e?.message || e);
      }
    }
  }

  if (isJulyRolloverDay(now)) {
    results.julyRollover = true;
    for (const agencyId of agencyIds) {
      try {
        await enableProviderYearUpdateCampaigns({ agencyId });
        await notifyAdminsProviderYearUpdate({ agencyId });
        await prepareCollaborativeYearUpdate({ agencyId });
        results[`rollover_${agencyId}`] = await applyJulyRolloverStatuses({ agencyId });
      } catch (e) {
        console.error('[clientLifecycleCalendar] july rollover failed', agencyId, e?.message || e);
      }
    }
  }

  if (isFallConfirmationDueDay(now)) {
    results.fallDue = true;
    for (const agencyId of agencyIds) {
      try {
        results[`fall_${agencyId}`] = await markFallConfirmationDue({ agencyId });
      } catch (e) {
        console.error('[clientLifecycleCalendar] fall due failed', agencyId, e?.message || e);
      }
    }
  }

  return results;
}

export default { runClientLifecycleCalendarJob };
