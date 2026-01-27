import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';

function safeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function isMissingSchemaError(e) {
  const code = e?.code || '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const msg = String(e?.message || '');
  return msg.includes("doesn't exist") || msg.includes('Unknown column');
}

function makeInClausePlaceholders(count) {
  return Array.from({ length: count }, () => '?').join(',');
}

/**
 * GET /api/dashboard/school-overview?agencyId=123
 *
 * Returns per-school operational stats for the agency's affiliated orgs.
 */
export const getSchoolOverview = async (req, res, next) => {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const affiliated = await OrganizationAffiliation.listActiveOrganizationsForAgency(agencyId);
    const schools = (affiliated || []).filter((o) => {
      const t = String(o?.organization_type || 'agency').toLowerCase();
      return t === 'school' || t === 'program' || t === 'learning';
    });

    const schoolIds = schools.map((s) => safeInt(s?.id)).filter(Boolean);
    const refreshedAt = new Date().toISOString();

    if (schoolIds.length === 0) {
      return res.json({ agencyId, refreshedAt, schools: [] });
    }

    const placeholders = makeInClausePlaceholders(schoolIds.length);

    // Initialize output rows with zeros.
    const bySchoolId = new Map();
    for (const s of schools) {
      const sid = safeInt(s?.id);
      if (!sid) continue;
      bySchoolId.set(sid, {
        school_id: sid,
        school_name: s?.name || null,
        school_slug: s?.slug || s?.portal_url || null,
        organization_type: s?.organization_type || null,
        is_active: s?.is_active !== false,
        // Directory metadata (optional; may be missing on older DBs or when not populated)
        district_name: null,
        school_state: s?.state || null,
        clients_current: 0,
        clients_assigned: 0,
        providers_count: 0,
        provider_days: 0,
        slots_total: 0,
        slots_used: 0,
        slots_available: 0,
        waitlist_count: 0,
        docs_needs_count: 0,
        school_staff_count: 0,
        skills_group_occurring_now: false
      });
    }

    const addCountMap = (rows, keyField, valueField, apply) => {
      for (const r of rows || []) {
        const sid = safeInt(r?.[keyField]);
        if (!sid) continue;
        const target = bySchoolId.get(sid);
        if (!target) continue;
        apply(target, r?.[valueField], r);
      }
    };

    // School district metadata (school_profiles) - best effort.
    try {
      const [rows] = await pool.execute(
        `SELECT school_organization_id AS school_id, district_name
         FROM school_profiles
         WHERE school_organization_id IN (${placeholders})`,
        schoolIds
      );
      for (const r of rows || []) {
        const sid = safeInt(r?.school_id);
        const target = bySchoolId.get(sid);
        if (!target) continue;
        target.district_name = r?.district_name ? String(r.district_name) : null;
      }
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    // Provider/day + slots totals
    try {
      const [rows] = await pool.execute(
        `SELECT
           school_organization_id AS school_id,
           COUNT(DISTINCT provider_user_id) AS providers_count,
           COUNT(*) AS provider_days,
           COALESCE(SUM(slots_total), 0) AS slots_total
         FROM provider_school_assignments
         WHERE is_active = TRUE
           AND school_organization_id IN (${placeholders})
         GROUP BY school_organization_id`,
        schoolIds
      );
      for (const r of rows || []) {
        const sid = safeInt(r?.school_id);
        const target = bySchoolId.get(sid);
        if (!target) continue;
        target.providers_count = Number(r?.providers_count || 0);
        target.provider_days = Number(r?.provider_days || 0);
        target.slots_total = Number(r?.slots_total || 0);
      }
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    // School staff registered with the school (user_agencies)
    try {
      const [rows] = await pool.execute(
        `SELECT
           ua.agency_id AS school_id,
           COUNT(DISTINCT u.id) AS school_staff_count
         FROM user_agencies ua
         JOIN users u ON u.id = ua.user_id
         WHERE ua.agency_id IN (${placeholders})
           AND LOWER(COALESCE(u.role,'')) = 'school_staff'
           AND UPPER(COALESCE(u.status,'')) <> 'ARCHIVED'
         GROUP BY ua.agency_id`,
        schoolIds
      );
      addCountMap(rows, 'school_id', 'school_staff_count', (t, v) => {
        t.school_staff_count = Number(v || 0);
      });
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    // Skills group occurring now
    try {
      const [rows] = await pool.execute(
        `SELECT
           sg.organization_id AS school_id,
           1 AS occurring
         FROM skills_groups sg
         JOIN skills_group_meetings sgm ON sgm.skills_group_id = sg.id
         WHERE sg.organization_id IN (${placeholders})
           AND CURDATE() BETWEEN sg.start_date AND sg.end_date
           AND sgm.weekday = DAYNAME(CURDATE()) COLLATE utf8mb4_unicode_ci
           AND CURTIME() BETWEEN sgm.start_time AND sgm.end_time
         GROUP BY sg.organization_id`,
        schoolIds
      );
      addCountMap(rows, 'school_id', 'occurring', (t) => {
        t.skills_group_occurring_now = true;
      });
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    // Client metrics (prefer multi-org assignment tables; fall back to legacy clients.organization_id).
    let usedMultiOrg = false;
    try {
      // Current + waitlist
      const [rows] = await pool.execute(
        `SELECT
           coa.organization_id AS school_id,
           SUM(CASE WHEN cs.status_key = 'current' THEN 1 ELSE 0 END) AS clients_current,
           SUM(CASE WHEN cs.status_key = 'waitlist' THEN 1 ELSE 0 END) AS waitlist_count
         FROM client_organization_assignments coa
         JOIN clients c ON c.id = coa.client_id
         LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
         WHERE coa.is_active = TRUE
           AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
           AND coa.organization_id IN (${placeholders})
         GROUP BY coa.organization_id`,
        schoolIds
      );
      for (const r of rows || []) {
        const sid = safeInt(r?.school_id);
        const target = bySchoolId.get(sid);
        if (!target) continue;
        target.clients_current = Number(r?.clients_current || 0);
        target.waitlist_count = Number(r?.waitlist_count || 0);
      }

      // Docs / needs count (paperwork status not completed OR ROI expired)
      const [docRows] = await pool.execute(
        `SELECT
           coa.organization_id AS school_id,
           SUM(
             CASE
               WHEN c.paperwork_status_id IS NULL THEN 1
               WHEN ps.status_key <> 'completed' THEN 1
               WHEN c.roi_expires_at IS NOT NULL AND c.roi_expires_at < CURDATE() THEN 1
               ELSE 0
             END
           ) AS docs_needs_count
         FROM client_organization_assignments coa
         JOIN clients c ON c.id = coa.client_id
         LEFT JOIN paperwork_statuses ps ON ps.id = c.paperwork_status_id
         WHERE coa.is_active = TRUE
           AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
           AND coa.organization_id IN (${placeholders})
         GROUP BY coa.organization_id`,
        schoolIds
      );
      addCountMap(docRows, 'school_id', 'docs_needs_count', (t, v) => {
        t.docs_needs_count = Number(v || 0);
      });

      usedMultiOrg = true;
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
      usedMultiOrg = false;
    }

    if (!usedMultiOrg) {
      try {
        const [rows] = await pool.execute(
          `SELECT
             c.organization_id AS school_id,
             SUM(CASE WHEN cs.status_key = 'current' THEN 1 ELSE 0 END) AS clients_current,
             SUM(CASE WHEN cs.status_key = 'waitlist' THEN 1 ELSE 0 END) AS waitlist_count,
             SUM(
               CASE
                 WHEN c.paperwork_status_id IS NULL THEN 1
                 WHEN ps.status_key <> 'completed' THEN 1
                 WHEN c.roi_expires_at IS NOT NULL AND c.roi_expires_at < CURDATE() THEN 1
                 ELSE 0
               END
             ) AS docs_needs_count
           FROM clients c
           LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
           LEFT JOIN paperwork_statuses ps ON ps.id = c.paperwork_status_id
           WHERE UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
             AND c.organization_id IN (${placeholders})
           GROUP BY c.organization_id`,
          schoolIds
        );
        for (const r of rows || []) {
          const sid = safeInt(r?.school_id);
          const target = bySchoolId.get(sid);
          if (!target) continue;
          target.clients_current = Number(r?.clients_current || 0);
          target.waitlist_count = Number(r?.waitlist_count || 0);
          target.docs_needs_count = Number(r?.docs_needs_count || 0);
        }
      } catch (e) {
        if (!isMissingSchemaError(e)) throw e;
      }
    }

    // Provider assignment / used slots (prefer multi-provider assignment tables).
    let usedMultiProvider = false;
    try {
      // Assigned clients (distinct)
      const [rows] = await pool.execute(
        `SELECT
           cpa.organization_id AS school_id,
           COUNT(DISTINCT cpa.client_id) AS clients_assigned
         FROM client_provider_assignments cpa
         JOIN clients c ON c.id = cpa.client_id
         WHERE cpa.is_active = TRUE
           AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
           AND cpa.organization_id IN (${placeholders})
         GROUP BY cpa.organization_id`,
        schoolIds
      );
      addCountMap(rows, 'school_id', 'clients_assigned', (t, v) => {
        t.clients_assigned = Number(v || 0);
      });

      // Slots used (provider/day based; count assignment rows with day+provider)
      const [usedRows] = await pool.execute(
        `SELECT
           cpa.organization_id AS school_id,
           COUNT(*) AS slots_used
         FROM client_provider_assignments cpa
         JOIN clients c ON c.id = cpa.client_id
         WHERE cpa.is_active = TRUE
           AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
           AND cpa.organization_id IN (${placeholders})
           AND cpa.provider_user_id IS NOT NULL
           AND cpa.service_day IS NOT NULL
         GROUP BY cpa.organization_id`,
        schoolIds
      );
      addCountMap(usedRows, 'school_id', 'slots_used', (t, v) => {
        t.slots_used = Number(v || 0);
      });

      usedMultiProvider = true;
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
      usedMultiProvider = false;
    }

    if (!usedMultiProvider) {
      try {
        const [rows] = await pool.execute(
          `SELECT
             c.organization_id AS school_id,
             SUM(CASE WHEN c.provider_id IS NOT NULL THEN 1 ELSE 0 END) AS clients_assigned,
             SUM(CASE WHEN c.provider_id IS NOT NULL AND c.service_day IS NOT NULL THEN 1 ELSE 0 END) AS slots_used
           FROM clients c
           WHERE UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
             AND c.organization_id IN (${placeholders})
           GROUP BY c.organization_id`,
          schoolIds
        );
        for (const r of rows || []) {
          const sid = safeInt(r?.school_id);
          const target = bySchoolId.get(sid);
          if (!target) continue;
          target.clients_assigned = Number(r?.clients_assigned || 0);
          target.slots_used = Number(r?.slots_used || 0);
        }
      } catch (e) {
        if (!isMissingSchemaError(e)) throw e;
      }
    }

    // Final derived slots_available (never negative)
    for (const t of bySchoolId.values()) {
      const total = Number(t.slots_total || 0);
      const used = Number(t.slots_used || 0);
      t.slots_available = Math.max(0, total - used);
    }

    const out = schoolIds
      .map((sid) => bySchoolId.get(sid))
      .filter(Boolean);

    res.json({ agencyId, refreshedAt, schools: out });
  } catch (e) {
    next(e);
  }
};

