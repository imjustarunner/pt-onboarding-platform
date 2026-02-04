import pool from '../config/database.js';
import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';

function isMissingSchemaError(e) {
  const code = e?.code || '';
  return code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR';
}

function safeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/dashboard/agency-specs?agencyId=123
 *
 * Returns at-a-glance agency/org metrics for admin dashboards.
 */
export const getAgencySpecs = async (req, res, next) => {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    // Verify access: super_admin can see all; others must have membership.
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = (userAgencies || []).some((a) => Number(a?.id) === Number(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }

    const result = {
      agencyId,
      refreshedAt: new Date().toISOString(),
      activeEmployees: 0,
      pendingEmployees: 0,
      undoneChecklistItemsActive: 0,
      unreadNotifications: 0,
      recentPayrollTotal: 0,
      recentPayrollPeriod: null
    };

    // Active + pending employee counts
    try {
      const [rows] = await pool.execute(
        `SELECT
           SUM(CASE WHEN UPPER(COALESCE(u.status,'')) = 'ACTIVE_EMPLOYEE' THEN 1 ELSE 0 END) AS activeEmployees,
           SUM(CASE
                 WHEN UPPER(COALESCE(u.status,'')) NOT IN ('ACTIVE_EMPLOYEE','ARCHIVED') THEN 1
                 ELSE 0
               END) AS pendingEmployees
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ?`,
        [agencyId]
      );
      result.activeEmployees = Number(rows?.[0]?.activeEmployees || 0);
      result.pendingEmployees = Number(rows?.[0]?.pendingEmployees || 0);
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    // Undone checklist items (active employees only), scoped to platform + this agency's items
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS c
         FROM user_custom_checklist_assignments uca
         JOIN users u ON uca.user_id = u.id
         JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
         JOIN custom_checklist_items cci ON uca.checklist_item_id = cci.id
         WHERE uca.is_completed = FALSE
           AND UPPER(COALESCE(u.status,'')) = 'ACTIVE_EMPLOYEE'
           AND (cci.agency_id IS NULL OR cci.agency_id = ?)`,
        [agencyId, agencyId]
      );
      result.undoneChecklistItemsActive = Number(rows?.[0]?.c || 0);
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    // Unread notifications (counts endpoint logic: excludes muted)
    try {
      const counts = await Notification.getCountsByAgency([agencyId]);
      result.unreadNotifications = Number(counts?.[agencyId] || 0);
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    // Recent payroll: last posted/finalized pay period total
    try {
      const [periodRows] = await pool.execute(
        `SELECT id, label, period_start, period_end, status
         FROM payroll_periods
         WHERE agency_id = ?
           AND status IN ('posted', 'finalized')
         ORDER BY period_end DESC, id DESC
         LIMIT 1`,
        [agencyId]
      );
      const period = periodRows?.[0] || null;
      if (period?.id) {
        result.recentPayrollPeriod = {
          id: period.id,
          label: period.label,
          period_start: period.period_start,
          period_end: period.period_end,
          status: period.status
        };
        const [sumRows] = await pool.execute(
          `SELECT COALESCE(SUM(ps.total_amount), 0) AS total
           FROM payroll_summaries ps
           WHERE ps.agency_id = ?
             AND ps.payroll_period_id = ?`,
          [agencyId, period.id]
        );
        result.recentPayrollTotal = Number(sumRows?.[0]?.total || 0);
      } else {
        result.recentPayrollTotal = 0;
        result.recentPayrollPeriod = null;
      }
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
      result.recentPayrollTotal = 0;
      result.recentPayrollPeriod = null;
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/dashboard/org-overview-summary?agencyId=123
 *
 * Lightweight org affiliation counts used to drive admin dashboard quick actions.
 */
export const getOrgOverviewSummary = async (req, res, next) => {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const affiliated = await OrganizationAffiliation.listActiveOrganizationsForAgency(agencyId);
    const counts = { school: 0, program: 0, learning: 0, other: 0 };    for (const o of affiliated || []) {
      const t = String(o?.organization_type || '').trim().toLowerCase();
      if (t === 'school') counts.school += 1;
      else if (t === 'program') counts.program += 1;
      else if (t === 'learning') counts.learning += 1;
      else counts.other += 1;
    }

    res.json({
      agencyId,
      refreshedAt: new Date().toISOString(),
      counts,
      totalAffiliatedOrganizations: (affiliated || []).length
    });
  } catch (error) {
    next(error);
  }
};
