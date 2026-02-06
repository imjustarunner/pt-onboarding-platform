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

function parseJsonMaybe(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

async function getSchoolPortalNotificationsProgress(userId) {
  const uid = safeInt(userId);
  if (!uid) return {};
  try {
    const [rows] = await pool.execute(
      `SELECT school_portal_notifications_progress
       FROM user_preferences
       WHERE user_id = ?
       LIMIT 1`,
      [uid]
    );
    const raw = rows?.[0]?.school_portal_notifications_progress ?? null;
    const parsed = parseJsonMaybe(raw) || raw;
    if (parsed && typeof parsed === 'object' && parsed.by_org) {
      return parsed.by_org || {};
    }
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function buildLastSeenUnion(orgIds, lastSeenByOrg) {
  if (!orgIds.length) return { sql: 'SELECT NULL AS org_id, NULL AS last_seen', params: [] };
  const parts = orgIds.map((_, idx) => (idx === 0 ? 'SELECT ? AS org_id, ? AS last_seen' : 'UNION ALL SELECT ?, ?'));
  const params = [];
  for (const orgId of orgIds) {
    const raw = lastSeenByOrg?.[orgId] || lastSeenByOrg?.[String(orgId)];
    const lastSeen = raw ? String(raw) : '1970-01-01 00:00:00';
    params.push(orgId, lastSeen);
  }
  return { sql: parts.join(' '), params };
}

/**
 * GET /api/dashboard/school-overview?agencyId=123&orgType=school|program|learning
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
    const requestedType = String(req.query.orgType || '').trim().toLowerCase();
    const allowedTypes = new Set(['school', 'program', 'learning']);
    const orgTypeFilter = allowedTypes.has(requestedType) ? requestedType : null;

    const schools = (affiliated || []).filter((o) => {
      const t = String(o?.organization_type || 'agency').toLowerCase();
      if (!(t === 'school' || t === 'program' || t === 'learning')) return false;
      // Program Overview should include learning orgs (but not schools).
      if (orgTypeFilter === 'program') return t === 'program' || t === 'learning';
      return orgTypeFilter ? t === orgTypeFilter : true;
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
        is_archived: !!s?.is_archived,
        archived_at: s?.archived_at || null,
        // Directory metadata (optional; may be missing on older DBs or when not populated)
        district_name: null,
        school_state: s?.state || null,
        clients_current: 0,
        clients_packet: 0,
        clients_screener: 0,
        clients_assigned: 0,
        providers_count: 0,
        provider_days: 0,
        notifications_count: 0,
        notifications_comments_count: 0,
        notifications_messages_count: 0,
        slots_total: 0,
        slots_used: 0,
        slots_available: 0,
        waitlist_count: 0,
        docs_needs_count: 0,
        school_staff_count: 0,
        skills_groups_count: 0,
        skills_clients_unassigned_count: 0,
        active_skills_groups: [],
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

    // Skills groups count (any)
    try {
      const [rows] = await pool.execute(
        `SELECT
           sg.organization_id AS school_id,
           COUNT(DISTINCT sg.id) AS skills_groups_count
         FROM skills_groups sg
         WHERE sg.organization_id IN (${placeholders})
         GROUP BY sg.organization_id`,
        schoolIds
      );
      addCountMap(rows, 'school_id', 'skills_groups_count', (t, v) => {
        t.skills_groups_count = Number(v || 0);
      });
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    // Active skills groups participant counts (per group) for badge bubbles on the overview card.
    // "Active" means within date range (start_date..end_date). This does not require a meeting occurring now.
    try {
      const [rows] = await pool.execute(
        `SELECT
           sg.organization_id AS school_id,
           sg.id AS skills_group_id,
           COUNT(DISTINCT sgc.client_id) AS participants_count
         FROM skills_groups sg
         LEFT JOIN skills_group_clients sgc ON sgc.skills_group_id = sg.id
         WHERE sg.organization_id IN (${placeholders})
           AND sg.start_date <= CURDATE()
           AND sg.end_date >= CURDATE()
         GROUP BY sg.organization_id, sg.id
         ORDER BY sg.organization_id ASC, sg.id ASC`,
        schoolIds
      );
      for (const r of rows || []) {
        const sid = safeInt(r?.school_id);
        const target = sid ? bySchoolId.get(sid) : null;
        if (!target) continue;
        const gid = safeInt(r?.skills_group_id);
        if (!gid) continue;
        const cnt = Number(r?.participants_count || 0);
        target.active_skills_groups = Array.isArray(target.active_skills_groups) ? target.active_skills_groups : [];
        target.active_skills_groups.push({ skills_group_id: gid, participants_count: cnt });
      }
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    // Skills clients (skills=true) not assigned to any skills group under the org.
    try {
      const [rows] = await pool.execute(
        `SELECT
           coa.organization_id AS school_id,
           COUNT(DISTINCT c.id) AS skills_clients_unassigned_count
         FROM client_organization_assignments coa
         JOIN clients c ON c.id = coa.client_id
         LEFT JOIN skills_group_clients sgc ON sgc.client_id = c.id
         LEFT JOIN skills_groups sg
           ON sg.id = sgc.skills_group_id AND sg.organization_id = coa.organization_id
         WHERE coa.is_active = TRUE
           AND coa.organization_id IN (${placeholders})
           AND c.skills = TRUE
           AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
           AND sg.id IS NULL
         GROUP BY coa.organization_id`,
        schoolIds
      );
      addCountMap(rows, 'school_id', 'skills_clients_unassigned_count', (t, v) => {
        t.skills_clients_unassigned_count = Number(v || 0);
      });
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
      try {
        const [rows] = await pool.execute(
          `SELECT
             c.organization_id AS school_id,
             COUNT(DISTINCT c.id) AS skills_clients_unassigned_count
           FROM clients c
           LEFT JOIN skills_group_clients sgc ON sgc.client_id = c.id
           LEFT JOIN skills_groups sg
             ON sg.id = sgc.skills_group_id AND sg.organization_id = c.organization_id
           WHERE c.organization_id IN (${placeholders})
             AND c.skills = TRUE
             AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
             AND sg.id IS NULL
           GROUP BY c.organization_id`,
          schoolIds
        );
        addCountMap(rows, 'school_id', 'skills_clients_unassigned_count', (t, v) => {
          t.skills_clients_unassigned_count = Number(v || 0);
        });
      } catch (inner) {
        if (!isMissingSchemaError(inner)) throw inner;
      }
    }

    // Client metrics (prefer multi-org assignment tables; fall back to legacy clients.organization_id).
    let usedMultiOrg = false;
    try {
      // Current + waitlist
      const [rows] = await pool.execute(
        `SELECT
           coa.organization_id AS school_id,
           SUM(CASE WHEN cs.status_key = 'current' THEN 1 ELSE 0 END) AS clients_current,
           SUM(CASE WHEN cs.status_key = 'packet' THEN 1 ELSE 0 END) AS clients_packet,
           SUM(CASE WHEN cs.status_key = 'screener' THEN 1 ELSE 0 END) AS clients_screener,
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
        target.clients_packet = Number(r?.clients_packet || 0);
        target.clients_screener = Number(r?.clients_screener || 0);
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
             SUM(CASE WHEN cs.status_key = 'packet' THEN 1 ELSE 0 END) AS clients_packet,
             SUM(CASE WHEN cs.status_key = 'screener' THEN 1 ELSE 0 END) AS clients_screener,
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
          target.clients_packet = Number(r?.clients_packet || 0);
          target.clients_screener = Number(r?.clients_screener || 0);
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

    // School portal notifications (unread since user's last seen per org)
    try {
      const progress = await getSchoolPortalNotificationsProgress(req.user?.id);
      const lastSeenByOrg = {};
      for (const sid of schoolIds) {
        const key = String(sid);
        lastSeenByOrg[sid] = progress?.[key] || null;
      }
      const lastSeen = buildLastSeenUnion(schoolIds, lastSeenByOrg);
      const addNotificationCounts = (rows) => {
        addCountMap(rows, 'school_id', 'count', (t, v) => {
          t.notifications_count = Number(t.notifications_count || 0) + Number(v || 0);
        });
      };

      // Announcements
      try {
        const [rows] = await pool.execute(
          `SELECT
             a.organization_id AS school_id,
             COUNT(*) AS count
           FROM school_portal_announcements a
           JOIN (${lastSeen.sql}) ls ON ls.org_id = a.organization_id
           WHERE a.organization_id IN (${placeholders})
             AND a.created_at > ls.last_seen
           GROUP BY a.organization_id`,
          [...lastSeen.params, ...schoolIds]
        );
        addNotificationCounts(rows);
      } catch (e) {
        if (!isMissingSchemaError(e)) throw e;
      }

      // Client status events
      try {
        const [rows] = await pool.execute(
          `SELECT
             coa.organization_id AS school_id,
             COUNT(*) AS count
           FROM client_status_history h
           JOIN client_organization_assignments coa
             ON coa.client_id = h.client_id
            AND coa.is_active = TRUE
           JOIN (${lastSeen.sql}) ls ON ls.org_id = coa.organization_id
           WHERE coa.organization_id IN (${placeholders})
             AND h.changed_at > ls.last_seen
           GROUP BY coa.organization_id`,
          [...lastSeen.params, ...schoolIds]
        );
        addNotificationCounts(rows);
      } catch (e) {
        if (!isMissingSchemaError(e)) throw e;
      }

      // Client comments
      try {
        const [rows] = await pool.execute(
          `SELECT
             coa.organization_id AS school_id,
             COUNT(*) AS count
           FROM client_notes n
           JOIN client_organization_assignments coa
             ON coa.client_id = n.client_id
            AND coa.is_active = TRUE
           JOIN (${lastSeen.sql}) ls ON ls.org_id = coa.organization_id
           WHERE coa.organization_id IN (${placeholders})
             AND n.is_internal_only = FALSE
             AND (n.category IS NULL OR n.category = 'comment')
             AND n.created_at > ls.last_seen
           GROUP BY coa.organization_id`,
          [...lastSeen.params, ...schoolIds]
        );
        addNotificationCounts(rows);
        addCountMap(rows, 'school_id', 'count', (t, v) => {
          t.notifications_comments_count = Number(t.notifications_comments_count || 0) + Number(v || 0);
        });
      } catch (e) {
        if (!isMissingSchemaError(e)) throw e;
      }

      // Client messages (support tickets)
      try {
        const [rows] = await pool.execute(
          `SELECT
             t.school_organization_id AS school_id,
             COUNT(*) AS count
           FROM support_ticket_messages m
           JOIN support_tickets t ON t.id = m.ticket_id
           JOIN (${lastSeen.sql}) ls ON ls.org_id = t.school_organization_id
           WHERE t.school_organization_id IN (${placeholders})
             AND t.client_id IS NOT NULL
             AND m.created_at > ls.last_seen
           GROUP BY t.school_organization_id`,
          [...lastSeen.params, ...schoolIds]
        );
        addNotificationCounts(rows);
        addCountMap(rows, 'school_id', 'count', (t, v) => {
          t.notifications_messages_count = Number(t.notifications_messages_count || 0) + Number(v || 0);
        });
      } catch (e) {
        if (!isMissingSchemaError(e)) throw e;
      }
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    const out = schoolIds
      .map((sid) => bySchoolId.get(sid))
      .filter(Boolean);

    res.json({ agencyId, refreshedAt, schools: out });
  } catch (e) {
    next(e);
  }
};

