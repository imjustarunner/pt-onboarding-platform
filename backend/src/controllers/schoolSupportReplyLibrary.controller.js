import {
  SCHOOL_REPLY_INTENT_KEYS,
  SCHOOL_REPLY_INTENT_LABELS,
  listReplyLibraryEntries,
  getReplyLibraryEntry,
  createReplyLibraryEntry,
  updateReplyLibraryEntry,
  deactivateReplyLibraryEntry,
  matchReplyLibraryForTicket,
  promoteTicketAnswerToLibrary,
  inferIntentFromTicket
} from '../services/schoolSupportReplyLibrary.service.js';
import {
  listReplyProposals,
  countPendingReplyProposals,
  approveReplyProposal,
  dismissReplyProposal
} from '../services/schoolSupportReplyLearning.service.js';
import { reindexAgencyReplyEmbeddings } from '../services/schoolSupportReplyRetrieval.service.js';
import { backfillSchoolReplyGmailHistory } from '../services/schoolSupportGmailHistory.service.js';
import pool from '../config/database.js';

function isAgencyAdminUser(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant'].includes(role);
}

function parseAgencyId(req) {
  const raw = req.query?.agencyId ?? req.body?.agencyId ?? req.tenantAgencyIds?.[0];
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function ensureTicketAccess(req, ticketId) {
  const id = parseInt(ticketId, 10);
  if (!id) return { ok: false, status: 400, message: 'Invalid ticket id' };
  const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [id]);
  const ticket = rows?.[0] || null;
  if (!ticket) return { ok: false, status: 404, message: 'Ticket not found' };

  const agencyIds = req.tenantAgencyIds;
  if (Array.isArray(agencyIds) && agencyIds.length) {
    const aid = Number(ticket.agency_id || 0);
    if (aid && !agencyIds.includes(aid)) {
      return { ok: false, status: 403, message: 'Ticket not in your agency scope' };
    }
  }
  return { ok: true, ticket };
}

export const listSchoolSupportReplyLibrary = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can view the reply library' } });
    }
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const entries = await listReplyLibraryEntries({
      agencyId,
      schoolOrganizationId: req.query?.schoolOrganizationId ? parseInt(req.query.schoolOrganizationId, 10) : null,
      intentKey: req.query?.intentKey || null,
      includeInactive: req.query?.includeInactive === '1' || req.query?.includeInactive === 'true',
      search: req.query?.search || null
    });
    res.json({
      entries,
      intentKeys: SCHOOL_REPLY_INTENT_KEYS,
      intentLabels: SCHOOL_REPLY_INTENT_LABELS,
      pendingProposalCount: await countPendingReplyProposals(agencyId)
    });
  } catch (e) {
    next(e);
  }
};

export const createSchoolSupportReplyLibraryEntry = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can create library entries' } });
    }
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const entry = await createReplyLibraryEntry({
      agencyId,
      schoolOrganizationId: req.body?.schoolOrganizationId || null,
      intentKey: req.body?.intentKey,
      title: req.body?.title,
      subjectTemplate: req.body?.subjectTemplate,
      bodyTemplate: req.body?.bodyTemplate,
      tags: req.body?.tags,
      keywords: req.body?.keywords,
      sourceTicketId: req.body?.sourceTicketId || null,
      createdByUserId: req.user?.id
    });
    res.status(201).json(entry);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const updateSchoolSupportReplyLibraryEntry = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can update library entries' } });
    }
    const entryId = parseInt(req.params.id, 10);
    const existing = await getReplyLibraryEntry(entryId);
    if (!existing) return res.status(404).json({ error: { message: 'Entry not found' } });

    const agencyId = parseAgencyId(req) || existing.agencyId;
    if (agencyId !== existing.agencyId) {
      return res.status(403).json({ error: { message: 'Entry not in your agency scope' } });
    }

    const entry = await updateReplyLibraryEntry(entryId, {
      schoolOrganizationId: req.body?.schoolOrganizationId,
      intentKey: req.body?.intentKey,
      title: req.body?.title,
      subjectTemplate: req.body?.subjectTemplate,
      bodyTemplate: req.body?.bodyTemplate,
      tags: req.body?.tags,
      keywords: req.body?.keywords,
      isActive: req.body?.isActive,
      updatedByUserId: req.user?.id
    });
    res.json(entry);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const deactivateSchoolSupportReplyLibraryEntry = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can deactivate library entries' } });
    }
    const entryId = parseInt(req.params.id, 10);
    const existing = await getReplyLibraryEntry(entryId);
    if (!existing) return res.status(404).json({ error: { message: 'Entry not found' } });

    const entry = await deactivateReplyLibraryEntry(entryId, { updatedByUserId: req.user?.id });
    res.json(entry);
  } catch (e) {
    next(e);
  }
};

export const matchSchoolSupportReplyLibraryForTicket = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can match library entries' } });
    }
    const access = await ensureTicketAccess(req, req.params.ticketId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const ticket = access.ticket;
    const intentKey = inferIntentFromTicket(ticket);
    const matches = await matchReplyLibraryForTicket({
      agencyId: ticket.agency_id,
      schoolOrganizationId: ticket.school_organization_id,
      subject: ticket.subject || ticket.source_email_subject,
      question: ticket.question,
      intentKey
    });
    res.json({ intentKey, matches });
  } catch (e) {
    next(e);
  }
};

export const promoteSchoolSupportReplyFromTicket = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can promote replies to the library' } });
    }
    const access = await ensureTicketAccess(req, req.params.ticketId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const ticket = access.ticket;
    const answer = String(req.body?.answer || ticket.answer || '').trim();
    if (!answer) return res.status(400).json({ error: { message: 'answer text is required' } });

    const entry = await promoteTicketAnswerToLibrary({
      ticket,
      answer,
      title: req.body?.title,
      intentKey: req.body?.intentKey,
      schoolOrganizationId: req.body?.schoolOrganizationId,
      createdByUserId: req.user?.id
    });
    res.status(201).json(entry);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listSchoolSupportReplyProposals = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can view reply proposals' } });
    }
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const proposals = await listReplyProposals({
      agencyId,
      status: req.query?.status || 'pending'
    });
    res.json({ proposals });
  } catch (e) {
    next(e);
  }
};

export const countSchoolSupportReplyProposals = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can view reply proposals' } });
    }
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const count = await countPendingReplyProposals(agencyId);
    res.json({ count });
  } catch (e) {
    next(e);
  }
};

export const approveSchoolSupportReplyProposal = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can approve reply proposals' } });
    }
    const proposalId = parseInt(req.params.proposalId, 10);
    const result = await approveReplyProposal(proposalId, {
      reviewedByUserId: req.user?.id,
      title: req.body?.title
    });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const dismissSchoolSupportReplyProposal = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can dismiss reply proposals' } });
    }
    const proposalId = parseInt(req.params.proposalId, 10);
    const proposal = await dismissReplyProposal(proposalId, { reviewedByUserId: req.user?.id });
    res.json(proposal);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const reindexSchoolSupportReplyEmbeddings = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can reindex reply embeddings' } });
    }
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const limit = parseInt(req.body?.limit || req.query?.limit || '200', 10);
    const result = await reindexAgencyReplyEmbeddings(agencyId, { limit });
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
};

export const backfillSchoolSupportReplyGmailHistory = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can backfill Gmail reply history' } });
    }
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const maxMessages = parseInt(req.body?.maxMessages || req.query?.maxMessages || '150', 10);
    const maxThreads = parseInt(req.body?.maxThreads || req.query?.maxThreads || '120', 10);
    const result = await backfillSchoolReplyGmailHistory({
      agencyId,
      maxMessages,
      maxThreads,
      skipExisting: req.body?.skipExisting !== false
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
};
