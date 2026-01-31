import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import Notification from '../models/Notification.model.js';

async function resolveActiveAgencyIdForOrg(orgId) {
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
    null
  );
}

async function ensureOrgAccess(req, schoolOrganizationId) {
  const sid = parseInt(schoolOrganizationId, 10);
  if (!sid) return { ok: false, status: 400, message: 'Invalid schoolOrganizationId' };

  const org = await Agency.findById(sid);
  if (!org) return { ok: false, status: 404, message: 'Organization not found' };

  if (req.user?.role !== 'super_admin') {
    const orgs = await User.getAgencies(req.user.id);
    const hasDirect = (orgs || []).some((o) => parseInt(o.id, 10) === sid);
    if (!hasDirect) {
      const role = String(req.user?.role || '').toLowerCase();
      const canUseAgencyAffiliation = role === 'admin' || role === 'support' || role === 'staff';
      if (!canUseAgencyAffiliation) return { ok: false, status: 403, message: 'Access denied' };
      const activeAgencyId = await resolveActiveAgencyIdForOrg(sid);
      const hasAgency = activeAgencyId
        ? (orgs || []).some((o) => parseInt(o.id, 10) === parseInt(activeAgencyId, 10))
        : false;
      if (!hasAgency) return { ok: false, status: 403, message: 'Access denied' };
    }
  }

  return { ok: true, org, schoolOrganizationId: sid };
}

const isAgencyAdminUser = (req) => {
  const r = String(req.user?.role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin' || r === 'support' || r === 'staff';
};

const isSuperAdmin = (req) => String(req.user?.role || '').toLowerCase() === 'super_admin';

function parseBool(v) {
  if (v === true || v === false) return v;
  if (v === 1 || v === 0) return v === 1;
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return null;
}

export const listMySupportTickets = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.*,
              u.first_name AS answered_by_first_name,
              u.last_name AS answered_by_last_name,
              s.name AS school_name
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.answered_by_user_id
       LEFT JOIN agencies s ON s.id = t.school_organization_id
       WHERE t.created_by_user_id = ?
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const listSupportTicketsQueue = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only admin/support can view the support ticket queue' } });
    }

    const schoolOrganizationId = req.query?.schoolOrganizationId ? parseInt(req.query.schoolOrganizationId, 10) : null;
    const status = req.query?.status ? String(req.query.status).trim().toLowerCase() : null;
    const mine = parseBool(req.query?.mine);
    const qRaw = req.query?.q ? String(req.query.q) : '';
    const q = qRaw.trim().slice(0, 120);

    const where = [];
    const params = [];

    if (schoolOrganizationId) {
      const access = await ensureOrgAccess(req, schoolOrganizationId);
      if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
      where.push('t.school_organization_id = ?');
      params.push(schoolOrganizationId);
    }

    if (status) {
      where.push('LOWER(t.status) = ?');
      params.push(status);
    }

    // "My tickets" = claimed by current user.
    if (mine === true) {
      where.push('t.claimed_by_user_id = ?');
      params.push(req.user.id);
    }

    // Basic search across subject/question + school name
    if (q) {
      where.push('(t.subject LIKE ? OR t.question LIKE ? OR s.name LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const sql = `
      SELECT t.*,
             cb.first_name AS created_by_first_name,
             cb.last_name AS created_by_last_name,
             ab.first_name AS answered_by_first_name,
             ab.last_name AS answered_by_last_name,
             cl.first_name AS claimed_by_first_name,
             cl.last_name AS claimed_by_last_name,
             s.name AS school_name
      FROM support_tickets t
      LEFT JOIN users cb ON cb.id = t.created_by_user_id
      LEFT JOIN users ab ON ab.id = t.answered_by_user_id
      LEFT JOIN users cl ON cl.id = t.claimed_by_user_id
      LEFT JOIN agencies s ON s.id = t.school_organization_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY
        CASE WHEN LOWER(t.status) = 'open' THEN 0 ELSE 1 END,
        t.created_at DESC
    `;

    const [rows] = await pool.execute(sql, params);
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const createSupportTicket = async (req, res, next) => {
  try {
    const schoolOrganizationId = parseInt(req.body?.schoolOrganizationId, 10);
    const subject = req.body?.subject ? String(req.body.subject).trim().slice(0, 255) : null;
    const question = String(req.body?.question || '').trim();
    if (!schoolOrganizationId || !question) {
      return res.status(400).json({ error: { message: 'schoolOrganizationId and question are required' } });
    }

    const access = await ensureOrgAccess(req, schoolOrganizationId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Only school_staff can create tickets from the school portal UX.
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'school_staff') {
      return res.status(403).json({ error: { message: 'Only school staff can submit support tickets here' } });
    }

    const agencyId = await resolveActiveAgencyIdForOrg(schoolOrganizationId);

    const [result] = await pool.execute(
      `INSERT INTO support_tickets
        (school_organization_id, created_by_user_id, agency_id, subject, question, status)
       VALUES (?, ?, ?, ?, ?, 'open')`,
      [schoolOrganizationId, req.user.id, agencyId ? parseInt(agencyId, 10) : null, subject, question]
    );

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [result.insertId]);
    const created = rows?.[0] || null;

    // Create an in-app notification for agency admins/staff/CPAs if configured.
    // This powers the ticketing notifications card in the admin notifications UI.
    try {
      const aid = agencyId ? parseInt(agencyId, 10) : null;
      if (aid) {
        // Determine which org-type this ticket came from (school/program/learning).
        const orgType = String(access?.org?.organization_type || '').trim().toLowerCase();

        // Resolve per-agency scope (defaults to all supported child org types if unset).
        let allowedTypes = ['school', 'program', 'learning'];
        try {
          const a = await Agency.findById(aid);
          const raw = a?.ticketing_notification_org_types_json ?? null;
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (Array.isArray(parsed) && parsed.length) {
            allowedTypes = parsed.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
          }
        } catch {
          // best-effort; keep defaults
        }

        const shouldNotify =
          orgType && allowedTypes.includes(orgType);

        if (shouldNotify && created?.id) {
          // Prefer a concise message, but keep enough context to be useful in the feed.
          const schoolName = access?.org?.name || `Org #${schoolOrganizationId}`;
          const title = 'New support ticket';
          const msg =
            `${schoolName}: ${subject || 'Support ticket'}${question ? ` — ${question.slice(0, 220)}${question.length > 220 ? '…' : ''}` : ''}`;

          await Notification.create({
            type: 'support_ticket_created',
            severity: 'info',
            title,
            message: msg,
            // Visible to admin-like roles; staff maps to 'admin' audience.
            audienceJson: {
              admin: true,
              clinicalPracticeAssistant: true,
              supervisor: false,
              provider: false
            },
            userId: null,
            agencyId: aid,
            relatedEntityType: 'support_ticket',
            relatedEntityId: created.id
          });
        }
      }
    } catch {
      // Never block ticket creation on notification side-effects.
    }

    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
};

export const answerSupportTicket = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only admin/support can answer support tickets' } });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const answer = String(req.body?.answer || '').trim();
    const status = req.body?.status ? String(req.body.status).trim().toLowerCase() : 'answered';
    if (!answer) return res.status(400).json({ error: { message: 'answer is required' } });
    if (!['answered', 'closed', 'open'].includes(status)) {
      return res.status(400).json({ error: { message: 'status must be open, answered, or closed' } });
    }

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0];
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Enforce ownership:
    // - If already claimed by another user, block answering.
    // - If unclaimed, auto-claim to the current user.
    const claimedBy = ticket.claimed_by_user_id ? Number(ticket.claimed_by_user_id) : null;
    if (claimedBy && claimedBy !== Number(req.user.id)) {
      return res.status(409).json({ error: { message: 'Ticket is already claimed by another team member' } });
    }

    if (!claimedBy) {
      try {
        const [claimResult] = await pool.execute(
          `UPDATE support_tickets
           SET claimed_by_user_id = ?, claimed_at = COALESCE(claimed_at, CURRENT_TIMESTAMP)
           WHERE id = ? AND claimed_by_user_id IS NULL`,
          [req.user.id, ticketId]
        );
        if ((claimResult?.affectedRows || 0) === 0) {
          // Someone else claimed in between; re-check
          const [r2] = await pool.execute(`SELECT claimed_by_user_id FROM support_tickets WHERE id = ?`, [ticketId]);
          const nowClaimed = r2?.[0]?.claimed_by_user_id ? Number(r2[0].claimed_by_user_id) : null;
          if (nowClaimed && nowClaimed !== Number(req.user.id)) {
            return res.status(409).json({ error: { message: 'Ticket was just claimed by another team member' } });
          }
        }
      } catch {
        // Best-effort; continue
      }
    }

    await pool.execute(
      `UPDATE support_tickets
       SET answer = ?, status = ?, answered_by_user_id = ?, answered_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [answer, status, req.user.id, ticketId]
    );

    const [rows2] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json(rows2?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const claimSupportTicket = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only admin/support can claim support tickets' } });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0];
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const claimedBy = ticket.claimed_by_user_id ? Number(ticket.claimed_by_user_id) : null;
    if (claimedBy && claimedBy !== Number(req.user.id)) {
      return res.status(409).json({ error: { message: 'Ticket is already claimed by another team member' } });
    }
    if (claimedBy === Number(req.user.id)) {
      const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
      return res.json(out?.[0] || null);
    }

    const [result] = await pool.execute(
      `UPDATE support_tickets
       SET claimed_by_user_id = ?, claimed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND claimed_by_user_id IS NULL`,
      [req.user.id, ticketId]
    );

    if ((result?.affectedRows || 0) === 0) {
      return res.status(409).json({ error: { message: 'Ticket was just claimed by another team member' } });
    }

    const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json(out?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const unclaimSupportTicket = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only admin/support can unclaim support tickets' } });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0];
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const claimedBy = ticket.claimed_by_user_id ? Number(ticket.claimed_by_user_id) : null;
    if (!claimedBy) {
      const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
      return res.json(out?.[0] || null);
    }

    // Only the current claimant can unclaim, except super_admin who can unassign for ops.
    if (claimedBy !== Number(req.user.id) && !isSuperAdmin(req)) {
      return res.status(403).json({ error: { message: 'Only the current claimant can unclaim this ticket' } });
    }

    await pool.execute(
      `UPDATE support_tickets
       SET claimed_by_user_id = NULL,
           claimed_at = NULL
       WHERE id = ?`,
      [ticketId]
    );

    const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json(out?.[0] || null);
  } catch (e) {
    next(e);
  }
};

