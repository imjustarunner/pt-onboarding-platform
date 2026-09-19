import pool from '../config/database.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

export const INTERNSHIP_INQUIRY_SUBJECT = 'Practicum/Internship inquiry';

// Resolve server-side: public callers cannot choose a recipient or sender.
export async function resolveInternshipContact(agency, { db = pool, identities = EmailSenderIdentity } = {}) {
  if (String(agency.slug || agency.portal_url).toLowerCase() !== 'itsco') {
    throw Object.assign(new Error('This inquiry form is only available for ITSCO.'), { status: 404 });
  }
  const [rows] = await db.execute(`SELECT DISTINCT u.id, u.work_email FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id
    WHERE ua.agency_id=? AND COALESCE(ua.is_active,1)=1
    AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
    AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')
    AND LOWER(u.first_name)='rachel' AND LOWER(u.last_name)='finch'`, [agency.id]);
  if (rows.length !== 1) throw Object.assign(new Error('Rachel’s contact form is temporarily unavailable. Please contact our team.'), { status: 503 });
  const recipient = rows[0];
  const mailbox = await identities.findByAgencyAndIdentityKey(agency.id, `personal_${recipient.id}`);
  const sender = await identities.findByAgencyAndIdentityKey(agency.id, 'support');
  const email = String(mailbox?.from_email || recipient.work_email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !sender) {
    throw Object.assign(new Error('Rachel’s email contact is temporarily unavailable. Please contact our team.'), { status: 503 });
  }
  return { userId: recipient.id, email, senderIdentityId: sender.id };
}

export async function deliverInternshipInquiry({ contact, ticketId, question }, { send = sendEmailFromIdentity } = {}) {
  const linkUrl = `https://plottwisthq.com/itsco/tickets?ticketId=${encodeURIComponent(ticketId)}`;
  try {
    const result = await send({
      senderIdentityId: contact.senderIdentityId,
      to: contact.email,
      subject: INTERNSHIP_INQUIRY_SUBJECT,
      text: `${question}\n\nReply to this visitor from the ITSCO ticket desk:\n${linkUrl}\n\nOpen the conversation and use Reply to send an ITSCO-branded email to the visitor.`,
      source: 'manual',
      userId: contact.userId,
      templateType: 'itsco_practicum_internship_inquiry',
      linkUrl
    });
    return !result?.skipped;
  } catch (error) {
    // The assigned ticket remains available; never invite a duplicate submission.
    console.error('[itsco-internship-inquiry] email delivery failed', { ticketId, code: error?.code || 'send_failed' });
    return false;
  }
}
