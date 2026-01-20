import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';

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
    const ok = (orgs || []).some((o) => parseInt(o.id, 10) === sid);
    if (!ok) return { ok: false, status: 403, message: 'Access denied' };
  }

  return { ok: true, org, schoolOrganizationId: sid };
}

const isAgencyAdminUser = (req) => {
  const r = String(req.user?.role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin' || r === 'support';
};

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

    const sql = `
      SELECT t.*,
             cb.first_name AS created_by_first_name,
             cb.last_name AS created_by_last_name,
             ab.first_name AS answered_by_first_name,
             ab.last_name AS answered_by_last_name,
             s.name AS school_name
      FROM support_tickets t
      LEFT JOIN users cb ON cb.id = t.created_by_user_id
      LEFT JOIN users ab ON ab.id = t.answered_by_user_id
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
    res.status(201).json(rows?.[0] || null);
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

