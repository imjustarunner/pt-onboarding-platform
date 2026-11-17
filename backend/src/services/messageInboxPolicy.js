// One classification for lists, badges, and historical records. Source messages
// and audit events are retained; operational notices have their own review queue.
export const INBOX_REVIEW_CATEGORIES = Object.freeze(['provider_assignments', 'enrollment_packets']);
export const RACHEL_SCHOOL_EMAIL = 'rachel@itsco.health';
const ids = values => [...new Set((values || []).map(Number).filter(n => Number.isSafeInteger(n) && n > 0))];

export function ticketMailVisibilitySql(alias = 't') {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error('Invalid ticket alias');
  return `(${alias}.source_channel<>'email' OR (LOWER(COALESCE(${alias}.subject,'')) NOT REGEXP '^(demo only:|qa:|demo:)|client exchange.*demo testing'
    AND LOWER(CONCAT_WS(' ',${alias}.source_email_from,${alias}.source_email_recipients)) NOT REGEXP '(^|[^a-z0-9._%+-])testing([+][^@[:space:]]+)?@'
    AND NOT EXISTS (SELECT 1 FROM support_ticket_email_messages qe JOIN email_sender_identities qi
      ON qi.agency_id=${alias}.agency_id AND LOWER(qi.from_email) COLLATE utf8mb4_unicode_ci=LOWER(qe.from_email) COLLATE utf8mb4_unicode_ci
      WHERE qe.ticket_id=${alias}.id AND qe.direction='inbound'
        AND (LOWER(COALESCE(qe.from_name,'')) REGEXP '^client exchange.*demo testing$' OR qe.internet_message_id LIKE '<exchange-demo-%'))
    AND NOT EXISTS (SELECT 1 FROM agencies qa WHERE qa.id=${alias}.agency_id AND qa.slug REGEXP '(^|[-_])(qa|demo)([-_]|$)')))`;
}

export function operationalNoticeCategory(subject) {
  const text = String(subject || '').toLowerCase();
  if (/^(re|fw|fwd):/.test(text.trim())) return null;
  if (/provider assignment|provider assigned|clinician assigned|new client has been added to your caseload/.test(text)) return 'provider_assignments';
  if (/(digital|paper) enrollment packet|^new packet uploaded/.test(text)) return 'enrollment_packets';
  return null;
}

export function messageInboxPolicySql({ userId, schoolGroupInboxIds = [] } = {}) {
  const uid = Number.isSafeInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : 0;
  const schools = ids(schoolGroupInboxIds);
  const sender = `LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(pm.from_json,'$.email')),JSON_UNQUOTE(JSON_EXTRACT(pm.from_json,'$[0].email')),''))`;
  const trustedSender = `EXISTS (SELECT 1 FROM email_sender_identities ps WHERE ps.agency_id=c.agency_id
    AND LOWER(ps.from_email) COLLATE utf8mb4_unicode_ci=${sender} COLLATE utf8mb4_unicode_ci)`;
  // Each constant template equality lets MySQL use all three parts of the
  // existing (agency_id, template_type, subject) index. A correlated IN only
  // uses agency_id and rescans unrelated sent mail for every conversation.
  const loggedTemplate = templates => `(${templates.map(template => `EXISTS (SELECT 1 FROM user_communications pu WHERE pu.agency_id=c.agency_id
    AND pu.template_type='${template}' AND pu.subject=c.subject COLLATE utf8mb4_unicode_ci
    AND (JSON_UNQUOTE(JSON_EXTRACT(pu.metadata,'$.threadId')) COLLATE utf8mb4_unicode_ci=c.external_thread_id COLLATE utf8mb4_unicode_ci
      OR EXISTS (SELECT 1 FROM communication_messages pm WHERE pm.conversation_id=c.id
        AND pm.internet_message_id IS NOT NULL AND pm.internet_message_id COLLATE utf8mb4_unicode_ci=JSON_UNQUOTE(JSON_EXTRACT(pu.metadata,'$.internetMessageId')) COLLATE utf8mb4_unicode_ci)))`).join(' OR ')})`;
  const trustedSubject = pattern => `EXISTS (SELECT 1 FROM communication_messages pm WHERE pm.conversation_id=c.id
    AND pm.direction='inbound' AND COALESCE(pm.is_internal_note,0)=0 AND ${trustedSender}
    AND LOWER(COALESCE(pm.subject,c.subject,'')) REGEXP '${pattern}')`;
  const humanReply = `EXISTS (SELECT 1 FROM communication_messages pm WHERE pm.conversation_id=c.id
    AND pm.direction='inbound' AND COALESCE(pm.is_internal_note,0)=0 AND pm.in_reply_to IS NOT NULL
    AND NOT (${trustedSender}))`;
  const demo = `(${trustedSubject('^(demo only:|qa:|demo:)|client exchange.*demo testing')}
    OR ${loggedTemplate(['client_exchange_demo_audit','client_exchange_demo_preview'])}
    OR EXISTS (SELECT 1 FROM communication_messages pm WHERE pm.conversation_id=c.id AND ${trustedSender}
      AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(pm.from_json,'$.name')),JSON_UNQUOTE(JSON_EXTRACT(pm.from_json,'$[0].name')),'')) REGEXP '^client exchange.*demo testing$')
    OR EXISTS (SELECT 1 FROM communication_messages qa_mail WHERE qa_mail.conversation_id=c.id
      AND LOWER(CONCAT_WS(' ',qa_mail.from_json,qa_mail.to_json,qa_mail.cc_json)) REGEXP '(^|[^a-z0-9._%+-])testing([+][^@[:space:]]+)?@')
    OR EXISTS (SELECT 1 FROM support_tickets qa_ticket WHERE qa_ticket.id=c.support_ticket_id AND NOT ${ticketMailVisibilitySql('qa_ticket')})
    OR EXISTS (SELECT 1 FROM communication_links pl JOIN clients pc ON pc.id=pl.entity_id AND pc.agency_id=c.agency_id
      WHERE pl.conversation_id=c.id AND pl.entity_type='client' AND COALESCE(pc.created_via_dev_fill,0)=1)
    OR EXISTS (SELECT 1 FROM agencies pa WHERE pa.id=c.agency_id AND pa.slug REGEXP '(^|[-_])(qa|demo)([-_]|$)'))`;
  const category = `(CASE WHEN c.channel<>'email' THEN 'correspondence'
    WHEN ${demo} THEN 'demo'
    WHEN ${humanReply} THEN 'correspondence'
    WHEN (${loggedTemplate(['client_assigned', 'client_exchange_assigned', 'school_provider_assignment'])}
      OR ${trustedSubject('provider assignment|provider assigned|clinician assigned|new client has been added to your caseload')}) THEN 'provider_assignments'
    WHEN (${loggedTemplate(['school_enrollment_packet_status', 'intake_packet_completion', 'enrollment_submission_confirmation'])}
      OR ${trustedSubject('(digital|paper) enrollment packet|^new packet uploaded')}) THEN 'enrollment_packets'
    ELSE 'correspondence' END)`;
  const schoolAutoRead = schools.length && uid ? `(COALESCE(c.inbox_id,0) IN (${schools.join(',')}) AND EXISTS
    (SELECT 1 FROM users pr JOIN user_agencies pra ON pra.user_id=pr.id AND pra.agency_id=c.agency_id AND pra.is_active=1
      WHERE pr.id=${uid} AND pr.is_active=1 AND COALESCE(pr.is_archived,0)=0
        AND '${RACHEL_SCHOOL_EMAIL}' COLLATE utf8mb4_unicode_ci IN (LOWER(pr.email),LOWER(pr.work_email),LOWER(pr.personal_email),LOWER(pr.username))))` : '0=1';
  return { category, demo, schoolAutoRead, correspondence: `${category}='correspondence'` };
}

export function isRachelSchoolReply({ agencyId, schoolOrganizationId, senderEmail, staffUserId, replyEvidence }) {
  return Number(agencyId) > 0 && Number(schoolOrganizationId) > 0 && Number(staffUserId) > 0
    && String(senderEmail || '').trim().toLowerCase() === RACHEL_SCHOOL_EMAIL && !!replyEvidence;
}

export function chatInboxVisibilitySql(userId) {
  const uid = ids([userId])[0] || 0;
  return `(COALESCE(t.name,'') NOT REGEXP '^(TEST!!!|DEMO ONLY:|QA:)'
    AND (LOWER(TRIM(COALESCE(t.name,''))) NOT IN ('billing','medical billing') OR EXISTS
      (SELECT 1 FROM users bu LEFT JOIN user_agencies ba ON ba.user_id=bu.id AND ba.agency_id=t.agency_id AND ba.is_active=1
        WHERE bu.id=${uid} AND (bu.role='super_admin' OR ba.has_billing_access=1))))`;
}
