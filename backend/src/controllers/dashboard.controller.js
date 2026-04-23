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
      activePatients: 0,
      sessionsToday: 0,
      openTasks: 0,           // Will be populated from real support ticket count
      openAlerts: 0,
      revenueMTD: 0,          // Real SUM from payroll or billing
      unreadNotifications: 0,
      recentPayrollTotal: 0,
      recentPayrollPeriod: null,
      activityFeed: [],
      tasksSummary: [],
      trends: []              // Real 7-day patient + session trends for charts
    };

    // Active + pending employee counts + tenant-scoped patient metrics for new admin dashboard
    const tenantIds = req.tenantAgencyIds && Array.isArray(req.tenantAgencyIds) ? req.tenantAgencyIds : [agencyId];
    const tenantPlaceholders = tenantIds.map(() => '?').join(',');
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
         WHERE ua.agency_id IN (${tenantPlaceholders})`,
        [...tenantIds]
      );
      result.activeEmployees = Number(rows?.[0]?.activeEmployees || 0);
      result.pendingEmployees = Number(rows?.[0]?.pendingEmployees || 0);
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    // Active patients/clients (for Burning Sage / healthcare tenant dashboard)
    try {
      const [patientRows] = await pool.execute(
        `SELECT COUNT(DISTINCT c.id) AS activePatients
         FROM clients c
         WHERE c.agency_id IN (${tenantPlaceholders})
           AND UPPER(COALESCE(c.status, '')) NOT IN ('ARCHIVED', 'INACTIVE')`,
        [...tenantIds]
      );
      result.activePatients = Number(patientRows?.[0]?.activePatients || 0);
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    // Sessions today (from company_events or skill_builders sessions)
    try {
      const today = new Date().toISOString().split('T')[0];
      const [sessionRows] = await pool.execute(
        `SELECT COUNT(*) AS sessionsToday
         FROM company_events 
         WHERE agency_id IN (${tenantPlaceholders})
           AND DATE(starts_at) = ?`,
        [...tenantIds, today]
      );
      result.sessionsToday = Number(sessionRows?.[0]?.sessionsToday || 0);
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

    // Unread notifications (counts endpoint logic: excludes muted) - scoped to tenant tree
    try {
      const counts = await Notification.getCountsByAgency(tenantIds);
      // Sum across tenant for new dashboard
      result.unreadNotifications = tenantIds.reduce((sum, id) => sum + Number(counts?.[id] || 0), 0);
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    // Real open tasks/alerts from support tickets (scoped via middleware + tenant tree)
    try {
      const [ticketCountRows] = await pool.execute(
        `SELECT COUNT(*) AS openTasks
         FROM support_tickets t
         WHERE t.agency_id IN (${tenantPlaceholders})
           AND LOWER(COALESCE(t.status, '')) = 'open'`,
        [...tenantIds]
      );
      result.openTasks = Number(ticketCountRows?.[0]?.openTasks || 0);
      result.openAlerts = Math.floor(result.openTasks * 0.3); // approximate alerts from open tickets
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
      result.openTasks = 0;
      result.openAlerts = 0;
    }

    // Real revenue MTD from payroll summaries (extend with billing_invoices if available)
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      const [revenueRows] = await pool.execute(
        `SELECT COALESCE(SUM(ps.total_amount), 0) AS revenueMTD
         FROM payroll_summaries ps
         JOIN payroll_periods pp ON pp.id = ps.payroll_period_id
         WHERE ps.agency_id IN (${tenantPlaceholders})
           AND pp.period_start LIKE ?`,
        [...tenantIds, currentMonth + '%']
      );
      result.revenueMTD = Number(revenueRows?.[0]?.revenueMTD || 0);
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
      result.revenueMTD = 0;
    }

    // Real activity feed from notifications (or extend with dedicated log)
    try {
      const [activityRows] = await pool.execute(
        `SELECT 
           DATE_FORMAT(n.created_at, '%H:%i') as time,
           n.type as status,
           n.message as description
         FROM notifications n
         WHERE n.agency_id IN (${tenantPlaceholders})
         ORDER BY n.created_at DESC LIMIT 5`,
        [...tenantIds]
      );
      result.activityFeed = activityRows || [];
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
      result.activityFeed = [];
    }

    // Build tasks summary from real data (open support tickets + undone checklist items)
    result.tasksSummary = [];
    if (result.openTasks > 0) {
      result.tasksSummary.push({ title: 'Open Support Tickets', count: result.openTasks });
    }
    if (result.undoneChecklistItemsActive > 0) {
      result.tasksSummary.push({ title: 'Pending Onboarding Tasks', count: result.undoneChecklistItemsActive });
    }

    // Real trend data for charts (7-day active patients + sessions)
    const trends = [];
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateStr = sevenDaysAgo.toISOString().split('T')[0];
      const [trendRows] = await pool.execute(
        `SELECT DATE(created_at) as date, COUNT(DISTINCT id) as active_patients
         FROM clients 
         WHERE agency_id IN (${tenantPlaceholders})
           AND created_at >= ?
         GROUP BY DATE(created_at)
         ORDER BY date`,
        [...tenantIds, dateStr]
      );
      trends.push(...(trendRows || []).map(r => ({
        date: String(r.date),
        activePatients: Number(r.active_patients || 0),
        sessions: 0 // extend with session trend if needed
      })));
    } catch (e) {
      if (!isMissingSchemaError(e)) console.error('Trend query failed:', e);
    }
    result.trends = trends.length > 0 ? trends : [];

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
 * GET /api/dashboard/schedule-snapshot?agencyId=123&date=YYYY-MM-DD
 *
 * Returns today's (or given date's) sessions from company_events for the tenant,
 * with provider and client info, scoped to the tenant tree.
 */
export const getScheduleSnapshot = async (req, res, next) => {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const tenantIds = req.tenantAgencyIds && Array.isArray(req.tenantAgencyIds) ? req.tenantAgencyIds : [agencyId];
    const tenantPlaceholders = tenantIds.map(() => '?').join(',');
    const date = String(req.query.date || new Date().toISOString().split('T')[0]);

    const sessions = [];
    try {
      // Primary: skill builder group events with provider roster
      const [sgRows] = await pool.execute(
        `SELECT 
           ce.id, ce.title, ce.starts_at, ce.ends_at, ce.event_type,
           CONCAT(u.first_name, ' ', u.last_name) AS provider_name,
           u.role AS provider_role,
           c.initials AS client_initials,
           c.full_name AS client_name,
           sg.name AS group_name
         FROM company_events ce
         LEFT JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
         LEFT JOIN skills_group_providers sgp ON sgp.skills_group_id = sg.id
         LEFT JOIN users u ON u.id = sgp.provider_user_id
         LEFT JOIN clients c ON c.id = ce.client_id
         WHERE ce.agency_id IN (${tenantPlaceholders})
           AND DATE(ce.starts_at) = ?
           AND (ce.is_active IS NULL OR ce.is_active = TRUE)
         ORDER BY ce.starts_at ASC
         LIMIT 20`,
        [...tenantIds, date]
      );
      for (const row of sgRows || []) {
        const startTime = row.starts_at ? new Date(row.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
        const endTime = row.ends_at ? new Date(row.ends_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
        sessions.push({
          id: row.id,
          time: startTime && endTime ? `${startTime} - ${endTime}` : startTime || 'TBD',
          provider: row.provider_name || row.group_name || 'TBD',
          client: row.client_name || row.client_initials || row.group_name || row.title || 'Group Session',
          type: String(row.event_type || 'session').toLowerCase().replace(/_/g, ' ')
        });
      }
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    res.json({ date, sessions, total: sessions.length });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/dashboard/platform-tenant-summary
 *
 * Super-admin only. Returns all root-level agency tenants with real aggregated metrics
 * for the platform dashboard tenant filter cards.
 */
export const getPlatformTenantSummary = async (req, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }

    // Get all root agencies (organization_type = 'agency')
    const [agencyRows] = await pool.execute(
      `SELECT id, name, slug, portal_url, logo_url, organization_type
       FROM agencies
       WHERE LOWER(COALESCE(organization_type, 'agency')) = 'agency'
       ORDER BY name ASC`
    );
    const tenants = agencyRows || [];

    // For each tenant, get real aggregated metrics in parallel
    const summaries = await Promise.all(tenants.map(async (agency) => {
      const aid = Number(agency.id);
      let activePatients = 0, activeEmployees = 0, openTasks = 0, unreadNotifications = 0;

      try {
        const [[pr]] = await pool.execute(
          `SELECT COUNT(DISTINCT id) AS cnt FROM clients 
           WHERE agency_id = ? AND UPPER(COALESCE(status, '')) NOT IN ('ARCHIVED', 'INACTIVE')`,
          [aid]
        );
        activePatients = Number(pr?.cnt || 0);
      } catch { /* schema missing */ }

      try {
        const [[er]] = await pool.execute(
          `SELECT SUM(CASE WHEN UPPER(COALESCE(u.status,'')) = 'ACTIVE_EMPLOYEE' THEN 1 ELSE 0 END) AS cnt
           FROM users u JOIN user_agencies ua ON ua.user_id = u.id WHERE ua.agency_id = ?`,
          [aid]
        );
        activeEmployees = Number(er?.cnt || 0);
      } catch { /* schema missing */ }

      try {
        const [[tr]] = await pool.execute(
          `SELECT COUNT(*) AS cnt FROM support_tickets 
           WHERE agency_id = ? AND LOWER(COALESCE(status,'')) = 'open'`,
          [aid]
        );
        openTasks = Number(tr?.cnt || 0);
      } catch { /* schema missing */ }

      try {
        const counts = await Notification.getCountsByAgency([aid]);
        unreadNotifications = Number(counts?.[aid] || 0);
      } catch { /* notifications table may be missing */ }

      return {
        id: aid,
        name: agency.name,
        slug: agency.slug || agency.portal_url || '',
        logoUrl: agency.logo_url || null,
        activePatients,
        activeEmployees,
        openTasks,
        unreadNotifications
      };
    }));

    res.json({ refreshedAt: new Date().toISOString(), tenants: summaries });
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
    const counts = { school: 0, program: 0, learning: 0, other: 0 };
    for (const o of affiliated || []) {
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