import { isRachelSchoolReply, RACHEL_SCHOOL_EMAIL } from './messageInboxPolicy.js';

export function googleAuthenticationResults(headers = []) {
  // Gmail prepends its receiving results. Never let a lower, sender-supplied
  // duplicate replace the first result in a header map.
  return String(headers.find(header => String(header.name).toLowerCase() === 'authentication-results')?.value || '');
}
export function authenticatedSchoolStaffReply(input) {
  const proof = String(input.authenticationResults || '').toLowerCase();
  return /^mx[.]google[.]com\s*;/.test(proof.trim())
    && /(?:dmarc|dkim)=pass\b[^;\n]*(?:header[.]from|header[.]d)=itsco[.]health(?=[;\s]|$)/.test(proof);
}

/** Record the authorized Gmail ownership rule as automation, independently of
 * the external email's human author. Never replace another staff member's claim. */
export async function applySchoolGmailOwnership({ input, ticket, appOriginReceipt, database }) {
  const schoolTicket = Number(ticket.school_organization_id) > 0 && Number(ticket.school_organization_id) !== Number(ticket.agency_id)
    || /(?:schools|schoolreply)@itsco[.]health/i.test(String(ticket.source_email_recipients || ''));
  if (!schoolTicket || appOriginReceipt || !authenticatedSchoolStaffReply(input) || !isRachelSchoolReply({
    agencyId: ticket.agency_id, schoolOrganizationId: ticket.school_organization_id,
    senderEmail: input.fromEmail, staffUserId: input.staffUserId,
    replyEvidence: input.inReplyTo || input.referencesHeader
  })) return false;
  const [[member]] = await database.execute(`SELECT u.id FROM users u JOIN user_agencies ua
    ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND ? COLLATE utf8mb4_unicode_ci IN (LOWER(u.email),LOWER(u.work_email),LOWER(u.personal_email),LOWER(u.username)) LIMIT 1`,
  [ticket.agency_id, input.staffUserId, RACHEL_SCHOOL_EMAIL]);
  if (!member) return false;
  const [result] = await database.execute(`UPDATE support_tickets SET claimed_by_user_id=?,claimed_at=COALESCE(claimed_at,CURRENT_TIMESTAMP)
    WHERE id=? AND agency_id=? AND claimed_by_user_id IS NULL AND status NOT IN ('closed','resolved','done')`,
  [member.id, ticket.id, ticket.agency_id]);
  if (!result.affectedRows) return false;
  await database.execute(`INSERT INTO support_ticket_messages (ticket_id,author_user_id,author_role,body,is_internal)
    VALUES (?,NULL,'system',?,1)`, [ticket.id, 'Automation: claimed for Rachel after a verified school-group reply from her Gmail.']);
  return true;
}
