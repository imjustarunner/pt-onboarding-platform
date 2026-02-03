import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import Notification from '../models/Notification.model.js';

async function hasSupportTicketMessagesTable() {
  try {
    const [rows] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_ticket_messages'"
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function hasSupportTicketMessagesSoftDeleteColumns() {
  try {
    const [rows] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_ticket_messages' AND COLUMN_NAME = 'is_deleted'"
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function maybeGenerateGeminiSummary({ question, answer }) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  let GoogleGenerativeAI;
  try {
    ({ GoogleGenerativeAI } = await import('@google/generative-ai'));
  } catch {
    return null;
  }

  const modelName = String(process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim() || 'gemini-2.0-flash';
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const prompt = [
    'Summarize this question and answer in 1-3 sentences.',
    'Do NOT include any client identifiers, initials, or PHI.',
    '',
    'Question:',
    String(question || '').trim(),
    '',
    'Answer:',
    String(answer || '').trim()
  ].join('\n');
  try {
    const result = await model.generateContent(prompt);
    const text = result?.response?.text?.() || '';
    const cleaned = String(text || '').trim();
    return cleaned ? cleaned.slice(0, 900) : null;
  } catch {
    return null;
  }
}

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

async function ensureClientInOrg({ clientId, schoolOrganizationId }) {
  const cid = parseInt(clientId, 10);
  const sid = parseInt(schoolOrganizationId, 10);
  if (!cid) return { ok: false, status: 400, message: 'Invalid clientId' };
  if (!sid) return { ok: false, status: 400, message: 'Invalid schoolOrganizationId' };

  const [cRows] = await pool.execute(
    `SELECT id, organization_id, status
     FROM clients
     WHERE id = ?
     LIMIT 1`,
    [cid]
  );
  const c = cRows?.[0] || null;
  if (!c) return { ok: false, status: 404, message: 'Client not found' };
  if (String(c.status || '').toUpperCase() === 'ARCHIVED') {
    return { ok: false, status: 409, message: 'Client is archived' };
  }

  // Prefer multi-org assignment table if present; fall back to legacy clients.organization_id.
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_organization_assignments
       WHERE client_id = ?
         AND organization_id = ?
         AND is_active = TRUE
       LIMIT 1`,
      [cid, sid]
    );
    if (rows?.[0]) return { ok: true, clientId: cid };
    return { ok: false, status: 403, message: 'Client is not assigned to this organization' };
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
    // Legacy fallback
    if (parseInt(c.organization_id, 10) === sid) return { ok: true, clientId: cid };
    return { ok: false, status: 403, message: 'Client is not assigned to this organization' };
  }
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
    const clientIdRaw = req.body?.clientId ?? null;
    const clientId = clientIdRaw !== null && clientIdRaw !== undefined ? parseInt(clientIdRaw, 10) : null;
    const question = String(req.body?.question || '').trim();
    if (!schoolOrganizationId || !question) {
      return res.status(400).json({ error: { message: 'schoolOrganizationId and question are required' } });
    }

    const access = await ensureOrgAccess(req, schoolOrganizationId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // School Portal: allow school_staff and providers to create tickets to admin/staff/support.
    const role = String(req.user?.role || '').toLowerCase();
    if (clientId) {
      // Client-scoped tickets: school staff only (per product decision).
      if (role !== 'school_staff') {
        return res.status(403).json({ error: { message: 'Only school staff can submit client tickets' } });
      }
      const okClient = await ensureClientInOrg({ clientId, schoolOrganizationId });
      if (!okClient.ok) return res.status(okClient.status).json({ error: { message: okClient.message } });
    } else if (role !== 'school_staff' && role !== 'provider') {
      return res.status(403).json({ error: { message: 'Only school staff and providers can submit support tickets here' } });
    }

    const agencyId = await resolveActiveAgencyIdForOrg(schoolOrganizationId);

    const [result] = await pool.execute(
      `INSERT INTO support_tickets
        (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status)
       VALUES (?, ?, ?, ?, ?, ?, 'open')`,
      [schoolOrganizationId, clientId || null, req.user.id, agencyId ? parseInt(agencyId, 10) : null, subject, question]
    );

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [result.insertId]);
    const created = rows?.[0] || null;

    // Best-effort: persist the initial question as a message row when the table exists.
    try {
      if (created?.id && (await hasSupportTicketMessagesTable())) {
        await pool.execute(
          `INSERT INTO support_ticket_messages (ticket_id, parent_message_id, author_user_id, author_role, body)
           VALUES (?, NULL, ?, ?, ?)`,
          [created.id, req.user.id, String(req.user?.role || ''), question]
        );
      }
    } catch {
      // best-effort; do not block creation
    }

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

export const getClientSupportTicketThread = async (req, res, next) => {
  try {
    const schoolOrganizationId = parseInt(req.query?.schoolOrganizationId, 10);
    const clientId = parseInt(req.query?.clientId, 10);
    if (!schoolOrganizationId || !clientId) {
      return res.status(400).json({ error: { message: 'schoolOrganizationId and clientId are required' } });
    }

    const access = await ensureOrgAccess(req, schoolOrganizationId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Only allow school staff + agency admin/support/staff to view client threads.
    const role = String(req.user?.role || '').toLowerCase();
    const canView = role === 'school_staff' || isAgencyAdminUser(req) || role === 'super_admin';
    if (!canView) return res.status(403).json({ error: { message: 'Access denied' } });

    const okClient = await ensureClientInOrg({ clientId, schoolOrganizationId });
    if (!okClient.ok) return res.status(okClient.status).json({ error: { message: okClient.message } });

    const [rows] = await pool.execute(
      `SELECT *
       FROM support_tickets
       WHERE school_organization_id = ?
         AND client_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [schoolOrganizationId, clientId]
    );
    const ticket = rows?.[0] || null;

    let messages = [];
    if (ticket?.id && (await hasSupportTicketMessagesTable())) {
      const [mRows] = await pool.execute(
        `SELECT m.*,
                u.first_name AS author_first_name,
                u.last_name AS author_last_name
         FROM support_ticket_messages m
         LEFT JOIN users u ON u.id = m.author_user_id
         WHERE m.ticket_id = ?
         ORDER BY m.created_at ASC, m.id ASC`,
        [ticket.id]
      );
      messages = Array.isArray(mRows) ? mRows : [];
    }

    res.json({ ticket, messages });
  } catch (e) {
    next(e);
  }
};

export const listSupportTicketMessages = async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0] || null;
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (!(await hasSupportTicketMessagesTable())) {
      return res.json({ ticket, messages: [] });
    }

    const hasSoftDelete = await hasSupportTicketMessagesSoftDeleteColumns();
    const [mRows] = await pool.execute(
      `SELECT m.*,
              u.first_name AS author_first_name,
              u.last_name AS author_last_name
       FROM support_ticket_messages m
       LEFT JOIN users u ON u.id = m.author_user_id
       WHERE m.ticket_id = ?
       ORDER BY m.created_at ASC, m.id ASC`,
      [ticketId]
    );
    const list = Array.isArray(mRows) ? mRows : [];
    // Normalize deleted messages when the column exists
    const normalized = hasSoftDelete
      ? list.map((m) => {
        const isDeleted = m?.is_deleted === 1 || m?.is_deleted === true;
        if (!isDeleted) return m;
        return {
          ...m,
          body: '',
          is_deleted: 1
        };
      })
      : list;
    res.json({ ticket, messages: normalized });
  } catch (e) {
    next(e);
  }
};

export const createSupportTicketMessage = async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const body = String(req.body?.body || '').trim();
    const parentMessageIdRaw = req.body?.parentMessageId ?? null;
    const parentMessageId =
      parentMessageIdRaw === null || parentMessageIdRaw === undefined || String(parentMessageIdRaw).trim() === ''
        ? null
        : parseInt(parentMessageIdRaw, 10);
    if (!body) return res.status(400).json({ error: { message: 'body is required' } });

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0] || null;
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (!(await hasSupportTicketMessagesTable())) {
      return res.status(409).json({ error: { message: 'Ticket messages are not enabled (missing migration)' } });
    }

    const role = String(req.user?.role || '').toLowerCase();

    // Client-scoped tickets: allow school_staff and agency admin/support/staff to post.
    if (ticket.client_id) {
      const canPost = role === 'school_staff' || isAgencyAdminUser(req) || role === 'super_admin';
      if (!canPost) return res.status(403).json({ error: { message: 'Access denied' } });
      // Validate client still belongs to org (avoids cross-org leakage)
      const okClient = await ensureClientInOrg({ clientId: ticket.client_id, schoolOrganizationId: ticket.school_organization_id });
      if (!okClient.ok) return res.status(okClient.status).json({ error: { message: okClient.message } });
    }

    const hasSoftDelete = await hasSupportTicketMessagesSoftDeleteColumns();

    // Parent pointer is best-effort; if invalid, treat as top-level.
    let parentId = null;
    if (parentMessageId && Number.isFinite(parentMessageId) && parentMessageId > 0) {
      try {
        const [pRows] = await pool.execute(
          `SELECT id${hasSoftDelete ? ', is_deleted' : ''} FROM support_ticket_messages WHERE id = ? AND ticket_id = ? LIMIT 1`,
          [parentMessageId, ticketId]
        );
        const p = pRows?.[0] || null;
        const isDeleted = hasSoftDelete ? (p?.is_deleted === 1 || p?.is_deleted === true) : false;
        if (p?.id && !isDeleted) parentId = parentMessageId;
      } catch {
        parentId = null;
      }
    }

    await pool.execute(
      `INSERT INTO support_ticket_messages (ticket_id, parent_message_id, author_user_id, author_role, body)
       VALUES (?, ?, ?, ?, ?)`,
      [ticketId, parentId, req.user.id, String(req.user?.role || ''), body]
    );

    // If a school staff member responds on a closed ticket, reopen it.
    if (role === 'school_staff' && String(ticket.status || '').toLowerCase() === 'closed') {
      try {
        await pool.execute(`UPDATE support_tickets SET status = 'open' WHERE id = ?`, [ticketId]);
      } catch {
        // ignore
      }
    }

    // Return updated thread
    return await listSupportTicketMessages(req, res, next);
  } catch (e) {
    next(e);
  }
};

export const deleteSupportTicketMessage = async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const messageId = parseInt(req.params.messageId, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });
    if (!messageId) return res.status(400).json({ error: { message: 'Invalid message id' } });

    const [tRows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = tRows?.[0] || null;
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (!(await hasSupportTicketMessagesTable())) {
      return res.status(409).json({ error: { message: 'Ticket messages are not enabled (missing migration)' } });
    }
    if (!(await hasSupportTicketMessagesSoftDeleteColumns())) {
      return res.status(409).json({ error: { message: 'Message delete is not enabled (missing migration)' } });
    }

    const [mRows] = await pool.execute(
      `SELECT id, ticket_id, author_user_id, author_role, is_deleted
       FROM support_ticket_messages
       WHERE id = ? AND ticket_id = ?
       LIMIT 1`,
      [messageId, ticketId]
    );
    const msg = mRows?.[0] || null;
    if (!msg) return res.status(404).json({ error: { message: 'Message not found' } });
    if (msg.is_deleted === 1 || msg.is_deleted === true) {
      return res.json({ ok: true });
    }

    const role = String(req.user?.role || '').toLowerCase();
    const authorRole = String(msg.author_role || '').toLowerCase();
    const isAdminLike = role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff';
    const isSchoolStaff = role === 'school_staff';
    const canDelete =
      (isAdminLike && authorRole === 'school_staff') ||
      (isSchoolStaff && Number(msg.author_user_id) === Number(req.user.id));
    if (!canDelete) return res.status(403).json({ error: { message: 'Access denied' } });

    await pool.execute(
      `UPDATE support_ticket_messages
       SET is_deleted = 1,
           deleted_at = CURRENT_TIMESTAMP,
           deleted_by_user_id = ?
       WHERE id = ? AND ticket_id = ?`,
      [req.user.id, messageId, ticketId]
    );

    return res.json({ ok: true });
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

    // Best-effort: store an AI summary when closing.
    if (status === 'closed') {
      try {
        const summary = await maybeGenerateGeminiSummary({ question: ticket?.question || '', answer });
        if (summary) {
          await pool.execute(`UPDATE support_tickets SET ai_summary = ? WHERE id = ?`, [summary, ticketId]);
        }
      } catch {
        // ignore; best-effort only
      }
    }

    // Best-effort: also append the answer as a message in the thread (when enabled).
    try {
      if (await hasSupportTicketMessagesTable()) {
        await pool.execute(
          `INSERT INTO support_ticket_messages (ticket_id, parent_message_id, author_user_id, author_role, body)
           VALUES (?, NULL, ?, ?, ?)`,
          [ticketId, req.user.id, String(req.user?.role || ''), answer]
        );
      }
    } catch {
      // best-effort only
    }

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

