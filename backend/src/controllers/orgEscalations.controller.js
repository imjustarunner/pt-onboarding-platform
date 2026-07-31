import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import Notification from '../models/Notification.model.js';
import {
  ESCALATION_PRIORITIES,
  ESCALATION_STATUS_LABELS,
  isEscalationManagerRole,
  isEscalationSubmitterRole,
  normalizeEscalationStatus
} from '../constants/orgEscalations.js';
import {
  decryptTicketRow,
  prepareEncryptedTicketText,
  ticketDisplayStatus
} from '../utils/supportTicketCrypto.js';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'escalations');

async function hasEscalationColumns() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_tickets' AND COLUMN_NAME = 'ticket_kind'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function hasAttachmentsTable() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_ticket_attachments'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function hasEncryptionColumns() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_tickets' AND COLUMN_NAME = 'question_ciphertext'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function hasMessagesTable() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_ticket_messages'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function ensureAgencyAccess(req, agencyId) {
  const aid = parseInt(agencyId, 10);
  if (!aid) return { ok: false, status: 400, message: 'Invalid agencyId' };
  const agency = await Agency.findById(aid);
  if (!agency) return { ok: false, status: 404, message: 'Agency not found' };
  if (String(req.user?.role || '').toLowerCase() !== 'super_admin') {
    const agencies = await User.getAgencies(req.user.id);
    const hasAccess = (agencies || []).some((a) => parseInt(a.id, 10) === aid);
    if (!hasAccess) return { ok: false, status: 403, message: 'Access denied' };
  }
  return { ok: true, agency, agencyId: aid };
}

function formatUserName(user) {
  const first = String(user?.first_name || '').trim();
  const last = String(user?.last_name || '').trim();
  const full = [first, last].filter(Boolean).join(' ').trim();
  return full || user?.email || user?.work_email || 'Someone';
}

function mapEscalationRow(row) {
  if (!row) return null;
  const decrypted = decryptTicketRow(row) || row;
  const linkedEventId = Number(decrypted.linked_schedule_event_id || 0) || null;
  const meetingTitle = String(decrypted.linked_meeting_title || '').trim() || null;
  const meetingStart = decrypted.linked_meeting_start_at || null;
  return {
    id: decrypted.id,
    ticket_kind: decrypted.ticket_kind || 'escalation',
    subject: decrypted.subject,
    issue: decrypted.question,
    root_cause: decrypted.root_cause || null,
    recommended_resolution: decrypted.recommended_resolution || null,
    affected_department: decrypted.affected_department || null,
    related_project: decrypted.related_project || null,
    related_client_id: decrypted.client_id || null,
    immediate_action_required: !!(
      decrypted.immediate_action_required === 1 || decrypted.immediate_action_required === true
    ),
    resolution_outcome: decrypted.resolution_outcome || null,
    escalation_status: decrypted.escalation_status || 'submitted',
    escalation_status_label:
      ESCALATION_STATUS_LABELS[decrypted.escalation_status] ||
      ESCALATION_STATUS_LABELS.submitted,
    priority: decrypted.priority || 'medium',
    status: decrypted.status,
    display_status: ticketDisplayStatus(decrypted),
    agency_id: decrypted.agency_id,
    school_organization_id: decrypted.school_organization_id,
    created_by_user_id: decrypted.created_by_user_id,
    created_by_name: [decrypted.created_by_first_name, decrypted.created_by_last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || null,
    claimed_by_user_id: decrypted.claimed_by_user_id,
    claimed_by_name: [decrypted.claimed_by_first_name, decrypted.claimed_by_last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || null,
    claimed_at: decrypted.claimed_at,
    created_at: decrypted.created_at,
    updated_at: decrypted.updated_at,
    answered_at: decrypted.answered_at,
    linked_schedule_event_id: linkedEventId,
    linked_recurrence_series_id: String(decrypted.linked_recurrence_series_id || '').trim() || null,
    linked_action_item_id: String(decrypted.linked_action_item_id || '').trim() || null,
    linked_meeting: linkedEventId
      ? {
          id: linkedEventId,
          title: meetingTitle,
          startAt: meetingStart,
          recurrenceSeriesId: String(decrypted.linked_recurrence_series_id || '').trim() || null
        }
      : null
  };
}

async function loadEscalationById(id) {
  try {
    const [rows] = await pool.execute(
      `SELECT t.*,
              cb.first_name AS created_by_first_name,
              cb.last_name AS created_by_last_name,
              cl.first_name AS claimed_by_first_name,
              cl.last_name AS claimed_by_last_name,
              pse.title AS linked_meeting_title,
              pse.start_at AS linked_meeting_start_at
       FROM support_tickets t
       LEFT JOIN users cb ON cb.id = t.created_by_user_id
       LEFT JOIN users cl ON cl.id = t.claimed_by_user_id
       LEFT JOIN provider_schedule_events pse ON pse.id = t.linked_schedule_event_id
       WHERE t.id = ? AND COALESCE(t.ticket_kind, 'support') = 'escalation'
       LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    const [rows] = await pool.execute(
      `SELECT t.*,
              cb.first_name AS created_by_first_name,
              cb.last_name AS created_by_last_name,
              cl.first_name AS claimed_by_first_name,
              cl.last_name AS claimed_by_last_name
       FROM support_tickets t
       LEFT JOIN users cb ON cb.id = t.created_by_user_id
       LEFT JOIN users cl ON cl.id = t.claimed_by_user_id
       WHERE t.id = ? AND COALESCE(t.ticket_kind, 'support') = 'escalation'
       LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  }
}

async function parseRouting(agency) {
  const raw = agency?.escalation_routing_json;
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function resolveFirstAssigneeFromRouting(agencyId, routing) {
  if (!Array.isArray(routing) || !routing.length) return null;
  for (const step of routing) {
    const type = String(step?.type || '').toLowerCase();
    const value = step?.value;
    if (type === 'user') {
      const uid = parseInt(value, 10);
      if (!uid) continue;
      const [rows] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.is_archived, u.status
         FROM users u
         INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
         WHERE u.id = ?
         LIMIT 1`,
        [agencyId, uid]
      );
      const u = rows?.[0];
      if (u && u.is_archived !== 1 && String(u.status || '').toUpperCase() !== 'ARCHIVED') {
        return u;
      }
    } else if (type === 'role') {
      const role = String(value || '').toLowerCase();
      if (!role) continue;
      const [rows] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.is_archived, u.status
         FROM users u
         INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
         WHERE LOWER(u.role) = ?
           AND COALESCE(u.is_archived, 0) = 0
           AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'
         ORDER BY u.last_name ASC, u.first_name ASC
         LIMIT 1`,
        [agencyId, role]
      );
      if (rows?.[0]) return rows[0];
    }
  }
  return null;
}

async function notifyAssignee({ escalation, assignee, assignedBy }) {
  try {
    const assigneeId = Number(assignee?.id || 0);
    const actorId = Number(assignedBy?.id || 0);
    if (!assigneeId || !actorId || assigneeId === actorId) return;
    await Notification.create({
      type: 'support_ticket_created',
      severity: escalation?.immediate_action_required ? 'warning' : 'info',
      title: 'Escalation assigned to you',
      message: `${formatUserName(assignedBy)} assigned escalation #${escalation.id}: ${String(escalation.subject || 'Untitled').slice(0, 120)}`,
      userId: assigneeId,
      agencyId: escalation?.agency_id || null,
      relatedEntityType: 'support_ticket',
      relatedEntityId: escalation?.id || null,
      actorUserId: actorId
    });
  } catch {
    /* best effort */
  }
}

function requireEscalationSchema(res) {
  return res.status(503).json({
    error: { message: 'Escalations are not available yet. Run database migrations (1013).' }
  });
}

/** POST /api/escalations */
export const createEscalation = async (req, res, next) => {
  try {
    if (!(await hasEscalationColumns())) return requireEscalationSchema(res);

    const role = String(req.user?.role || '').toLowerCase();
    if (!isEscalationSubmitterRole(role)) {
      return res.status(403).json({ error: { message: 'You cannot submit escalations' } });
    }

    const agencyId = parseInt(req.body?.agencyId, 10);
    const access = await ensureAgencyAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const issue = String(req.body?.issue || req.body?.question || '').trim();
    if (!issue) return res.status(400).json({ error: { message: 'Issue is required' } });

    const subject = String(req.body?.subject || '').trim().slice(0, 255) || issue.slice(0, 80);
    const rootCause = String(req.body?.rootCause || req.body?.root_cause || '').trim() || null;
    const recommended = String(req.body?.recommendedResolution || req.body?.recommended_resolution || '').trim();
    if (!recommended) {
      return res.status(400).json({ error: { message: 'Recommended resolution is required' } });
    }
    const department = String(req.body?.affectedDepartment || req.body?.affected_department || '').trim().slice(0, 120) || null;
    const relatedProject = String(req.body?.relatedProject || req.body?.related_project || '').trim().slice(0, 255) || null;
    const clientIdRaw = req.body?.clientId ?? req.body?.relatedClientId ?? null;
    const clientId = clientIdRaw != null && clientIdRaw !== '' ? parseInt(clientIdRaw, 10) : null;
    const immediate =
      req.body?.immediateActionRequired === true ||
      req.body?.immediateActionRequired === 1 ||
      req.body?.immediate_action_required === true ||
      req.body?.immediate_action_required === 1;
    const priorityRaw = String(req.body?.priority || (immediate ? 'high' : 'medium')).trim().toLowerCase();
    const priority = ESCALATION_PRIORITIES.includes(priorityRaw) ? priorityRaw : 'medium';

    // Tenant escalations are scoped to the agency org id (same pattern as staff support tickets).
    const schoolOrganizationId = agencyId;
    const hasEnc = await hasEncryptionColumns();
    const qEnc = hasEnc
      ? prepareEncryptedTicketText(issue)
      : { plain: issue, ciphertext: null, iv: null, authTag: null, keyId: null };

    const baseCols = `school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status, priority,
           ticket_kind, escalation_status, root_cause, recommended_resolution, affected_department,
           related_project, immediate_action_required`;
    const baseVals = [
      schoolOrganizationId,
      Number.isFinite(clientId) ? clientId : null,
      req.user.id,
      agencyId,
      subject,
      hasEnc ? qEnc.plain : issue,
      priority,
      rootCause,
      recommended,
      department,
      relatedProject,
      immediate ? 1 : 0
    ];

    let insertResult;
    try {
      if (hasEnc) {
        [insertResult] = await pool.execute(
          `INSERT INTO support_tickets
            (${baseCols},
             question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id)
           VALUES (?, ?, ?, ?, ?, ?, 'open', ?, 'escalation', 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...baseVals, qEnc.ciphertext, qEnc.iv, qEnc.authTag, qEnc.keyId]
        );
      } else {
        [insertResult] = await pool.execute(
          `INSERT INTO support_tickets
            (${baseCols})
           VALUES (?, ?, ?, ?, ?, ?, 'open', ?, 'escalation', 'submitted', ?, ?, ?, ?, ?)`,
          baseVals
        );
      }
    } catch (err) {
      // Older DBs may reject unknown columns mid-migrate — surface clearly.
      if (String(err?.code || '') === 'ER_BAD_FIELD_ERROR') {
        return requireEscalationSchema(res);
      }
      throw err;
    }

    const ticketId = insertResult?.insertId;
    if (!ticketId) return res.status(500).json({ error: { message: 'Failed to create escalation' } });

    // Seed conversation with structured fields.
    if (await hasMessagesTable()) {
      const body = [
        `Issue:\n${issue}`,
        rootCause ? `Root cause:\n${rootCause}` : null,
        recommended ? `Recommended resolution:\n${recommended}` : null,
        department ? `Affected department: ${department}` : null,
        relatedProject ? `Related project: ${relatedProject}` : null,
        immediate ? 'Immediate action required: Yes' : null
      ]
        .filter(Boolean)
        .join('\n\n');
      try {
        await pool.execute(
          `INSERT INTO support_ticket_messages (ticket_id, author_user_id, author_role, body, is_internal)
           VALUES (?, ?, ?, ?, 0)`,
          [ticketId, req.user.id, role, body]
        );
      } catch {
        /* optional */
      }
    }

    // Manual assign (managers) or chain-of-responsibility auto-assign.
    let assignee = null;
    const rawManualAssignee = req.body?.assigneeUserId;
    const hasManualAssignee =
      rawManualAssignee != null && rawManualAssignee !== '' && String(rawManualAssignee).toLowerCase() !== 'auto';
    if (hasManualAssignee) {
      if (!isEscalationManagerRole(role)) {
        return res.status(403).json({ error: { message: 'Only admin/support can assign on create' } });
      }
      const manualId = parseInt(rawManualAssignee, 10);
      if (!manualId) {
        return res.status(400).json({ error: { message: 'Invalid assigneeUserId' } });
      }
      assignee = await resolveAssignableUser({ agencyId, assigneeId: manualId });
      if (!assignee) return res.status(404).json({ error: { message: 'Assignee not found in this agency' } });
      if (assignee.is_archived === 1 || String(assignee.status || '').toUpperCase() === 'ARCHIVED') {
        return res.status(400).json({ error: { message: 'Assignee is archived' } });
      }
    } else {
      const routing = await parseRouting(access.agency);
      assignee = await resolveFirstAssigneeFromRouting(agencyId, routing);
    }
    if (assignee) {
      await pool.execute(
        `UPDATE support_tickets
         SET claimed_by_user_id = ?, claimed_at = CURRENT_TIMESTAMP, escalation_status = 'assigned'
         WHERE id = ?`,
        [assignee.id, ticketId]
      );
      const created = await loadEscalationById(ticketId);
      await notifyAssignee({ escalation: created, assignee, assignedBy: req.user });
    }

    const row = await loadEscalationById(ticketId);
    res.status(201).json(mapEscalationRow(row));
  } catch (e) {
    next(e);
  }
};

/** GET /api/escalations */
export const listEscalations = async (req, res, next) => {
  try {
    if (!(await hasEscalationColumns())) return requireEscalationSchema(res);

    const role = String(req.user?.role || '').toLowerCase();
    const agencyId = parseInt(req.query?.agencyId, 10);
    const access = await ensureAgencyAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const mine = String(req.query?.mine || '') === '1' || String(req.query?.mine || '') === 'true';
    const statusFilter = req.query?.escalationStatus
      ? normalizeEscalationStatus(req.query.escalationStatus, '')
      : '';
    const openOnly =
      String(req.query?.openOnly || '') === '1' || String(req.query?.openOnly || '') === 'true';
    const limitRaw = req.query?.limit ? parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;

    const where = [`COALESCE(t.ticket_kind, 'support') = 'escalation'`, 't.agency_id = ?'];
    const params = [agencyId];

    if (mine || !isEscalationManagerRole(role)) {
      where.push('(t.created_by_user_id = ? OR t.claimed_by_user_id = ?)');
      params.push(req.user.id, req.user.id);
    }

    if (statusFilter) {
      where.push('LOWER(COALESCE(t.escalation_status, \'\')) = ?');
      params.push(statusFilter);
    }

    if (openOnly) {
      where.push(`LOWER(COALESCE(t.escalation_status, 'submitted')) NOT IN ('resolved', 'closed')`);
    }

    let rows;
    try {
      [rows] = await pool.execute(
        `SELECT t.*,
                cb.first_name AS created_by_first_name,
                cb.last_name AS created_by_last_name,
                cl.first_name AS claimed_by_first_name,
                cl.last_name AS claimed_by_last_name,
                pse.title AS linked_meeting_title,
                pse.start_at AS linked_meeting_start_at
         FROM support_tickets t
         LEFT JOIN users cb ON cb.id = t.created_by_user_id
         LEFT JOIN users cl ON cl.id = t.claimed_by_user_id
         LEFT JOIN provider_schedule_events pse ON pse.id = t.linked_schedule_event_id
         WHERE ${where.join(' AND ')}
         ORDER BY
           CASE WHEN t.immediate_action_required = 1 THEN 0 ELSE 1 END,
           FIELD(LOWER(COALESCE(t.priority, 'medium')), 'high', 'medium', 'low'),
           t.created_at DESC
         LIMIT ${limit}`,
        params
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      [rows] = await pool.execute(
        `SELECT t.*,
                cb.first_name AS created_by_first_name,
                cb.last_name AS created_by_last_name,
                cl.first_name AS claimed_by_first_name,
                cl.last_name AS claimed_by_last_name
         FROM support_tickets t
         LEFT JOIN users cb ON cb.id = t.created_by_user_id
         LEFT JOIN users cl ON cl.id = t.claimed_by_user_id
         WHERE ${where.join(' AND ')}
         ORDER BY
           CASE WHEN t.immediate_action_required = 1 THEN 0 ELSE 1 END,
           FIELD(LOWER(COALESCE(t.priority, 'medium')), 'high', 'medium', 'low'),
           t.created_at DESC
         LIMIT ${limit}`,
        params
      );
    }

    res.json({
      escalations: (rows || []).map(mapEscalationRow),
      counts: await countEscalations(agencyId, req.user?.id || null)
    });
  } catch (e) {
    next(e);
  }
};

async function countEscalations(agencyId, userId = null) {
  try {
    let assignedToMeSql = '';
    if (userId) {
      assignedToMeSql = `,
         SUM(CASE WHEN claimed_by_user_id = ?
           AND LOWER(COALESCE(escalation_status, 'submitted')) NOT IN ('resolved', 'closed')
           THEN 1 ELSE 0 END) AS assigned_to_me`;
    }
    const [rows] = await pool.execute(
      `SELECT
         SUM(CASE WHEN LOWER(COALESCE(escalation_status, 'submitted')) NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS open_count,
         SUM(CASE WHEN LOWER(COALESCE(escalation_status, '')) = 'submitted' THEN 1 ELSE 0 END) AS submitted,
         SUM(CASE WHEN LOWER(COALESCE(escalation_status, '')) = 'under_review' THEN 1 ELSE 0 END) AS under_review,
         SUM(CASE WHEN LOWER(COALESCE(escalation_status, '')) = 'assigned' THEN 1 ELSE 0 END) AS assigned,
         SUM(CASE WHEN LOWER(COALESCE(escalation_status, '')) = 'awaiting_information' THEN 1 ELSE 0 END) AS awaiting_information,
         SUM(CASE WHEN LOWER(COALESCE(escalation_status, '')) = 'resolved' THEN 1 ELSE 0 END) AS resolved,
         SUM(CASE WHEN LOWER(COALESCE(escalation_status, '')) = 'closed' THEN 1 ELSE 0 END) AS closed${assignedToMeSql}
       FROM support_tickets
       WHERE agency_id = ? AND COALESCE(ticket_kind, 'support') = 'escalation'`,
      userId ? [userId, agencyId] : [agencyId]
    );
    const r = rows?.[0] || {};
    return {
      open: Number(r.open_count || 0),
      total: Number(r.open_count || 0),
      submitted: Number(r.submitted || 0),
      under_review: Number(r.under_review || 0),
      assigned: Number(r.assigned || 0),
      awaiting_information: Number(r.awaiting_information || 0),
      resolved: Number(r.resolved || 0),
      closed: Number(r.closed || 0),
      assigned_to_me: Number(r.assigned_to_me || 0)
    };
  } catch {
    return { open: 0, total: 0, assigned_to_me: 0 };
  }
}

/** GET /api/escalations/:id */
export const getEscalation = async (req, res, next) => {
  try {
    if (!(await hasEscalationColumns())) return requireEscalationSchema(res);
    const id = parseInt(req.params.id, 10);
    const row = await loadEscalationById(id);
    if (!row) return res.status(404).json({ error: { message: 'Escalation not found' } });

    const access = await ensureAgencyAccess(req, row.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const role = String(req.user?.role || '').toLowerCase();
    const isOwner =
      Number(row.created_by_user_id) === Number(req.user.id) ||
      Number(row.claimed_by_user_id) === Number(req.user.id);
    if (!isEscalationManagerRole(role) && !isOwner) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    let attachments = [];
    if (await hasAttachmentsTable()) {
      const [att] = await pool.execute(
        `SELECT id, ticket_id, uploaded_by_user_id, file_name, file_path, mime_type, file_size, created_at
         FROM support_ticket_attachments WHERE ticket_id = ? ORDER BY created_at ASC`,
        [id]
      );
      attachments = att || [];
    }

    res.json({ ...mapEscalationRow(row), attachments });
  } catch (e) {
    next(e);
  }
};

/** PATCH /api/escalations/:id/status */
export const updateEscalationStatus = async (req, res, next) => {
  try {
    if (!(await hasEscalationColumns())) return requireEscalationSchema(res);
    const role = String(req.user?.role || '').toLowerCase();
    if (!isEscalationManagerRole(role)) {
      return res.status(403).json({ error: { message: 'Only admin/support can update escalation status' } });
    }

    const id = parseInt(req.params.id, 10);
    const row = await loadEscalationById(id);
    if (!row) return res.status(404).json({ error: { message: 'Escalation not found' } });

    const access = await ensureAgencyAccess(req, row.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const rawStatus = String(req.body?.status || req.body?.escalationStatus || '').trim().toLowerCase();
    if (rawStatus === 'closed') {
      return res.status(400).json({ error: { message: 'Escalations cannot be set to closed. Use resolved instead.' } });
    }

    const nextStatus = normalizeEscalationStatus(req.body?.status || req.body?.escalationStatus, '');
    if (!nextStatus) return res.status(400).json({ error: { message: 'Valid escalation status is required' } });

    const outcome = req.body?.resolutionOutcome != null
      ? String(req.body.resolutionOutcome).trim()
      : req.body?.resolution_outcome != null
        ? String(req.body.resolution_outcome).trim()
        : null;

    const ticketStatus =
      nextStatus === 'closed' || nextStatus === 'resolved' ? 'closed' : 'open';

    await pool.execute(
      `UPDATE support_tickets
       SET escalation_status = ?,
           status = ?,
           resolution_outcome = COALESCE(?, resolution_outcome),
           answered_at = CASE WHEN ? IN ('resolved', 'closed') THEN COALESCE(answered_at, CURRENT_TIMESTAMP) ELSE answered_at END,
           answered_by_user_id = CASE WHEN ? IN ('resolved', 'closed') THEN COALESCE(answered_by_user_id, ?) ELSE answered_by_user_id END
       WHERE id = ?`,
      [nextStatus, ticketStatus, outcome || null, nextStatus, nextStatus, req.user.id, id]
    );

    if (nextStatus === 'resolved' || nextStatus === 'closed') {
      try {
        const ProviderScheduleEventArtifact = (await import('../models/ProviderScheduleEventArtifact.model.js')).default;
        await ProviderScheduleEventArtifact.markActionItemDoneByEscalationTicket({
          escalationTicketId: id,
          eventId: Number(row.linked_schedule_event_id || 0) || null,
          actionItemId: row.linked_action_item_id || null,
          done: true
        });
      } catch (syncErr) {
        console.warn('[escalations] sync meeting action item failed', syncErr?.message || syncErr);
      }
    }

    const updated = await loadEscalationById(id);
    res.json(mapEscalationRow(updated));
  } catch (e) {
    next(e);
  }
};

/** GET /api/escalations/admin-meetings?agencyId= */
export const listUpcomingAdminMeetings = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.query?.agencyId, 10);
    const access = await ensureAgencyAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const [rows] = await pool.execute(
      `SELECT id, title, start_at, end_at, recurrence_series_id, recurrence_frequency, recurrence_index, meeting_subtype
       FROM provider_schedule_events
       WHERE agency_id = ?
         AND UPPER(COALESCE(kind, '')) = 'TEAM_MEETING'
         AND LOWER(COALESCE(meeting_subtype, 'general')) = 'admin'
         AND UPPER(COALESCE(status, 'ACTIVE')) = 'ACTIVE'
         AND start_at >= NOW()
       ORDER BY start_at ASC
       LIMIT 80`,
      [agencyId]
    );

    res.json({
      meetings: (rows || []).map((r) => ({
        id: Number(r.id),
        title: String(r.title || '').trim() || 'Admin Meeting',
        startAt: r.start_at,
        endAt: r.end_at,
        recurrenceSeriesId: String(r.recurrence_series_id || '').trim() || null,
        recurrenceFrequency: String(r.recurrence_frequency || '').trim().toUpperCase() || null,
        recurrenceIndex: r.recurrence_index == null ? null : Number(r.recurrence_index),
        meetingSubtype: 'admin'
      }))
    });
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.json({ meetings: [] });
    }
    next(e);
  }
};

/** PATCH /api/escalations/:id/meeting-link */
export const updateEscalationMeetingLink = async (req, res, next) => {
  try {
    if (!(await hasEscalationColumns())) return requireEscalationSchema(res);
    const role = String(req.user?.role || '').toLowerCase();
    if (!isEscalationManagerRole(role) && !isEscalationSubmitterRole(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const id = parseInt(req.params.id, 10);
    const row = await loadEscalationById(id);
    if (!row) return res.status(404).json({ error: { message: 'Escalation not found' } });

    const access = await ensureAgencyAccess(req, row.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const clear = req.body?.clear === true || req.body?.scheduleEventId === null;
    let eventId = clear ? null : Number(req.body?.scheduleEventId || req.body?.linked_schedule_event_id || 0) || null;
    let seriesId = clear
      ? null
      : (String(req.body?.recurrenceSeriesId || req.body?.linked_recurrence_series_id || '').trim() || null);

    if (eventId) {
      const [meetRows] = await pool.execute(
        `SELECT id, agency_id, recurrence_series_id, meeting_subtype, kind
         FROM provider_schedule_events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );
      const meet = meetRows?.[0];
      if (!meet || Number(meet.agency_id) !== Number(row.agency_id)) {
        return res.status(400).json({ error: { message: 'Admin Meeting not found for this organization' } });
      }
      if (String(meet.kind || '').toUpperCase() !== 'TEAM_MEETING'
        || String(meet.meeting_subtype || '').toLowerCase() !== 'admin') {
        return res.status(400).json({ error: { message: 'Only Admin Meetings can be tagged' } });
      }
      if (!seriesId) seriesId = String(meet.recurrence_series_id || '').trim() || null;
    }

    await pool.execute(
      `UPDATE support_tickets
       SET linked_schedule_event_id = ?,
           linked_recurrence_series_id = ?
       WHERE id = ?
       LIMIT 1`,
      [eventId, seriesId, id]
    );

    const updated = await loadEscalationById(id);
    res.json(mapEscalationRow(updated));
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({
        error: { message: 'Escalation meeting links require migration 1054.' }
      });
    }
    next(e);
  }
};

async function resolveAssignableUser({ agencyId, assigneeId }) {
  const uid = Number(assigneeId || 0);
  const aid = Number(agencyId || 0);
  if (!uid) return null;
  if (aid) {
    const [aRows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.is_archived, u.status
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE u.id = ?
       LIMIT 1`,
      [aid, uid]
    );
    if (aRows?.[0]) return aRows[0];
  }
  // Platform super admins can own escalations even without a tenant membership row.
  const [uRows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.is_archived, u.status
     FROM users u
     WHERE u.id = ?
     LIMIT 1`,
    [uid]
  );
  const u = uRows?.[0];
  if (!u) return null;
  const role = String(u.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'superadmin') return u;
  return null;
}

async function syncLinkedActionItemAssignee({ row, assigneeUserId, actorUserId }) {
  const eventId = Number(row?.linked_schedule_event_id || 0);
  const actionItemId = row?.linked_action_item_id || null;
  if (!eventId && !Number(row?.id || 0)) return;
  try {
    const ProviderScheduleEventArtifact = (await import('../models/ProviderScheduleEventArtifact.model.js')).default;
    await ProviderScheduleEventArtifact.syncActionItemAssigneeByEscalationTicket({
      escalationTicketId: Number(row.id || 0),
      eventId,
      actionItemId,
      assigneeUserId,
      updatedByUserId: actorUserId
    });
  } catch (syncErr) {
    console.warn('[escalations] sync meeting action assignee failed', syncErr?.message || syncErr);
  }
}

/** PATCH /api/escalations/:id — update issue/details fields */
export const updateEscalationDetails = async (req, res, next) => {
  try {
    if (!(await hasEscalationColumns())) return requireEscalationSchema(res);
    const role = String(req.user?.role || '').toLowerCase();
    if (!isEscalationManagerRole(role) && !isEscalationSubmitterRole(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid escalation id' } });

    const row = await loadEscalationById(id);
    if (!row) return res.status(404).json({ error: { message: 'Escalation not found' } });

    const access = await ensureAgencyAccess(req, row.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Submitters can edit only their own tickets; managers can edit any.
    if (!isEscalationManagerRole(role) && Number(row.created_by_user_id || 0) !== Number(req.user.id || 0)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const body = req.body || {};
    const sets = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(body, 'issue') || Object.prototype.hasOwnProperty.call(body, 'question')) {
      const issue = String(body.issue ?? body.question ?? '').trim();
      if (!issue) return res.status(400).json({ error: { message: 'Issue cannot be empty' } });
      sets.push('question = ?');
      params.push(issue);
      // Keep subject in sync when it was auto-derived from the old issue.
      const oldIssue = String(row.question || '').trim();
      const oldSubject = String(row.subject || '').trim();
      if (!oldSubject || oldSubject === oldIssue.slice(0, 80) || oldSubject === oldIssue.slice(0, 255)) {
        sets.push('subject = ?');
        params.push(issue.slice(0, 80));
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'rootCause') || Object.prototype.hasOwnProperty.call(body, 'root_cause')) {
      const rootCause = String(body.rootCause ?? body.root_cause ?? '').trim() || null;
      sets.push('root_cause = ?');
      params.push(rootCause);
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'recommendedResolution')
      || Object.prototype.hasOwnProperty.call(body, 'recommended_resolution')
    ) {
      const recommended = String(body.recommendedResolution ?? body.recommended_resolution ?? '').trim();
      if (!recommended) return res.status(400).json({ error: { message: 'Recommended resolution cannot be empty' } });
      sets.push('recommended_resolution = ?');
      params.push(recommended);
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'affectedDepartment')
      || Object.prototype.hasOwnProperty.call(body, 'affected_department')
    ) {
      const department = String(body.affectedDepartment ?? body.affected_department ?? '').trim().slice(0, 120) || null;
      sets.push('affected_department = ?');
      params.push(department);
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'relatedProject')
      || Object.prototype.hasOwnProperty.call(body, 'related_project')
    ) {
      const project = String(body.relatedProject ?? body.related_project ?? '').trim().slice(0, 255) || null;
      sets.push('related_project = ?');
      params.push(project);
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'immediateActionRequired')
      || Object.prototype.hasOwnProperty.call(body, 'immediate_action_required')
    ) {
      const immediate = body.immediateActionRequired === true
        || body.immediateActionRequired === 1
        || body.immediateActionRequired === '1'
        || body.immediateActionRequired === 'true'
        || body.immediate_action_required === true
        || body.immediate_action_required === 1
        || body.immediate_action_required === '1'
        || body.immediate_action_required === 'true';
      sets.push('immediate_action_required = ?');
      params.push(immediate ? 1 : 0);
      if (immediate && String(row.priority || '').toLowerCase() !== 'high') {
        sets.push('priority = ?');
        params.push('high');
      }
    }

    if (!sets.length) {
      return res.status(400).json({ error: { message: 'No fields to update' } });
    }

    params.push(id);
    await pool.execute(
      `UPDATE support_tickets SET ${sets.join(', ')} WHERE id = ? LIMIT 1`,
      params
    );

    const updated = await loadEscalationById(id);
    res.json(mapEscalationRow(updated));
  } catch (e) {
    next(e);
  }
};

/** POST /api/escalations/:id/assign */
export const assignEscalation = async (req, res, next) => {
  try {
    if (!(await hasEscalationColumns())) return requireEscalationSchema(res);
    const role = String(req.user?.role || '').toLowerCase();
    if (!isEscalationManagerRole(role)) {
      return res.status(403).json({ error: { message: 'Only admin/support can assign escalations' } });
    }

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'escalation id is required' } });

    const rawAssignee = req.body?.assigneeUserId;
    const clearAssignee = rawAssignee === null
      || rawAssignee === ''
      || rawAssignee === 0
      || rawAssignee === '0';
    const assigneeId = clearAssignee ? 0 : parseInt(rawAssignee, 10);
    if (!clearAssignee && !assigneeId) {
      return res.status(400).json({ error: { message: 'assigneeUserId is required (or null to unassign)' } });
    }

    const row = await loadEscalationById(id);
    if (!row) return res.status(404).json({ error: { message: 'Escalation not found' } });

    const access = await ensureAgencyAccess(req, row.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (clearAssignee) {
      const current = String(row.escalation_status || 'submitted');
      const nextStatus = ['resolved', 'closed', 'awaiting_information'].includes(current)
        ? current
        : (current === 'assigned' ? 'under_review' : current);
      await pool.execute(
        `UPDATE support_tickets
         SET claimed_by_user_id = NULL,
             claimed_at = NULL,
             escalation_status = ?,
             status = CASE WHEN ? IN ('resolved', 'closed') THEN status ELSE 'open' END
         WHERE id = ?`,
        [nextStatus, nextStatus, id]
      );
      await syncLinkedActionItemAssignee({ row, assigneeUserId: null, actorUserId: req.user.id });
      const updated = await loadEscalationById(id);
      return res.json(mapEscalationRow(updated));
    }

    const assignee = await resolveAssignableUser({ agencyId: row.agency_id, assigneeId });
    if (!assignee) return res.status(404).json({ error: { message: 'Assignee not found in this agency' } });
    if (assignee.is_archived === 1 || String(assignee.status || '').toUpperCase() === 'ARCHIVED') {
      return res.status(409).json({ error: { message: 'Assignee is archived' } });
    }

    const nextStatus =
      row.escalation_status === 'awaiting_information' ? 'awaiting_information' : 'assigned';

    await pool.execute(
      `UPDATE support_tickets
       SET claimed_by_user_id = ?, claimed_at = CURRENT_TIMESTAMP, escalation_status = ?, status = 'open'
       WHERE id = ?`,
      [assigneeId, nextStatus, id]
    );

    await syncLinkedActionItemAssignee({ row, assigneeUserId: assigneeId, actorUserId: req.user.id });

    const updated = await loadEscalationById(id);
    await notifyAssignee({ escalation: updated, assignee, assignedBy: req.user });
    res.json(mapEscalationRow(updated));
  } catch (e) {
    next(e);
  }
};

/** GET /api/escalations/assignees */
export const listEscalationAssignees = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.query?.agencyId, 10);
    const access = await ensureAgencyAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (!isEscalationManagerRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admin/support can list assignees' } });
    }

    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.work_email, u.role
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE LOWER(u.role) IN ('admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'provider_plus')
         AND COALESCE(u.is_archived, 0) = 0
         AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'
       ORDER BY u.last_name ASC, u.first_name ASC
       LIMIT 200`,
      [agencyId]
    );
    const users = Array.isArray(rows) ? [...rows] : [];
    // Ensure the current actor can assign to themselves (common for platform super admins).
    const meId = Number(req.user?.id || 0);
    if (meId > 0 && !users.some((u) => Number(u.id) === meId)) {
      const meRole = String(req.user?.role || '').toLowerCase();
      if (meRole === 'super_admin' || meRole === 'superadmin' || isEscalationManagerRole(meRole)) {
        users.unshift({
          id: meId,
          first_name: req.user?.first_name || req.user?.firstName || 'Me',
          last_name: req.user?.last_name || req.user?.lastName || '',
          email: req.user?.email || null,
          work_email: req.user?.work_email || null,
          role: req.user?.role || 'super_admin'
        });
      }
    }
    res.json({ users });
  } catch (e) {
    next(e);
  }
};

/** GET/PUT routing */
export const getEscalationRouting = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.query?.agencyId, 10);
    const access = await ensureAgencyAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const routing = await parseRouting(access.agency);
    res.json({ agencyId, routing });
  } catch (e) {
    next(e);
  }
};

export const updateEscalationRouting = async (req, res, next) => {
  try {
    if (!isEscalationManagerRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admin/support can configure routing' } });
    }
    const agencyId = parseInt(req.body?.agencyId, 10);
    const access = await ensureAgencyAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const routing = Array.isArray(req.body?.routing) ? req.body.routing : [];
    const cleaned = routing
      .map((step) => ({
        type: String(step?.type || '').toLowerCase() === 'role' ? 'role' : 'user',
        value: step?.value
      }))
      .filter((s) => s.value != null && String(s.value).trim() !== '')
      .slice(0, 20);

    await pool.execute(`UPDATE agencies SET escalation_routing_json = ? WHERE id = ?`, [
      JSON.stringify(cleaned),
      agencyId
    ]);
    res.json({ agencyId, routing: cleaned });
  } catch (e) {
    next(e);
  }
};

/** Messages — thin wrappers over support_ticket_messages */
export const listEscalationMessages = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await loadEscalationById(id);
    if (!row) return res.status(404).json({ error: { message: 'Escalation not found' } });
    const access = await ensureAgencyAccess(req, row.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (!(await hasMessagesTable())) return res.json({ messages: [] });

    const [rows] = await pool.execute(
      `SELECT m.*, u.first_name, u.last_name, u.role AS user_role
       FROM support_ticket_messages m
       LEFT JOIN users u ON u.id = m.author_user_id
       WHERE m.ticket_id = ?
         AND COALESCE(m.is_deleted, 0) = 0
       ORDER BY m.created_at ASC`,
      [id]
    );
    res.json({
      messages: (rows || []).map((m) => ({
        id: m.id,
        body: m.body,
        is_internal: !!(m.is_internal === 1 || m.is_internal === true),
        author_user_id: m.author_user_id,
        author_name: [m.first_name, m.last_name].filter(Boolean).join(' ').trim() || null,
        author_role: m.author_role || m.user_role,
        created_at: m.created_at
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const createEscalationMessage = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await loadEscalationById(id);
    if (!row) return res.status(404).json({ error: { message: 'Escalation not found' } });
    const access = await ensureAgencyAccess(req, row.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const role = String(req.user?.role || '').toLowerCase();
    const isOwner =
      Number(row.created_by_user_id) === Number(req.user.id) ||
      Number(row.claimed_by_user_id) === Number(req.user.id);
    if (!isEscalationManagerRole(role) && !isOwner) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const body = String(req.body?.body || req.body?.message || '').trim();
    if (!body) return res.status(400).json({ error: { message: 'Message body is required' } });
    if (!(await hasMessagesTable())) {
      return res.status(503).json({ error: { message: 'Messaging is not available' } });
    }

    const isInternal =
      (req.body?.isInternal === true || req.body?.is_internal === true) && isEscalationManagerRole(role);

    const [result] = await pool.execute(
      `INSERT INTO support_ticket_messages (ticket_id, author_user_id, author_role, body, is_internal)
       VALUES (?, ?, ?, ?, ?)`,
      [id, req.user.id, role, body, isInternal ? 1 : 0]
    );

    // If submitter replied while awaiting info, move back to under_review.
    if (
      !isInternal &&
      Number(row.created_by_user_id) === Number(req.user.id) &&
      String(row.escalation_status || '') === 'awaiting_information'
    ) {
      await pool.execute(
        `UPDATE support_tickets SET escalation_status = 'under_review' WHERE id = ?`,
        [id]
      );
    } else if (isEscalationManagerRole(role) && String(row.escalation_status || '') === 'submitted') {
      await pool.execute(
        `UPDATE support_tickets SET escalation_status = 'under_review' WHERE id = ?`,
        [id]
      );
    }

    res.status(201).json({
      id: result.insertId,
      body,
      is_internal: isInternal,
      author_user_id: req.user.id,
      created_at: new Date().toISOString()
    });
  } catch (e) {
    next(e);
  }
};

/** Attachments */
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch {
  /* ignore */
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = String(file.originalname || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`);
  }
});

export const escalationUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^(image\/|application\/pdf|text\/plain)/.test(file.mimetype || '');
    cb(ok ? null : new Error('Only images, PDF, or text files are allowed'), ok);
  }
});

export const uploadEscalationAttachment = async (req, res, next) => {
  try {
    if (!(await hasAttachmentsTable())) {
      return res.status(503).json({ error: { message: 'Attachments are not available yet' } });
    }
    const id = parseInt(req.params.id, 10);
    const row = await loadEscalationById(id);
    if (!row) return res.status(404).json({ error: { message: 'Escalation not found' } });
    const access = await ensureAgencyAccess(req, row.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });

    const relPath = `escalations/${req.file.filename}`;
    const [result] = await pool.execute(
      `INSERT INTO support_ticket_attachments
        (ticket_id, uploaded_by_user_id, file_name, file_path, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        req.user.id,
        req.file.originalname || req.file.filename,
        relPath,
        req.file.mimetype || null,
        req.file.size || null
      ]
    );

    res.status(201).json({
      id: result.insertId,
      ticket_id: id,
      file_name: req.file.originalname || req.file.filename,
      file_path: relPath,
      mime_type: req.file.mimetype,
      file_size: req.file.size
    });
  } catch (e) {
    next(e);
  }
};

/** Dashboard / Support Hub summary */
export const getEscalationsSummary = async (req, res, next) => {
  try {
    if (!(await hasEscalationColumns())) {
      return res.json({ available: false, counts: { open: 0 }, recent: [] });
    }
    const agencyId = parseInt(req.query?.agencyId, 10);
    const access = await ensureAgencyAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const counts = await countEscalations(agencyId, req.user?.id || null);
    const [rows] = await pool.execute(
      `SELECT t.*,
              cb.first_name AS created_by_first_name,
              cb.last_name AS created_by_last_name,
              cl.first_name AS claimed_by_first_name,
              cl.last_name AS claimed_by_last_name
       FROM support_tickets t
       LEFT JOIN users cb ON cb.id = t.created_by_user_id
       LEFT JOIN users cl ON cl.id = t.claimed_by_user_id
       WHERE t.agency_id = ?
         AND COALESCE(t.ticket_kind, 'support') = 'escalation'
         AND LOWER(COALESCE(t.escalation_status, 'submitted')) NOT IN ('resolved', 'closed')
       ORDER BY t.immediate_action_required DESC, t.created_at DESC
       LIMIT 8`,
      [agencyId]
    );

    res.json({
      available: true,
      counts,
      recent: (rows || []).map(mapEscalationRow)
    });
  } catch (e) {
    next(e);
  }
};
