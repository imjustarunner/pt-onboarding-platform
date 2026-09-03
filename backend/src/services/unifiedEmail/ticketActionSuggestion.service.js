import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import ClientSchoolStaffRoiAccess from '../../models/ClientSchoolStaffRoiAccess.model.js';
import { callGeminiText } from '../geminiText.service.js';
import {
  getTicketAttachmentRow,
  ingestTicketAttachmentsFromGmail,
  isPdfAttachment,
  listTicketAttachments,
  parseLikelyClientName,
  readTicketAttachmentBuffer
} from './ticketInboundAttachments.service.js';
import Agency from '../../models/Agency.model.js';
import AgencySchool from '../../models/AgencySchool.model.js';
import OrganizationAffiliation from '../../models/OrganizationAffiliation.model.js';
import ReferralPacketDraft from '../../models/ReferralPacketDraft.model.js';
import ClientPhiDocument from '../../models/ClientPhiDocument.model.js';
import DocumentEncryptionService from '../documentEncryption.service.js';
import StorageService from '../storage.service.js';
import { buildAndPersistResponsePlanForTicket } from '../schoolSupportResponsePlan.service.js';
import { queueSchoolStaffGoogleGroupSync } from '../schoolGroupProvisioning.service.js';

export const TICKET_ACTION_TYPES = {
  CREATE_SCHOOL_CONTACT: 'create_school_contact',
  CREATE_SCHOOL_STAFF_ACCOUNT: 'create_school_staff_account',
  GENERATE_TEMP_PASSWORD: 'generate_temp_password',
  UPDATE_SCHOOL_CONTACT: 'update_school_contact',
  UPLOAD_SCHOOL_PACKET: 'upload_school_packet',
  OTHER: 'other'
};

export const TICKET_ACTION_STATUSES = {
  PROPOSED: 'proposed',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

function normalizeEmail(value) {
  const s = String(value || '').trim().toLowerCase();
  return s.includes('@') ? s : '';
}

function truncate(value, max = 255) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function parseName(fullName) {
  const s = String(fullName || '').trim();
  if (!s) return { firstName: 'School', lastName: 'Staff' };
  const parts = s.split(/\s+/g).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Staff' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === 'object') return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parsePayload(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (value == null) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function hasActionItemsTable() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'support_ticket_action_items'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function findContactByEmail({ schoolOrganizationId, email }) {
  const em = normalizeEmail(email);
  if (!em || !schoolOrganizationId) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT id, full_name, email, role_title
       FROM school_contacts
       WHERE school_organization_id = ?
         AND LOWER(COALESCE(email, '')) = ?
       LIMIT 1`,
      [Number(schoolOrganizationId), em]
    );
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

async function findAccountByEmail(email) {
  const em = normalizeEmail(email);
  if (!em) return null;
  try {
    const direct = await User.findByEmail(em);
    if (direct?.id) return direct;
  } catch {
    // fall through
  }
  try {
    const [rows] = await pool.execute(
      `SELECT id, email, work_email, first_name, last_name, role, status
       FROM users
       WHERE LOWER(COALESCE(email, '')) = ?
          OR LOWER(COALESCE(work_email, '')) = ?
       LIMIT 1`,
      [em, em]
    );
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

function collectCandidateEmails({ fromEmail, recipients }) {
  const list = [];
  const push = (v) => {
    const em = normalizeEmail(v);
    if (em) list.push(em);
  };
  push(fromEmail);
  for (const r of recipients || []) push(r);
  return Array.from(new Set(list));
}

/**
 * Gemini extraction of newly introduced people. Emails must appear in the
 * allowlist (headers) so the model cannot invent addresses.
 */
async function extractIntroducedPeopleWithGemini({
  subject,
  bodyText,
  fromEmail,
  recipientEmails,
  schoolName
}) {
  const allowlist = collectCandidateEmails({ fromEmail, recipients: recipientEmails });
  if (!allowlist.length) return [];

  const prompt = [
    'Extract people who appear to be NEW school staff / contacts being introduced or requested to be added.',
    'Examples: "please add Natalie Madrid, our new school social worker", "cc\'d her so she can be our point of contact".',
    'Do NOT invent email addresses. Only use emails from the allowlist below.',
    'If a person is named but their email is not in the allowlist, still include them with email null.',
    'Return JSON only:',
    '{"people":[{"name":string,"email":string|null,"role":string|null,"ask":string|null,"needsPortalAccess":boolean,"confidence":number}]}',
    '',
    `School: ${schoolName || 'Unknown school'}`,
    `From: ${fromEmail || ''}`,
    `Email allowlist: ${allowlist.join(', ')}`,
    `Subject: ${String(subject || '')}`,
    'Body:',
    String(bodyText || '').slice(0, 6000)
  ].join('\n');

  try {
    const { text } = await callGeminiText({ prompt, temperature: 0.1, maxOutputTokens: 500 });
    const jsonText = String(text || '')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(jsonText);
    const people = Array.isArray(parsed?.people) ? parsed.people : [];
    return people
      .map((p) => {
        const email = normalizeEmail(p?.email);
        const emailOk = !email || allowlist.includes(email);
        return {
          name: truncate(p?.name, 120) || null,
          email: emailOk ? email || null : null,
          role: truncate(p?.role, 120) || null,
          ask: truncate(p?.ask, 255) || null,
          needsPortalAccess: p?.needsPortalAccess === true,
          confidence: Number.isFinite(Number(p?.confidence))
            ? Math.max(0, Math.min(1, Number(p.confidence)))
            : 0.6
        };
      })
      .filter((p) => p.name || p.email);
  } catch {
    return [];
  }
}

function heuristicIntroducedPeople({ subject, bodyText, fromEmail, recipientEmails }) {
  const text = `${String(subject || '')}\n${String(bodyText || '')}`;
  const lower = text.toLowerCase();
  const looksLikeAddRequest =
    /\b(add (her|him|them|this)|new school|point of contact|please add|on (this )?listserv|listserv)\b/i.test(
      lower
    );
  if (!looksLikeAddRequest) return [];

  const people = [];
  const nameMatch = text.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}),?\s+(?:our|the)?\s*(?:new\s+)?(?:school\s+)?(?:social worker|counselor|psychologist|point of contact|contact)\b/
  );
  const roleMatch = text.match(
    /\b(?:new\s+)?(?:school\s+)?(social worker|counselor|psychologist|scheduler|administrator|principal)\b/i
  );
  const recipients = collectCandidateEmails({ fromEmail, recipients: recipientEmails }).filter(
    (em) => em !== normalizeEmail(fromEmail)
  );

  if (nameMatch?.[1] || recipients.length) {
    people.push({
      name: nameMatch?.[1] ? truncate(nameMatch[1], 120) : null,
      email: recipients[0] || null,
      role: roleMatch?.[1] ? truncate(roleMatch[1], 120) : null,
      ask: 'add_to_contacts',
      needsPortalAccess:
        /\b(listserv|portal|login|account|access|point of contact)\b/i.test(lower),
      confidence: 0.55
    });
  }
  return people;
}

async function insertActionItem({
  ticketId,
  actionType,
  title,
  payload,
  confidence,
  proposedBy = 'ai'
}) {
  const [result] = await pool.execute(
    `INSERT INTO support_ticket_action_items
      (ticket_id, action_type, status, title, payload_json, proposed_by, confidence)
     VALUES (?, ?, 'proposed', ?, ?, ?, ?)`,
    [
      Number(ticketId),
      actionType,
      truncate(title, 255),
      JSON.stringify(payload || {}),
      proposedBy,
      Number.isFinite(Number(confidence)) ? Number(confidence) : null
    ]
  );
  return Number(result?.insertId || 0);
}

async function proposePacketUploadActions({
  ticketId,
  schoolOrganizationId,
  schoolName,
  subject,
  bodyText,
  ticket = null
}) {
  if (!(await hasActionItemsTable())) return { created: 0, attachments: [], pdfCount: 0 };
  let attachments = await listTicketAttachments(ticketId);
  if (!attachments.length && ticket) {
    try {
      const ingested = await ingestTicketAttachmentsFromGmail({ ticket });
      attachments = ingested?.attachments || (await listTicketAttachments(ticketId));
    } catch (err) {
      console.warn('[ticketActionSuggestion] ingest attachments failed:', err?.message || err);
    }
  }
  const pdfs = (attachments || []).filter((a) =>
    isPdfAttachment({ filename: a.file_name, mimeType: a.mime_type })
  );
  const guessedName = parseLikelyClientName(subject, bodyText);
  let created = 0;
  for (const pdf of pdfs) {
    const already = await existingProposedForAttachment({
      ticketId,
      actionType: TICKET_ACTION_TYPES.UPLOAD_SCHOOL_PACKET,
      attachmentId: pdf.id
    });
    if (already) continue;
    const nameLabel =
      [guessedName.firstName, guessedName.lastName].filter(Boolean).join(' ') ||
      String(pdf.file_name || 'PDF').replace(/\.pdf$/i, '');
    const id = await insertActionItem({
      ticketId,
      actionType: TICKET_ACTION_TYPES.UPLOAD_SCHOOL_PACKET,
      title: truncate(`Upload packet as new client at ${schoolName || 'school'}: ${nameLabel}`, 255),
      confidence: 0.8,
      payload: {
        schoolOrganizationId,
        attachmentId: pdf.id,
        fileName: pdf.file_name || null,
        firstName: guessedName.firstName || null,
        lastName: guessedName.lastName || null,
        source: 'email_intake'
      }
    });
    if (id) created += 1;
  }
  return { created, attachments, pdfCount: pdfs.length };
}

export async function ensurePacketUploadActionsForTicket(ticket) {
  if (!ticket?.id || !ticket.school_organization_id) return { created: 0 };
  let schoolName = null;
  try {
    const [schoolRows] = await pool.execute(
      `SELECT name FROM agencies WHERE id = ? LIMIT 1`,
      [Number(ticket.school_organization_id)]
    );
    schoolName = schoolRows?.[0]?.name || null;
  } catch {
    schoolName = null;
  }
  return proposePacketUploadActions({
    ticketId: ticket.id,
    schoolOrganizationId: Number(ticket.school_organization_id),
    schoolName,
    subject: ticket.source_email_subject || ticket.subject || '',
    bodyText: ticket.question || '',
    ticket
  });
}

async function existingProposedForAttachment({ ticketId, actionType, attachmentId }) {
  const aid = Number(attachmentId || 0);
  if (!aid) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT id, payload_json
       FROM support_ticket_action_items
       WHERE ticket_id = ?
         AND action_type = ?
         AND status IN ('proposed', 'approved', 'completed')`,
      [Number(ticketId), actionType]
    );
    for (const row of rows || []) {
      const payload = parsePayload(row.payload_json);
      if (Number(payload.attachmentId || 0) === aid) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function existingProposedForEmail({ ticketId, actionType, email }) {
  const em = normalizeEmail(email);
  if (!em) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT id, payload_json
       FROM support_ticket_action_items
       WHERE ticket_id = ?
         AND action_type = ?
         AND status IN ('proposed', 'approved', 'completed')`,
      [Number(ticketId), actionType]
    );
    for (const row of rows || []) {
      const payload = parsePayload(row.payload_json);
      if (normalizeEmail(payload.email) === em) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Analyze a support ticket (usually email-sourced) and insert proposed actions.
 */
export async function suggestActionsForTicket({
  ticketId,
  schoolOrganizationId,
  schoolName = null,
  fromEmail = null,
  recipients = null,
  subject = null,
  bodyText = null,
  force = false
} = {}) {
  if (!(await hasActionItemsTable())) return { created: 0, people: [], skipped: 'table_missing' };

  const tid = Number(ticketId || 0);
  const sid = Number(schoolOrganizationId || 0);
  if (!tid || !sid) return { created: 0, people: [], skipped: 'invalid_ids' };

  let ticket = null;
  const [ticketRows] = await pool.execute(
    `SELECT id, school_organization_id, agency_id, client_id, source_email_from, source_email_subject,
            source_email_recipients, source_email_message_id, question, subject, ai_draft_metadata_json
     FROM support_tickets WHERE id = ? LIMIT 1`,
    [tid]
  );
  ticket = ticketRows?.[0] || null;
  if (!ticket) return { created: 0, people: [], skipped: 'ticket_not_found' };

  const resolvedFrom = normalizeEmail(fromEmail || ticket?.source_email_from);
  const resolvedRecipients = Array.isArray(recipients)
    ? recipients.map(normalizeEmail).filter(Boolean)
    : parseJsonArray(ticket?.source_email_recipients).map(normalizeEmail).filter(Boolean);
  const resolvedSubject = subject != null ? subject : ticket?.source_email_subject || ticket?.subject || '';
  const resolvedBody = bodyText != null ? bodyText : ticket?.question || '';
  let resolvedSchoolName = schoolName;
  if (!resolvedSchoolName) {
    try {
      const [schoolRows] = await pool.execute(
        `SELECT name FROM agencies WHERE id = ? LIMIT 1`,
        [sid]
      );
      resolvedSchoolName = schoolRows?.[0]?.name || null;
    } catch {
      resolvedSchoolName = null;
    }
  }

  const packetFirst = await proposePacketUploadActions({
    ticketId: tid,
    schoolOrganizationId: sid,
    schoolName: resolvedSchoolName,
    subject: resolvedSubject,
    bodyText: resolvedBody,
    ticket
  });

  if (!force) {
    const [existing] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM support_ticket_action_items WHERE ticket_id = ?`,
      [tid]
    );
    if (Number(existing?.[0]?.cnt || 0) > 0) {
      return { created: packetFirst.created, people: [], skipped: 'already_suggested' };
    }
  }

  const geminiPeople = await extractIntroducedPeopleWithGemini({
    subject: resolvedSubject,
    bodyText: resolvedBody,
    fromEmail: resolvedFrom,
    recipientEmails: resolvedRecipients,
    schoolName: resolvedSchoolName
  });
  const heuristicPeople = heuristicIntroducedPeople({
    subject: resolvedSubject,
    bodyText: resolvedBody,
    fromEmail: resolvedFrom,
    recipientEmails: resolvedRecipients
  });

  // Merge by email (prefer Gemini), then by name.
  const byKey = new Map();
  const keyFor = (p) => normalizeEmail(p.email) || `name:${String(p.name || '').toLowerCase()}`;
  for (const p of [...heuristicPeople, ...geminiPeople]) {
    const key = keyFor(p);
    if (!key || key === 'name:') continue;
    const prev = byKey.get(key);
    if (!prev || Number(p.confidence || 0) >= Number(prev.confidence || 0)) {
      byKey.set(key, { ...prev, ...p });
    }
  }

  // Also surface unknown Cc recipients even if Gemini missed them, when body looks like an add request.
  const looksLikeAdd =
    geminiPeople.length > 0 ||
    heuristicPeople.length > 0 ||
    /\b(please add|add (her|him|them)|new school|listserv|point of contact)\b/i.test(
      `${resolvedSubject}\n${resolvedBody}`
    );
  if (looksLikeAdd) {
    for (const em of resolvedRecipients) {
      if (em === resolvedFrom) continue;
      const key = em;
      if (!byKey.has(key)) {
        byKey.set(key, {
          name: null,
          email: em,
          role: null,
          ask: 'add_to_contacts',
          needsPortalAccess: true,
          confidence: 0.45
        });
      }
    }
  }

  let created = 0;
  const peopleOut = [];

  for (const person of byKey.values()) {
    const email = normalizeEmail(person.email);
    // Skip the sender themselves for "new staff" actions unless Gemini explicitly flagged them.
    if (email && email === resolvedFrom && !person.name) continue;

    const contact = email ? await findContactByEmail({ schoolOrganizationId: sid, email }) : null;
    const account = email ? await findAccountByEmail(email) : null;
    const isSchoolStaffAccount =
      account && String(account.role || '').toLowerCase() === 'school_staff';

    peopleOut.push({
      name: person.name,
      email,
      role: person.role,
      isKnownContact: !!contact,
      isKnownAccount: !!account,
      needsPortalAccess: !!person.needsPortalAccess
    });

    const displayName =
      person.name ||
      contact?.full_name ||
      (account ? `${account.first_name || ''} ${account.last_name || ''}`.trim() : '') ||
      email ||
      'Unknown person';
    const roleTitle = person.role || contact?.role_title || null;

    if (!contact && (email || person.name)) {
      const already = email
        ? await existingProposedForEmail({
            ticketId: tid,
            actionType: TICKET_ACTION_TYPES.CREATE_SCHOOL_CONTACT,
            email
          })
        : false;
      if (!already) {
        const id = await insertActionItem({
          ticketId: tid,
          actionType: TICKET_ACTION_TYPES.CREATE_SCHOOL_CONTACT,
          title: truncate(`Create school contact: ${displayName}${email ? ` (${email})` : ''}`, 255),
          confidence: person.confidence,
          payload: {
            schoolOrganizationId: sid,
            fullName: person.name || displayName,
            email: email || null,
            roleTitle,
            ask: person.ask || null,
            source: 'email_intake'
          }
        });
        if (id) created += 1;
      }
    }

    const wantsAccount =
      person.needsPortalAccess === true ||
      /\b(listserv|portal|login|account|access|point of contact)\b/i.test(
        String(person.ask || `${resolvedSubject} ${resolvedBody}`)
      );

    if (wantsAccount && email && !isSchoolStaffAccount) {
      const already = await existingProposedForEmail({
        ticketId: tid,
        actionType: TICKET_ACTION_TYPES.CREATE_SCHOOL_STAFF_ACCOUNT,
        email
      });
      if (!already) {
        const id = await insertActionItem({
          ticketId: tid,
          actionType: TICKET_ACTION_TYPES.CREATE_SCHOOL_STAFF_ACCOUNT,
          title: truncate(
            `Create school staff account + temp password: ${displayName} (${email})`,
            255
          ),
          confidence: person.confidence,
          payload: {
            schoolOrganizationId: sid,
            fullName: person.name || displayName,
            email,
            roleTitle,
            contactId: contact?.id || null,
            createContactIfMissing: !contact,
            generateTempPassword: true,
            source: 'email_intake'
          }
        });
        if (id) created += 1;
      }
    } else if (wantsAccount && email && isSchoolStaffAccount) {
      const already = await existingProposedForEmail({
        ticketId: tid,
        actionType: TICKET_ACTION_TYPES.GENERATE_TEMP_PASSWORD,
        email
      });
      if (!already) {
        const id = await insertActionItem({
          ticketId: tid,
          actionType: TICKET_ACTION_TYPES.GENERATE_TEMP_PASSWORD,
          title: truncate(`Generate temporary password: ${displayName} (${email})`, 255),
          confidence: person.confidence,
          payload: {
            schoolOrganizationId: sid,
            fullName: person.name || displayName,
            email,
            userId: account.id,
            source: 'email_intake'
          }
        });
        if (id) created += 1;
      }
    }
  }

  const packetLater = await proposePacketUploadActions({
    ticketId: tid,
    schoolOrganizationId: sid,
    schoolName: resolvedSchoolName,
    subject: resolvedSubject,
    bodyText: resolvedBody,
    ticket
  });
  created += packetLater.created;

  try {
    await buildAndPersistResponsePlanForTicket(tid);
  } catch {
    // best-effort
  }

  return { created, people: peopleOut, skipped: null };
}

export async function listTicketActionItems(ticketId) {
  if (!(await hasActionItemsTable())) return [];
  const tid = Number(ticketId || 0);
  if (!tid) return [];
  const [rows] = await pool.execute(
    `SELECT id, ticket_id, action_type, status, title, payload_json, result_json,
            proposed_by, confidence, approved_by_user_id, approved_at, executed_at,
            created_at, updated_at
     FROM support_ticket_action_items
     WHERE ticket_id = ?
     ORDER BY id ASC`,
    [tid]
  );
  return (rows || []).map((row) => ({
    ...row,
    payload: parsePayload(row.payload_json),
    result: parsePayload(row.result_json)
  }));
}

async function createSchoolContactFromPayload({ schoolOrganizationId, fullName, email, roleTitle, notes }) {
  const em = normalizeEmail(email);
  const existing = em
    ? await findContactByEmail({ schoolOrganizationId, email: em })
    : null;
  if (existing?.id) return { contact: existing, created: false };

  const [result] = await pool.execute(
    `INSERT INTO school_contacts
      (school_organization_id, full_name, email, role_title, notes, raw_source_text, is_primary, is_school_admin, is_scheduler)
     VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 0)`,
    [
      Number(schoolOrganizationId),
      truncate(fullName, 255) || null,
      em || null,
      truncate(roleTitle, 255) || null,
      notes || null
    ]
  );
  const insertedId = Number(result?.insertId || 0);
  const [rows] = await pool.execute(
    `SELECT id, full_name, email, role_title FROM school_contacts WHERE id = ? LIMIT 1`,
    [insertedId]
  );
  return { contact: rows?.[0] || { id: insertedId, full_name: fullName, email: em, role_title: roleTitle }, created: true };
}

async function createSchoolStaffAccountFromPayload({
  schoolOrganizationId,
  fullName,
  email,
  contactId = null,
  createContactIfMissing = true,
  actorUserId = null
}) {
  const em = normalizeEmail(email);
  if (!em) {
    const err = new Error('Email is required to create a school staff account');
    err.statusCode = 400;
    throw err;
  }

  let contact = contactId
    ? (
        await pool.execute(
          `SELECT id, full_name, email FROM school_contacts WHERE id = ? AND school_organization_id = ? LIMIT 1`,
          [Number(contactId), Number(schoolOrganizationId)]
        )
      )[0]?.[0] || null
    : await findContactByEmail({ schoolOrganizationId, email: em });

  if (!contact && createContactIfMissing) {
    const created = await createSchoolContactFromPayload({
      schoolOrganizationId,
      fullName,
      email: em,
      roleTitle: null,
      notes: 'Created from support ticket suggested action'
    });
    contact = created.contact;
  }
  if (!contact?.id) {
    const err = new Error('School contact not found; create contact first');
    err.statusCode = 400;
    throw err;
  }

  const existing = await findAccountByEmail(em);
  let user = null;
  if (existing?.id) {
    if (String(existing.role || '').toLowerCase() !== 'school_staff') {
      const err = new Error(
        `A user already exists with this email (role: ${existing.role}). Not creating a school staff account.`
      );
      err.statusCode = 409;
      throw err;
    }
    user = await User.findById(existing.id);
  } else {
    const { firstName, lastName } = parseName(fullName || contact.full_name);
    user = await User.create({
      email: em,
      passwordHash: null,
      firstName,
      lastName,
      role: 'school_staff',
      status: 'ACTIVE_EMPLOYEE'
    });
    try {
      await User.setWorkEmail(user.id, em);
    } catch {
      // ignore
    }
    try {
      await pool.execute('UPDATE users SET email = ?, username = ? WHERE id = ?', [em, em, user.id]);
    } catch {
      // ignore
    }
  }

  try {
    await User.updateStatus(user.id, 'ACTIVE_EMPLOYEE', actorUserId || null);
  } catch {
    // ignore
  }
  try {
    await User.update(user.id, { isActive: true });
  } catch {
    // ignore
  }

  await User.assignToAgency(user.id, Number(schoolOrganizationId));
  queueSchoolStaffGoogleGroupSync({
    schoolOrganizationId: Number(schoolOrganizationId),
    email: em,
    action: 'add'
  });
  await ClientSchoolStaffRoiAccess.revokeForSchoolStaff({
    schoolStaffUserId: user.id,
    schoolOrganizationId: Number(schoolOrganizationId),
    actorUserId: actorUserId || null
  });

  const temporaryPassword = await User.generateTemporaryPassword();
  const temporaryPasswordResult = await User.setTemporaryPassword(user.id, temporaryPassword, 24 * 7);

  return {
    user: {
      id: user.id,
      email: user.email || em,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role
    },
    contactId: contact.id,
    temporaryPassword,
    temporaryPasswordExpiresAt: temporaryPasswordResult?.expiresAt || null
  };
}

async function generateTempPasswordForUser({ userId, email }) {
  let user = null;
  if (userId) user = await User.findById(Number(userId));
  if (!user && email) user = await findAccountByEmail(email);
  if (!user?.id) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  if (String(user.role || '').toLowerCase() !== 'school_staff') {
    const err = new Error('Temporary passwords via this action are only for school_staff accounts');
    err.statusCode = 400;
    throw err;
  }
  const temporaryPassword = await User.generateTemporaryPassword();
  const temporaryPasswordResult = await User.setTemporaryPassword(user.id, temporaryPassword, 24 * 7);
  return {
    user: {
      id: user.id,
      email: user.email || email || null,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role
    },
    temporaryPassword,
    temporaryPasswordExpiresAt: temporaryPasswordResult?.expiresAt || null
  };
}

/**
 * Approve and execute a proposed action. Returns plaintext temp password once when applicable.
 */
async function resolveAgencyIdForOrganization(organizationId) {
  let agencyId =
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(organizationId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(organizationId)) ||
    null;
  if (!agencyId) {
    const allAgencies = await Agency.findAll(true, false, 'agency');
    agencyId = allAgencies?.[0]?.id || organizationId;
  }
  return agencyId;
}

function abbreviatedClientName(firstName, lastName) {
  const part = (value) => {
    const raw = String(value || '').replace(/[^A-Za-z]/g, '');
    if (!raw) return '';
    const slice = raw.slice(0, 3);
    return slice.charAt(0).toUpperCase() + slice.slice(1).toLowerCase();
  };
  return `${part(firstName)}${part(lastName)}`.trim();
}

async function uploadSchoolPacketFromTicketAction({ ticketId, payload, actorUserId }) {
  const schoolOrganizationId = Number(payload.schoolOrganizationId || 0);
  const attachmentId = Number(payload.attachmentId || 0);
  if (!schoolOrganizationId || !attachmentId) {
    const err = new Error('School and PDF attachment are required');
    err.statusCode = 400;
    throw err;
  }
  const organization = await Agency.findById(schoolOrganizationId);
  if (!organization) {
    const err = new Error('School not found');
    err.statusCode = 404;
    throw err;
  }
  const orgType = String(organization.organization_type || 'agency').toLowerCase();
  if (orgType !== 'school' && orgType !== 'program') {
    const err = new Error('Packet upload is only available for school organizations');
    err.statusCode = 403;
    throw err;
  }

  const attachment = await getTicketAttachmentRow(ticketId, attachmentId);
  if (!attachment) {
    const err = new Error('Ticket PDF attachment not found');
    err.statusCode = 404;
    throw err;
  }
  const buffer = await readTicketAttachmentBuffer(attachment);
  if (!buffer?.length) {
    const err = new Error('Could not read the attached PDF');
    err.statusCode = 400;
    throw err;
  }

  const originalName = String(attachment.file_name || payload.fileName || 'referral-packet.pdf');
  const sanitizedFilename = StorageService.sanitizeFilename(originalName);
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const quarantinePath = `referrals_quarantine/${organization.id}/${timestamp}-${randomId}-${sanitizedFilename}`;
  const encryptionAad = JSON.stringify({
    organizationId: organization.id,
    uploadType: 'referral_packet',
    filename: sanitizedFilename,
    source: 'support_ticket'
  });
  const encryptionResult = await DocumentEncryptionService.encryptBuffer(buffer, { aad: encryptionAad });
  const bucket = await StorageService.getGCSBucket();
  await bucket.file(quarantinePath).save(encryptionResult.encryptedBuffer, {
    contentType: 'application/octet-stream',
    metadata: {
      organizationId: String(organization.id),
      uploadedBy: String(actorUserId || ''),
      uploadType: 'referral_packet',
      uploadedAt: new Date().toISOString(),
      originalName: sanitizedFilename,
      originalContentType: attachment.mime_type || 'application/pdf',
      isEncrypted: 'true',
      encryptionKeyId: encryptionResult.encryptionKeyId,
      encryptionWrappedKey: encryptionResult.encryptionWrappedKeyB64,
      encryptionIv: encryptionResult.encryptionIvB64,
      encryptionAuthTag: encryptionResult.encryptionAuthTagB64,
      encryptionAlg: encryptionResult.encryptionAlg,
      encryptionAad
    }
  });

  const agencyId = await resolveAgencyIdForOrganization(organization.id);
  const firstName = String(payload.firstName || '').trim();
  const lastName = String(payload.lastName || '').trim();
  const draft = await ReferralPacketDraft.create({
    organizationId: organization.id,
    agencyId,
    uploadedByUserId: actorUserId || null,
    submissionDate: new Date().toISOString().split('T')[0],
    uploadNote: `Uploaded from support ticket #${ticketId}`,
    firstName: firstName || null,
    lastName: lastName || null,
    initials: abbreviatedClientName(firstName, lastName) || null,
    status: 'draft'
  });

  let phiDoc = null;
  try {
    phiDoc = await ClientPhiDocument.create({
      clientId: null,
      agencyId,
      schoolOrganizationId: organization.id,
      referralDraftId: draft.id,
      storagePath: quarantinePath,
      originalName,
      mimeType: attachment.mime_type || 'application/pdf',
      uploadedByUserId: actorUserId || null,
      quarantinePath,
      isEncrypted: true,
      encryptionKeyId: encryptionResult.encryptionKeyId,
      encryptionWrappedKey: encryptionResult.encryptionWrappedKeyB64,
      encryptionIv: encryptionResult.encryptionIvB64,
      encryptionAuthTag: encryptionResult.encryptionAuthTagB64,
      encryptionAlg: encryptionResult.encryptionAlg
    });
    if (phiDoc?.id) {
      await ReferralPacketDraft.updateById(draft.id, { phi_document_id: phiDoc.id });
    }
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[ticketActionSuggestion] PHI document create failed:', e.message);
    }
  }

  return {
    draftId: draft.id,
    phiDocumentId: phiDoc?.id || null,
    organizationId: organization.id,
    organizationSlug: organization.slug || null,
    organizationName: organization.name || null,
    agencyId,
    fileName: originalName,
    firstName: firstName || null,
    lastName: lastName || null
  };
}

export async function approveAndExecuteTicketAction({
  ticketId,
  actionId,
  approvedByUserId,
  payloadOverrides = null
} = {}) {
  if (!(await hasActionItemsTable())) {
    const err = new Error('Action items table not available (run migration 1181)');
    err.statusCode = 409;
    throw err;
  }

  const tid = Number(ticketId);
  const aid = Number(actionId);
  if (!tid || !aid) {
    const err = new Error('Invalid ticket or action id');
    err.statusCode = 400;
    throw err;
  }

  const [rows] = await pool.execute(
    `SELECT * FROM support_ticket_action_items WHERE id = ? AND ticket_id = ? LIMIT 1`,
    [aid, tid]
  );
  const action = rows?.[0] || null;
  if (!action) {
    const err = new Error('Action item not found');
    err.statusCode = 404;
    throw err;
  }
  if (!['proposed', 'failed'].includes(String(action.status || '').toLowerCase())) {
    const err = new Error(`Action cannot be approved from status "${action.status}"`);
    err.statusCode = 409;
    throw err;
  }

  const payload = {
    ...parsePayload(action.payload_json),
    ...(payloadOverrides && typeof payloadOverrides === 'object' ? payloadOverrides : {})
  };

  await pool.execute(
    `UPDATE support_ticket_action_items
     SET status = 'approved',
         approved_by_user_id = ?,
         approved_at = CURRENT_TIMESTAMP,
         payload_json = ?
     WHERE id = ?`,
    [Number(approvedByUserId) || null, JSON.stringify(payload), aid]
  );

  let result = {};
  let temporaryPassword = null;
  try {
    const type = String(action.action_type || '');
    if (type === TICKET_ACTION_TYPES.CREATE_SCHOOL_CONTACT) {
      const created = await createSchoolContactFromPayload({
        schoolOrganizationId: payload.schoolOrganizationId,
        fullName: payload.fullName,
        email: payload.email,
        roleTitle: payload.roleTitle,
        notes: payload.notes || 'Created from support ticket suggested action'
      });
      result = {
        contactId: created.contact?.id || null,
        created: created.created,
        email: created.contact?.email || payload.email || null,
        fullName: created.contact?.full_name || payload.fullName || null
      };
    } else if (type === TICKET_ACTION_TYPES.CREATE_SCHOOL_STAFF_ACCOUNT) {
      const created = await createSchoolStaffAccountFromPayload({
        schoolOrganizationId: payload.schoolOrganizationId,
        fullName: payload.fullName,
        email: payload.email,
        contactId: payload.contactId || null,
        createContactIfMissing: payload.createContactIfMissing !== false,
        actorUserId: approvedByUserId
      });
      temporaryPassword = created.temporaryPassword;
      result = {
        userId: created.user.id,
        contactId: created.contactId,
        email: created.user.email,
        temporaryPasswordExpiresAt: created.temporaryPasswordExpiresAt
      };
      // If a sibling "create contact" action exists for the same email, mark it completed too.
      try {
        const em = normalizeEmail(payload.email);
        if (em) {
          const siblings = await listTicketActionItems(tid);
          for (const sibling of siblings) {
            if (
              Number(sibling.id) !== aid &&
              sibling.action_type === TICKET_ACTION_TYPES.CREATE_SCHOOL_CONTACT &&
              String(sibling.status || '') === 'proposed' &&
              normalizeEmail(sibling.payload?.email) === em
            ) {
              await pool.execute(
                `UPDATE support_ticket_action_items
                 SET status = 'completed',
                     approved_by_user_id = ?,
                     approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
                     executed_at = CURRENT_TIMESTAMP,
                     result_json = ?
                 WHERE id = ?`,
                [
                  Number(approvedByUserId) || null,
                  JSON.stringify({
                    contactId: created.contactId,
                    completedVia: 'create_school_staff_account',
                    parentActionId: aid
                  }),
                  sibling.id
                ]
              );
            }
          }
        }
      } catch {
        // best-effort
      }
    } else if (type === TICKET_ACTION_TYPES.GENERATE_TEMP_PASSWORD) {
      const generated = await generateTempPasswordForUser({
        userId: payload.userId,
        email: payload.email
      });
      temporaryPassword = generated.temporaryPassword;
      result = {
        userId: generated.user.id,
        email: generated.user.email,
        temporaryPasswordExpiresAt: generated.temporaryPasswordExpiresAt
      };
    } else if (type === TICKET_ACTION_TYPES.UPLOAD_SCHOOL_PACKET) {
      result = await uploadSchoolPacketFromTicketAction({
        ticketId: tid,
        payload,
        actorUserId: approvedByUserId
      });
    } else {
      const err = new Error(`Action type "${type}" is not executable yet`);
      err.statusCode = 400;
      throw err;
    }

    await pool.execute(
      `UPDATE support_ticket_action_items
       SET status = 'completed',
           result_json = ?,
           executed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(result), aid]
    );

    const [out] = await pool.execute(
      `SELECT * FROM support_ticket_action_items WHERE id = ? LIMIT 1`,
      [aid]
    );
    return {
      action: {
        ...(out?.[0] || action),
        payload,
        result
      },
      temporaryPassword: temporaryPassword || undefined
    };
  } catch (e) {
    const failResult = {
      error: e?.message || 'Execution failed'
    };
    await pool.execute(
      `UPDATE support_ticket_action_items
       SET status = 'failed',
           result_json = ?,
           executed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(failResult), aid]
    ).catch(() => {});
    throw e;
  }
}

export async function rejectTicketAction({
  ticketId,
  actionId,
  approvedByUserId,
  reason = null
} = {}) {
  if (!(await hasActionItemsTable())) {
    const err = new Error('Action items table not available (run migration 1181)');
    err.statusCode = 409;
    throw err;
  }
  const tid = Number(ticketId);
  const aid = Number(actionId);
  const [rows] = await pool.execute(
    `SELECT * FROM support_ticket_action_items WHERE id = ? AND ticket_id = ? LIMIT 1`,
    [aid, tid]
  );
  const action = rows?.[0] || null;
  if (!action) {
    const err = new Error('Action item not found');
    err.statusCode = 404;
    throw err;
  }
  if (String(action.status || '').toLowerCase() !== 'proposed') {
    const err = new Error(`Action cannot be rejected from status "${action.status}"`);
    err.statusCode = 409;
    throw err;
  }
  const result = { rejectedReason: reason || null };
  await pool.execute(
    `UPDATE support_ticket_action_items
     SET status = 'rejected',
         approved_by_user_id = ?,
         approved_at = CURRENT_TIMESTAMP,
         result_json = ?,
         executed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [Number(approvedByUserId) || null, JSON.stringify(result), aid]
  );
  const [out] = await pool.execute(
    `SELECT * FROM support_ticket_action_items WHERE id = ? LIMIT 1`,
    [aid]
  );
  return {
    action: {
      ...(out?.[0] || action),
      payload: parsePayload(out?.[0]?.payload_json || action.payload_json),
      result
    }
  };
}
