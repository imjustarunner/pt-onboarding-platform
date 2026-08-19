/**
 * Phase 2: learn from staff edits to AI drafts — proposals queue + prompt guardrails.
 */
import pool from '../config/database.js';
import { computeEditSummary, buildPromptGuardrailsBlock } from '../utils/schoolSupportReplyLearning.shared.js';
import {
  createReplyLibraryEntry,
  inferIntentFromTicket
} from './schoolSupportReplyLibrary.service.js';
import { normalizeIntentKey } from '../utils/schoolSupportReplyLibrary.shared.js';

export { computeEditSummary, buildPromptGuardrailsBlock };

function safeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapProposal(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    agencyId: Number(row.agency_id),
    schoolOrganizationId: row.school_organization_id ? Number(row.school_organization_id) : null,
    supportTicketId: Number(row.support_ticket_id),
    intentKey: normalizeIntentKey(row.intent_key),
    title: row.title,
    subjectTemplate: row.subject_template || null,
    originalDraft: row.original_draft || null,
    proposedBody: row.proposed_body,
    editSummary: row.edit_summary || null,
    status: row.status,
    libraryEntryId: row.library_entry_id ? Number(row.library_entry_id) : null,
    reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
    reviewedAt: row.reviewed_at,
    createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ticketSubject: row.ticket_subject || null,
    schoolName: row.school_name || null
  };
}

function mapPromptNote(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    agencyId: Number(row.agency_id),
    schoolOrganizationId: row.school_organization_id ? Number(row.school_organization_id) : null,
    sourceTicketId: row.source_ticket_id ? Number(row.source_ticket_id) : null,
    noteType: row.note_type,
    promptText: row.prompt_text,
    isActive: row.is_active === 1 || row.is_active === true,
    createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    createdAt: row.created_at
  };
}

export async function listActivePromptNotes(agencyId, { limit = 12 } = {}) {
  const aid = safeInt(agencyId);
  if (!aid) return [];
  const lim = Math.max(1, Math.min(Number(limit) || 12, 24));
  const [rows] = await pool.execute(
    `SELECT *
     FROM support_ai_prompt_notes
     WHERE agency_id = ?
       AND is_active = TRUE
     ORDER BY created_at DESC
     LIMIT ${lim}`,
    [aid]
  );
  return (rows || []).map(mapPromptNote).filter(Boolean);
}

export async function createPromptNote({
  agencyId,
  schoolOrganizationId = null,
  sourceTicketId = null,
  noteType = 'manual',
  promptText,
  createdByUserId = null
} = {}) {
  const aid = safeInt(agencyId);
  const text = String(promptText || '').trim().slice(0, 2000);
  if (!aid || !text) return null;

  const allowed = new Set(['reject_draft', 'edit_pattern', 'manual']);
  const type = allowed.has(noteType) ? noteType : 'manual';

  const [result] = await pool.execute(
    `INSERT INTO support_ai_prompt_notes
      (agency_id, school_organization_id, source_ticket_id, note_type, prompt_text, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      aid,
      schoolOrganizationId ? Number(schoolOrganizationId) : null,
      sourceTicketId ? Number(sourceTicketId) : null,
      type,
      text,
      createdByUserId ? Number(createdByUserId) : null
    ]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM support_ai_prompt_notes WHERE id = ? LIMIT 1`,
    [result.insertId]
  );
  return mapPromptNote(rows?.[0]);
}

export async function createPromptNoteFromRejection({
  ticket,
  note,
  createdByUserId = null
} = {}) {
  const text = String(note || '').trim();
  if (!text || !ticket?.agency_id) return null;
  return createPromptNote({
    agencyId: ticket.agency_id,
    schoolOrganizationId: ticket.school_organization_id,
    sourceTicketId: ticket.id,
    noteType: 'reject_draft',
    promptText: text,
    createdByUserId
  });
}

async function hasPendingProposalForTicket(ticketId) {
  const tid = safeInt(ticketId);
  if (!tid) return false;
  const [rows] = await pool.execute(
    `SELECT 1 FROM school_support_reply_proposals
     WHERE support_ticket_id = ? AND status = 'pending'
     LIMIT 1`,
    [tid]
  );
  return !!rows?.[0];
}

export async function createProposalFromEditedAnswer({
  ticket,
  originalDraft,
  finalAnswer,
  createdByUserId = null,
  skipIfPromoted = false
} = {}) {
  if (skipIfPromoted) return null;
  const aid = safeInt(ticket?.agency_id);
  const tid = safeInt(ticket?.id);
  const draft = String(originalDraft || ticket?.ai_draft_response || '').trim();
  const final = String(finalAnswer || '').trim();
  if (!aid || !tid || !draft || !final || draft === final) return null;
  if (await hasPendingProposalForTicket(tid)) return null;

  const editSummary = computeEditSummary(draft, final);
  const intentKey = inferIntentFromTicket(ticket);
  const title = String(ticket?.subject || ticket?.source_email_subject || 'School reply edit').trim().slice(0, 255);

  const [result] = await pool.execute(
    `INSERT INTO school_support_reply_proposals
      (agency_id, school_organization_id, support_ticket_id, intent_key, title, subject_template,
       original_draft, proposed_body, edit_summary, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      aid,
      ticket.school_organization_id ? Number(ticket.school_organization_id) : null,
      tid,
      intentKey,
      title,
      ticket.source_email_subject || ticket.subject || null,
      draft.slice(0, 12000),
      final.slice(0, 12000),
      editSummary,
      createdByUserId ? Number(createdByUserId) : null
    ]
  );

  try {
    await pool.execute(
      `UPDATE support_tickets SET ai_draft_edit_summary = ? WHERE id = ?`,
      [editSummary, tid]
    );
  } catch {
    // column may not exist on older DBs
  }

  return getReplyProposal(result.insertId);
}

export async function getReplyProposal(id) {
  const pid = safeInt(id);
  if (!pid) return null;
  const [rows] = await pool.execute(
    `SELECT p.*,
            t.subject AS ticket_subject,
            s.name AS school_name
     FROM school_support_reply_proposals p
     LEFT JOIN support_tickets t ON t.id = p.support_ticket_id
     LEFT JOIN agencies s ON s.id = p.school_organization_id
     WHERE p.id = ?
     LIMIT 1`,
    [pid]
  );
  return mapProposal(rows?.[0]);
}

export async function listReplyProposals({
  agencyId,
  status = 'pending',
  limit = 50
} = {}) {
  const aid = safeInt(agencyId);
  if (!aid) return [];
  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
  const statusNorm = ['pending', 'approved', 'dismissed'].includes(status) ? status : 'pending';

  const [rows] = await pool.execute(
    `SELECT p.*,
            t.subject AS ticket_subject,
            s.name AS school_name
     FROM school_support_reply_proposals p
     LEFT JOIN support_tickets t ON t.id = p.support_ticket_id
     LEFT JOIN agencies s ON s.id = p.school_organization_id
     WHERE p.agency_id = ?
       AND p.status = ?
     ORDER BY p.created_at DESC
     LIMIT ${lim}`,
    [aid, statusNorm]
  );
  return (rows || []).map(mapProposal).filter(Boolean);
}

export async function countPendingReplyProposals(agencyId) {
  const aid = safeInt(agencyId);
  if (!aid) return 0;
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n
     FROM school_support_reply_proposals
     WHERE agency_id = ? AND status = 'pending'`,
    [aid]
  );
  return Number(rows?.[0]?.n || 0);
}

export async function approveReplyProposal(proposalId, { reviewedByUserId = null, title = null } = {}) {
  const pid = safeInt(proposalId);
  if (!pid) throw Object.assign(new Error('Invalid proposal id'), { status: 400 });

  const proposal = await getReplyProposal(pid);
  if (!proposal) throw Object.assign(new Error('Proposal not found'), { status: 404 });
  if (proposal.status !== 'pending') {
    throw Object.assign(new Error('Proposal is no longer pending'), { status: 409 });
  }

  const entry = await createReplyLibraryEntry({
    agencyId: proposal.agencyId,
    schoolOrganizationId: proposal.schoolOrganizationId,
    intentKey: proposal.intentKey,
    title: String(title || proposal.title).trim(),
    subjectTemplate: proposal.subjectTemplate,
    bodyTemplate: proposal.proposedBody,
    tags: [proposal.intentKey, 'from_staff_edit'],
    sourceTicketId: proposal.supportTicketId,
    createdByUserId: reviewedByUserId
  });

  await pool.execute(
    `UPDATE school_support_reply_proposals
     SET status = 'approved',
         library_entry_id = ?,
         reviewed_by_user_id = ?,
         reviewed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [entry.id, reviewedByUserId ? Number(reviewedByUserId) : null, pid]
  );

  return { proposal: await getReplyProposal(pid), libraryEntry: entry };
}

export async function dismissReplyProposal(proposalId, { reviewedByUserId = null } = {}) {
  const pid = safeInt(proposalId);
  if (!pid) throw Object.assign(new Error('Invalid proposal id'), { status: 400 });

  await pool.execute(
    `UPDATE school_support_reply_proposals
     SET status = 'dismissed',
         reviewed_by_user_id = ?,
         reviewed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending'`,
    [reviewedByUserId ? Number(reviewedByUserId) : null, pid]
  );
  return getReplyProposal(pid);
}

export async function buildAgencyPromptGuardrailsBlock(agencyId) {
  const notes = await listActivePromptNotes(agencyId);
  return buildPromptGuardrailsBlock(notes);
}
