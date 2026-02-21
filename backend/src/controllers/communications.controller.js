import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import TwilioNumberAssignment from '../models/TwilioNumberAssignment.model.js';

const canViewAgencySms = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'support' || r === 'admin' || r === 'super_admin' || r === 'clinical_practice_assistant' || r === 'provider_plus';
};

const canViewOwnSms = (role) => {
  const r = String(role || '').toLowerCase();
  return (
    r === 'support' ||
    r === 'admin' ||
    r === 'super_admin' ||
    r === 'clinical_practice_assistant' ||
    r === 'provider_plus' ||
    r === 'schedule_manager' ||
    r === 'provider' ||
    r === 'staff' ||
    r === 'school_staff'
  );
};

const canViewTickets = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'support' || r === 'admin' || r === 'super_admin' || r === 'clinical_practice_assistant' || r === 'provider_plus' || r === 'staff';
};

const isMissingTableError = (err) => {
  const msg = String(err?.message || '');
  return (
    msg.includes("doesn't exist") ||
    msg.includes('ER_NO_SUCH_TABLE') ||
    msg.includes('Unknown column') ||
    msg.includes('ER_BAD_FIELD_ERROR')
  );
};

const normalizePositiveInt = (value) => {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function getAgencyIdsForUser(userId, role, forcedAgencyId) {
  const reqAgency = forcedAgencyId ? Number(forcedAgencyId) : null;
  if (reqAgency) {
    if (String(role || '').toLowerCase() === 'super_admin') return [reqAgency];
    const agencies = await User.getAgencies(userId);
    const ok = (agencies || []).some((a) => Number(a?.id) === reqAgency);
    if (!ok) {
      const err = new Error('Access denied to this agency');
      err.status = 403;
      throw err;
    }
    return [reqAgency];
  }
  if (String(role || '').toLowerCase() === 'super_admin') {
    const [a] = await pool.execute(
      `SELECT id
       FROM agencies
       WHERE (is_archived = FALSE OR is_archived IS NULL)`
    );
    return (a || []).map((r) => Number(r.id)).filter(Boolean);
  }
  const agencies = await User.getAgencies(userId);
  return (agencies || []).map((a) => Number(a?.id)).filter(Boolean);
}

/**
 * Unified communications feed: SMS + platform chat (direct messages).
 * GET /api/communications/feed?limit=75&agencyId?=&organizationId?=
 */
export const getCommunicationsFeed = async (req, res, next) => {
  try {
    const userId = normalizePositiveInt(req.user?.id);
    const role = req.user?.role;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const limitRaw = req.query.limit ? Number.parseInt(String(req.query.limit), 10) : null;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 75;
    const agencyIdParam = req.query.agencyId ? Number.parseInt(String(req.query.agencyId), 10) : null;
    const organizationId = req.query.organizationId ? Number.parseInt(String(req.query.organizationId), 10) : null;
    const isSuperAdmin = String(role || '').toLowerCase() === 'super_admin';
    const includeAllAgencies = isSuperAdmin && !agencyIdParam;

    const agencyIds = await getAgencyIdsForUser(userId, role, agencyIdParam);
    if (!includeAllAgencies && !agencyIds.length) return res.json([]);

    // Chat feed: threads user participates in (scoped optionally to org).
    const chatWhereOrg = organizationId ? ' AND t.organization_id = ?' : '';
    const chatAgencyWhere = includeAllAgencies ? '1=1' : `t.agency_id IN (${agencyIds.map(() => '?').join(',')})`;
    const chatValues = [
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      ...(includeAllAgencies ? [] : agencyIds),
      ...(organizationId ? [organizationId] : [])
    ];
    let chatRows = [];
    try {
      const [rows] = await pool.execute(
        `SELECT t.id AS thread_id,
                t.agency_id,
                t.organization_id,
                org.slug AS organization_slug,
                org.name AS organization_name,
                t.updated_at,
                lm.id AS last_message_id,
                lm.body AS last_message_body,
                lm.created_at AS last_message_at,
                lm.sender_user_id AS last_message_sender_user_id,
                su.first_name AS last_sender_first_name,
                su.last_name AS last_sender_last_name,
                su.role AS last_sender_role,
                r.last_read_message_id,
                td.deleted_at AS thread_deleted_at,
                (
                  SELECT COUNT(*)
                  FROM chat_messages m2
                  WHERE m2.thread_id = t.id
                    AND (r.last_read_message_id IS NULL OR m2.id > r.last_read_message_id)
                    AND m2.sender_user_id <> ?
                    AND NOT EXISTS (
                      SELECT 1 FROM chat_message_deletes d2
                      WHERE d2.user_id = ? AND d2.message_id = m2.id
                    )
                ) AS unread_count
         FROM chat_threads t
         JOIN chat_thread_participants tp ON tp.thread_id = t.id AND tp.user_id = ?
         LEFT JOIN chat_thread_reads r ON r.thread_id = t.id AND r.user_id = ?
         LEFT JOIN chat_thread_deletes td ON td.thread_id = t.id AND td.user_id = ?
         LEFT JOIN chat_messages lm ON lm.id = (
           SELECT m.id
           FROM chat_messages m
           LEFT JOIN chat_message_deletes d ON d.message_id = m.id AND d.user_id = ?
           WHERE m.thread_id = t.id AND d.message_id IS NULL
           ORDER BY m.id DESC
           LIMIT 1
         )
         LEFT JOIN users su ON su.id = lm.sender_user_id
         LEFT JOIN agencies org ON org.id = t.organization_id
         WHERE ${chatAgencyWhere}${chatWhereOrg}
           AND (td.deleted_at IS NULL OR (lm.created_at IS NOT NULL AND lm.created_at > td.deleted_at))
         ORDER BY t.updated_at DESC
         LIMIT ${limit}`,
        chatValues
      );
      chatRows = rows || [];
    } catch (e) {
      if (!isMissingTableError(e)) {
        console.warn('Communications feed chat query failed; returning partial feed:', e?.message || e);
      }
      chatRows = [];
    }

    // Enrich chat rows with "other participant" for display.
    const threadIds = (chatRows || []).map((r) => Number(r.thread_id)).filter(Boolean);
    let participantsByThread = {};
    if (threadIds.length) {
      try {
        const p2 = threadIds.map(() => '?').join(',');
        const [parts] = await pool.execute(
          `SELECT tp.thread_id, u.id AS user_id, u.first_name, u.last_name, u.role
           FROM chat_thread_participants tp
           JOIN users u ON u.id = tp.user_id
           WHERE tp.thread_id IN (${p2})`,
          threadIds
        );
        participantsByThread = (parts || []).reduce((acc, p) => {
          acc[p.thread_id] = acc[p.thread_id] || [];
          acc[p.thread_id].push(p);
          return acc;
        }, {});
      } catch (e) {
        if (!isMissingTableError(e)) {
          console.warn('Communications feed participant query failed; continuing without participants:', e?.message || e);
        }
        participantsByThread = {};
      }
    }

    const chatItems = (chatRows || []).map((r) => {
      const participants = participantsByThread[r.thread_id] || [];
      const other = participants.find((p) => Number(p.user_id) !== Number(userId)) || null;
      const preview = r.last_message_body ? String(r.last_message_body) : '';
      return {
        kind: 'chat',
        thread_id: Number(r.thread_id),
        agency_id: Number(r.agency_id),
        organization_id: r.organization_id ? Number(r.organization_id) : null,
        organization_slug: r.organization_slug || null,
        organization_name: r.organization_name || null,
        other_participant: other
          ? {
              id: Number(other.user_id),
              first_name: other.first_name,
              last_name: other.last_name,
              role: other.role
            }
          : null,
        preview,
        last_message_at: r.last_message_at || r.updated_at,
        unread_count: Number(r.unread_count || 0),
        last_sender_role: r.last_sender_role || null
      };
    });

    // SMS feed:
    // - Admin-like roles can view agency-level SMS safety net.
    // - Provider/staff roles can view only their own SMS rows.
    let smsItems = [];
    if (canViewOwnSms(role) && !organizationId) {
      try {
        let rows = [];
        if (canViewAgencySms(role)) {
          const smsAgencyWhere = includeAllAgencies ? '1=1' : `ml.agency_id IN (${agencyIds.map(() => '?').join(',')})`;
          const [r] = await pool.execute(
            `SELECT ml.*,
                    c.initials AS client_initials,
                    u.first_name AS user_first_name,
                    u.last_name AS user_last_name
             FROM message_logs ml
             LEFT JOIN clients c ON ml.client_id = c.id
             LEFT JOIN users u ON ml.user_id = u.id
             WHERE ${smsAgencyWhere}
             ORDER BY ml.created_at DESC
             LIMIT ?`,
            [...(includeAllAgencies ? [] : agencyIds), limit]
          );
          rows = r || [];
        } else {
          // Provider/staff visibility: own messages + messages to/from their assigned Twilio numbers.
          const roleNorm = String(role || '').toLowerCase();
          const isProviderOrSchoolStaff = roleNorm === 'provider' || roleNorm === 'school_staff';
          let assignedNumberIds = [];
          if (isProviderOrSchoolStaff) {
            const assignments = await TwilioNumberAssignment.listByUserId(userId);
            assignedNumberIds = (assignments || []).map((a) => Number(a.number_id)).filter(Boolean);
          }
          const smsUserClause =
            assignedNumberIds.length > 0
              ? `(ml.user_id = ? OR ml.number_id IN (${assignedNumberIds.map(() => '?').join(',')}))`
              : 'ml.user_id = ?';
          const smsUserParams = assignedNumberIds.length > 0 ? [userId, ...assignedNumberIds] : [userId];

          if (!agencyIds.length) {
            const [r] = await pool.execute(
              `SELECT ml.*,
                      c.initials AS client_initials,
                      u.first_name AS user_first_name,
                      u.last_name AS user_last_name
               FROM message_logs ml
               LEFT JOIN clients c ON ml.client_id = c.id
               LEFT JOIN users u ON ml.user_id = u.id
               WHERE ${smsUserClause}
               ORDER BY ml.created_at DESC
               LIMIT ?`,
              [...smsUserParams, limit]
            );
            rows = r || [];
          } else {
            const placeholders = agencyIds.map(() => '?').join(',');
            const [r] = await pool.execute(
              `SELECT ml.*,
                      c.initials AS client_initials,
                      u.first_name AS user_first_name,
                      u.last_name AS user_last_name
               FROM message_logs ml
               LEFT JOIN clients c ON ml.client_id = c.id
               LEFT JOIN users u ON ml.user_id = u.id
               WHERE ${smsUserClause}
                 AND (ml.agency_id IN (${placeholders}) OR ml.agency_id IS NULL)
               ORDER BY ml.created_at DESC
               LIMIT ?`,
              [...smsUserParams, ...agencyIds, limit]
            );
            rows = r || [];
          }
        }
        smsItems = (rows || []).map((m) => ({
          kind: 'sms',
          id: Number(m.id),
          agency_id: Number(m.agency_id),
          user_id: m.user_id ? Number(m.user_id) : null,
          client_id: m.client_id ? Number(m.client_id) : null,
          direction: m.direction || null,
          preview: String(m.body || ''),
          created_at: m.created_at,
          client_initials: m.client_initials || null,
          user_first_name: m.user_first_name || null,
          user_last_name: m.user_last_name || null
        }));
      } catch (e) {
        if (!isMissingTableError(e)) {
          console.warn('Communications feed SMS query failed; returning without SMS items:', e?.message || e);
        }
        smsItems = [];
      }
    }

    // Ticket feed: only for admin-like roles.
    let ticketItems = [];
    if (canViewTickets(role)) {
      try {
        const ticketAgencyWhere = includeAllAgencies ? '1=1' : `t.agency_id IN (${agencyIds.map(() => '?').join(',')})`;
        const whereOrg = organizationId ? ' AND t.school_organization_id = ?' : '';
        const params = [
          ...(includeAllAgencies ? [] : agencyIds),
          ...(organizationId ? [organizationId] : []),
          limit
        ];
        const [rows] = await pool.execute(
          `SELECT t.id,
                  t.agency_id,
                  t.school_organization_id,
                  t.subject,
                  t.question,
                  t.status,
                  t.created_at,
                  t.answered_at,
                  s.name AS school_name
           FROM support_tickets t
           LEFT JOIN agencies s ON s.id = t.school_organization_id
           WHERE ${ticketAgencyWhere}${whereOrg}
           ORDER BY t.created_at DESC
           LIMIT ?`,
          params
        );
        ticketItems = (rows || []).map((t) => {
          const subj = String(t.subject || 'Support ticket').trim();
          const q = String(t.question || '').trim();
          const preview = q ? `${subj}: ${q}` : subj;
          return {
            kind: 'ticket',
            id: Number(t.id),
            agency_id: Number(t.agency_id),
            school_organization_id: t.school_organization_id ? Number(t.school_organization_id) : null,
            school_name: t.school_name || null,
            status: t.status || null,
            preview: preview.length > 500 ? preview.slice(0, 497) + '...' : preview,
            created_at: t.answered_at || t.created_at
          };
        });
      } catch {
        ticketItems = [];
      }
    }

    // Merge + sort newest first.
    const merged = [...chatItems, ...smsItems, ...ticketItems].sort((a, b) => {
      const at = a.kind === 'chat' ? new Date(a.last_message_at || 0).getTime() : new Date(a.created_at || 0).getTime();
      const bt = b.kind === 'chat' ? new Date(b.last_message_at || 0).getTime() : new Date(b.created_at || 0).getTime();
      return bt - at;
    });

    res.json(merged.slice(0, limit));
  } catch (e) {
    next(e);
  }
};

/**
 * Calls workspace feed (foundation endpoint).
 * GET /api/communications/calls?limit=75&agencyId?=
 */
export const getCallsFeed = async (req, res, next) => {
  try {
    const userId = normalizePositiveInt(req.user?.id);
    const role = req.user?.role;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const limitRaw = req.query.limit ? Number.parseInt(String(req.query.limit), 10) : null;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 75;
    const agencyIdParam = req.query.agencyId ? Number.parseInt(String(req.query.agencyId), 10) : null;
    const isSuperAdmin = String(role || '').toLowerCase() === 'super_admin';
    const includeAllAgencies = isSuperAdmin && !agencyIdParam;
    const agencyIds = await getAgencyIdsForUser(userId, role, agencyIdParam);

    // Admin-like users: agency-scoped call feed.
    if (canViewAgencySms(role)) {
      const whereAgency = includeAllAgencies ? '1=1' : `cl.agency_id IN (${agencyIds.map(() => '?').join(',')})`;
      const params = [...(includeAllAgencies ? [] : agencyIds), limit];
      const [rows] = await pool.execute(
        `SELECT cl.*
         FROM call_logs cl
         WHERE ${whereAgency}
         ORDER BY COALESCE(cl.started_at, cl.created_at) DESC
         LIMIT ?`,
        params
      );
      return res.json({ enabled: true, items: rows || [] });
    }

    // Provider/staff users: own call rows + calls to/from their assigned Twilio numbers.
    const roleNorm = String(role || '').toLowerCase();
    const isProviderOrSchoolStaff = roleNorm === 'provider' || roleNorm === 'school_staff';
    let assignedNumberIds = [];
    if (isProviderOrSchoolStaff) {
      const assignments = await TwilioNumberAssignment.listByUserId(userId);
      assignedNumberIds = (assignments || []).map((a) => Number(a.number_id)).filter(Boolean);
    }

    const numberIdCondition =
      assignedNumberIds.length > 0
        ? ` OR cl.number_id IN (${assignedNumberIds.map(() => '?').join(',')})`
        : '';
    const numberIdParams = assignedNumberIds.length > 0 ? assignedNumberIds : [];

    if (!agencyIds.length) {
      const [rows] = await pool.execute(
        `SELECT cl.*
         FROM call_logs cl
         WHERE cl.user_id = ?${numberIdCondition}
         ORDER BY COALESCE(cl.started_at, cl.created_at) DESC
         LIMIT ?`,
        [userId, ...numberIdParams, limit]
      );
      return res.json({ enabled: true, items: rows || [] });
    }

    const placeholders = agencyIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT cl.*
       FROM call_logs cl
       WHERE (cl.user_id = ?${numberIdCondition})
         AND (cl.agency_id IN (${placeholders}) OR cl.agency_id IS NULL)
       ORDER BY COALESCE(cl.started_at, cl.created_at) DESC
       LIMIT ?`,
      [userId, ...numberIdParams, ...agencyIds, limit]
    );
    return res.json({ enabled: true, items: rows || [] });
  } catch (e) {
    // Voice schema is not available yet in all environments.
    if (isMissingTableError(e)) {
      return res.json({ enabled: false, items: [] });
    }
    next(e);
  }
};

/**
 * Calls analytics (foundation metrics).
 * GET /api/communications/calls/analytics?days=30&agencyId?=
 */
export const getCallsAnalytics = async (req, res, next) => {
  try {
    const userId = normalizePositiveInt(req.user?.id);
    const role = req.user?.role;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const agencyIdParam = req.query.agencyId ? Number.parseInt(String(req.query.agencyId), 10) : null;
    const daysRaw = req.query.days ? Number.parseInt(String(req.query.days), 10) : 30;
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 30;
    const sinceExpr = `DATE_SUB(NOW(), INTERVAL ${days} DAY)`;

    const isSuperAdmin = String(role || '').toLowerCase() === 'super_admin';
    const includeAllAgencies = isSuperAdmin && !agencyIdParam;
    const agencyIds = await getAgencyIdsForUser(userId, role, agencyIdParam);
    const canAgencyView = canViewAgencySms(role);

    let where = `cl.created_at >= ${sinceExpr}`;
    const params = [];
    let voicemailWhere = `cv.created_at >= ${sinceExpr}`;
    const voicemailParams = [];

    if (canAgencyView) {
      if (!includeAllAgencies) {
        if (!agencyIds.length) {
          return res.json({
            enabled: true,
            days,
            summary: { total: 0, inbound: 0, outbound: 0, answered: 0, missed: 0, avgDurationSeconds: 0, voicemailCount: 0 },
            byStatus: []
          });
        }
        where += ` AND cl.agency_id IN (${agencyIds.map(() => '?').join(',')})`;
        params.push(...agencyIds);
        voicemailWhere += ` AND cv.agency_id IN (${agencyIds.map(() => '?').join(',')})`;
        voicemailParams.push(...agencyIds);
      }
    } else {
      const roleNorm = String(role || '').toLowerCase();
      const isProviderOrSchoolStaff = roleNorm === 'provider' || roleNorm === 'school_staff';
      let assignedNumberIds = [];
      if (isProviderOrSchoolStaff) {
        const assignments = await TwilioNumberAssignment.listByUserId(userId);
        assignedNumberIds = (assignments || []).map((a) => Number(a.number_id)).filter(Boolean);
      }
      const numberIdClause =
        assignedNumberIds.length > 0
          ? `(cl.user_id = ? OR cl.number_id IN (${assignedNumberIds.map(() => '?').join(',')}))`
          : 'cl.user_id = ?';
      const numberIdParams = assignedNumberIds.length > 0 ? [userId, ...assignedNumberIds] : [userId];
      where += ` AND ${numberIdClause}`;
      params.push(...numberIdParams);
      voicemailWhere += ` AND cv.user_id = ?`;
      voicemailParams.push(userId);
      if (assignedNumberIds.length > 0) {
        voicemailWhere = voicemailWhere.replace(
          'cv.user_id = ?',
          `(cv.user_id = ? OR EXISTS (SELECT 1 FROM call_logs cl2 WHERE cl2.id = cv.call_log_id AND cl2.number_id IN (${assignedNumberIds.map(() => '?').join(',')})))`
        );
        voicemailParams.push(...assignedNumberIds);
      }
      if (agencyIds.length) {
        where += ` AND (cl.agency_id IN (${agencyIds.map(() => '?').join(',')}) OR cl.agency_id IS NULL)`;
        params.push(...agencyIds);
        voicemailWhere += ` AND (cv.agency_id IN (${agencyIds.map(() => '?').join(',')}) OR cv.agency_id IS NULL)`;
        voicemailParams.push(...agencyIds);
      }
    }

    const [summaryRows] = await pool.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN cl.direction = 'INBOUND' THEN 1 ELSE 0 END) AS inbound,
         SUM(CASE WHEN cl.direction = 'OUTBOUND' THEN 1 ELSE 0 END) AS outbound,
         SUM(CASE WHEN LOWER(COALESCE(cl.status, '')) IN ('completed','in-progress','bridging','answered') THEN 1 ELSE 0 END) AS answered,
         SUM(CASE WHEN LOWER(COALESCE(cl.status, '')) IN ('no-answer','busy','failed','canceled') THEN 1 ELSE 0 END) AS missed,
         AVG(CASE WHEN cl.duration_seconds IS NOT NULL THEN cl.duration_seconds ELSE NULL END) AS avg_duration
       FROM call_logs cl
       WHERE ${where}`,
      params
    );

    const [vmRows] = await pool.execute(
      `SELECT COUNT(*) AS voicemail_count
       FROM call_voicemails cv
       WHERE ${voicemailWhere}`,
      voicemailParams
    );

    const [statusRows] = await pool.execute(
      `SELECT LOWER(COALESCE(cl.status, 'unknown')) AS status, COUNT(*) AS count
       FROM call_logs cl
       WHERE ${where}
       GROUP BY LOWER(COALESCE(cl.status, 'unknown'))
       ORDER BY count DESC`,
      params
    );

    const s = summaryRows?.[0] || {};
    res.json({
      enabled: true,
      days,
      summary: {
        total: Number(s.total || 0),
        inbound: Number(s.inbound || 0),
        outbound: Number(s.outbound || 0),
        answered: Number(s.answered || 0),
        missed: Number(s.missed || 0),
        avgDurationSeconds: Number(s.avg_duration || 0),
        voicemailCount: Number(vmRows?.[0]?.voicemail_count || 0)
      },
      byStatus: (statusRows || []).map((r) => ({ status: r.status, count: Number(r.count || 0) }))
    });
  } catch (e) {
    if (isMissingTableError(e)) {
      return res.json({
        enabled: false,
        days: 30,
        summary: { total: 0, inbound: 0, outbound: 0, answered: 0, missed: 0, avgDurationSeconds: 0, voicemailCount: 0 },
        byStatus: []
      });
    }
    next(e);
  }
};

