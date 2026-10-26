import { createHash } from 'node:crypto';
import { replyMessageIds } from '../utils/emailThreading.js';

export const emailKey = (value) => String(value || '').trim().toLowerCase();
export const emailHash = (value) => createHash('sha256').update(String(value)).digest('hex');

export function chooseCanonicalSupportTicket(rows = []) {
  return [...rows].sort((a, b) => {
    const mapped = (row) => Number(row.canonical_ticket_id) === Number(row.id);
    if (mapped(a) !== mapped(b)) return Number(mapped(b)) - Number(mapped(a));
    const recorded = (row) => row.first_email_id != null;
    if (recorded(a) !== recorded(b)) return Number(recorded(b)) - Number(recorded(a));
    if (recorded(a) && Number(a.first_email_id) !== Number(b.first_email_id)) return Number(a.first_email_id) - Number(b.first_email_id);
    if (!!a.claimed_by_user_id !== !!b.claimed_by_user_id) return Number(!!b.claimed_by_user_id) - Number(!!a.claimed_by_user_id);
    return Number(b.id) - Number(a.id);
  })[0] || null;
}

export function parseEmailList(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = value.split(/[,;]/); }
  }
  return [...new Set((Array.isArray(value) ? value : []).map((item) => emailKey(item?.email || item)).filter(Boolean))];
}

export function supportEmailError(message, status = 409, code = 'SUPPORT_EMAIL_CONFLICT') {
  return Object.assign(new Error(message), { status, code });
}

export function isManagedSupportIdentity(identity, { agencyId, topic = '', schoolAddresses = [] } = {}) {
  if (!identity || !Number(identity.is_active) || Number(identity.agency_id) !== Number(agencyId)) return false;
  if (identity.owner_user_id || /^(personal|hire_user|staff_user|user_|messages_)/i.test(identity.identity_key || '')) return false;
  const key = emailKey(identity.identity_key).replace(/[- ]/g, '_');
  const from = emailKey(identity.from_email);
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) return false;
  if (topic === 'technology') return key === 'technology' || /^technology@/.test(from);
  return ['schools', 'schoolreply', 'school_reply', 'school_support', 'support'].includes(key)
    || /^(schools|schoolreply|support)@/.test(from)
    || schoolAddresses.map(emailKey).includes(from);
}

export function supportReplyHeaders(ticket, messages = []) {
  const last = [...messages].reverse().find((m) => ['received', 'sent'].includes(m.send_status)
    && replyMessageIds(m.internet_message_id).length);
  const parent = last?.internet_message_id || replyMessageIds(ticket.source_email_message_id)[0] || null;
  return {
    inReplyTo: parent,
    references: [...new Set([...replyMessageIds(null, last?.references_header).reverse(), parent].filter(Boolean))].slice(-30).join(' ') || null,
    threadId: last?.gmail_thread_id || ticket.source_email_thread_id || null,
    subject: /^re:/i.test(ticket.source_email_subject || ticket.subject || '')
      ? String(ticket.source_email_subject || ticket.subject)
      : `Re: ${ticket.source_email_subject || ticket.subject || 'Your message'}`
  };
}

export function classifySupportEmailResult(result) {
  if (result?.redirected) return 'failed';
  if (result?.id && !result?.skipped && !result?.blocked && !result?.queued && !result?.pendingApproval) return 'sent';
  if ((result?.queued || result?.pendingApproval) && result?.communicationId) return 'queued';
  return 'failed';
}

export function classifyTicketHistoryMessage(message, email = null) {
  if (Number(message.is_deleted)) return null;
  const role = String(message.author_role || '');
  const internal = Number(message.is_internal) === 1 || role.includes('internal') || role === 'system'
    || /^(Ticket (closed|reopened|assigned|unclaimed)|Closed by\b)/i.test(String(message.body || '').trim());
  if (internal) return { direction: 'internal', isInternalNote: true, sendStatus: 'recorded' };
  if (email) return { direction: email.direction, isInternalNote: false,
    sendStatus: email.direction === 'inbound' ? 'received' : email.send_status };
  if (role === 'system_email' || role === 'school_staff') return { direction: 'inbound', isInternalNote: false, sendStatus: 'received' };
  // Legacy rows have no evidence of delivery. Do not manufacture a sent email.
  return { direction: 'outbound', isInternalNote: false, sendStatus: 'unverified' };
}
