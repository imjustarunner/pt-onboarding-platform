import pool from '../config/database.js';
import {SCHOOL_CONTACT_AGENCY_IDS,schoolContactScopeSql} from './schoolContactRollout.js';
import { replyMessageIds } from '../utils/emailThreading.js';
import { persistInboundEmail } from './inboundEmailPersistence.service.js';
import { prepareInboundAttachments } from './communicationAttachments.service.js';
import { readGmailBodyHtml, headerMap, extractEmails, pickBodyText } from '../utils/gmailMessageParse.shared.js';
import { getWorkspaceClientsForEmployee } from './googleWorkspaceAuth.service.js';

const mailboxes = new Map();
let lastPolledMessageId = 0;
const norm = value => String(value || '').trim().toLowerCase();

export function authenticatedSchoolContactSender(headers, fromEmail) {
  // Gmail prepends its receiving result. A later appended result, Reply-To,
  // subject or knowledge of the original RFC ID cannot authenticate a sender.
  const result=(Array.isArray(headers)?headers:[]).find(header=>/^authentication-results$/i.test(header.name) && /^mx\.google\.com\s*;/i.test(header.value))?.value || '';
  const domain=norm(fromEmail).split('@')[1];
  return !!domain && result.split(';').some(part=>/\bdmarc=pass\b/i.test(part)
    && part.toLowerCase().match(/header\.from=([a-z0-9.-]+)/)?.[1]===domain);
}

async function verifiedWorkGmail(address) {
  const email=norm(address), cached=mailboxes.get(email);
  if(cached && cached.until>Date.now()) return cached.gmail;
  try {
    const {gmail}=await getWorkspaceClientsForEmployee({subjectEmail:email});
    const profile=await gmail.users.getProfile({userId:'me'});
    if(norm(profile.data?.emailAddress)!==email) throw Object.assign(new Error('Work mailbox identity mismatch'),{code:'WORK_MAILBOX_MISMATCH'});
    mailboxes.set(email,{gmail,until:Date.now()+5*60_000});
    return gmail;
  } catch(error) {
    mailboxes.set(email,{gmail:null,until:Date.now()+60_000});
    console.warn('[school contact work replies] mailbox unavailable',error.code || 'delegation_unavailable');
    return null;
  }
}

// Never switch Reply-To away from the working token route until authenticated
// access to this exact work mailbox has been confirmed.
export async function schoolContactWorkMailboxAvailable(address) {
  return !!(address && await verifiedWorkGmail(address));
}

/** SSO work mail stays in Gmail except an exact reply to this provider's school
 * contact workflow. An address/subject match alone never opens a client thread. */
export async function resolveSchoolContactWorkReply({identityId,fromEmail,toAddresses=[],inReplyTo,referencesHeader,authenticationHeaders=[]}={}) {
  const parents = replyMessageIds(inReplyTo, referencesHeader);
  const sender = String(fromEmail || '').trim().toLowerCase();
  if (!parents.length || !sender || !identityId || !authenticatedSchoolContactSender(authenticationHeaders,sender)) return null;
  const [[identity]] = await pool.execute(`SELECT esi.id,esi.agency_id,esi.from_email,i.owner_user_id
    FROM email_sender_identities esi JOIN communication_inboxes i ON i.sender_identity_id=esi.id AND i.agency_id=esi.agency_id
    JOIN users u ON u.id=i.owner_user_id JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=i.agency_id AND ua.is_active=1
    WHERE esi.id=? AND esi.is_active=1 AND i.kind='personal' AND i.is_active=1
      AND esi.identity_key=CONCAT('personal_',u.id) AND LOWER(esi.from_email)=LOWER(i.from_email)
      AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(u.status) IN ('ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING')
      AND COALESCE(u.sso_password_override,0)=0 AND COALESCE(u.login_is_group_email,0)=0 LIMIT 1`,[identityId]);
  if (!identity || !toAddresses.some(address => norm(address) === norm(identity.from_email))) return null;
  const hits = new Map();
  for (const parent of parents) {
    const [rows] = await pool.execute(`SELECT DISTINCT c.id AS conversation_id,c.inbox_id,w.id AS workflow_id
      FROM communication_messages m JOIN communication_conversations c ON c.id=m.conversation_id
      JOIN school_contact_workflows w ON w.id=CAST(JSON_UNQUOTE(JSON_EXTRACT(m.from_json,'$.schoolContactAutomation.workflowId')) AS UNSIGNED)
        AND w.agency_id=c.agency_id AND w.provider_user_id=c.owner_user_id
      JOIN communication_inboxes i ON i.id=c.inbox_id AND i.agency_id=c.agency_id AND i.is_active=1
      WHERE c.agency_id=? AND c.owner_user_id=? AND w.provider_user_id=?
        AND m.internet_message_id=? AND m.direction='outbound' AND m.send_status IN ('sent','delivered')
        AND m.author_user_id=? AND COALESCE(m.is_auto_reply,0)=0 AND COALESCE(m.is_internal_note,0)=0
        AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(m.from_json,'$.replyTo')))=LOWER(?)
        AND EXISTS (SELECT 1 FROM client_provider_assignments assignment WHERE assignment.client_id=w.client_id AND assignment.provider_user_id=w.provider_user_id AND assignment.organization_id=w.school_id AND assignment.is_active=1)
        AND EXISTS (SELECT 1 FROM clients client JOIN client_guardians cg ON cg.client_id=client.id JOIN users guardian ON guardian.id=cg.guardian_user_id
          WHERE client.id=w.client_id AND client.agency_id=w.agency_id AND client.status<>'ARCHIVED' AND cg.relationship_type<>'self'
            AND cg.access_enabled=1
            AND COALESCE(JSON_EXTRACT(cg.permissions_json,'$.noView'),false)=false
            AND COALESCE(JSON_EXTRACT(cg.permissions_json,'$.noViewOtherGuardian'),false)=false
            AND COALESCE(guardian.is_active,1)=1 AND COALESCE(guardian.is_archived,0)=0
            AND (LOWER(TRIM(guardian.email))=? OR LOWER(TRIM(guardian.personal_email))=?))
        AND JSON_CONTAINS(LOWER(CAST(m.to_json AS CHAR)),JSON_OBJECT('email',?)) LIMIT 2`,
    [identity.agency_id,identity.owner_user_id,identity.owner_user_id,parent,identity.owner_user_id,identity.from_email,sender,sender,sender]);
    for (const row of rows) hits.set(Number(row.conversation_id),row);
    if (hits.size > 1) return null;
  }
  if (hits.size !== 1) return null;
  const [hit] = hits.values();
  return {identity,hit,sender};
}

export async function ingestSchoolContactWorkReply({identityId,fromEmail,toAddresses=[],ccAddresses=[],inReplyTo,referencesHeader,
  messageIdHeader,subject,bodyText,receivedAt=new Date(),gmail=null,gmailMessageId=null,gmailPayload=null}={}) {
  if(!(messageIdHeader || gmailMessageId)) return {ingested:false};
  const route=await resolveSchoolContactWorkReply({identityId,fromEmail,toAddresses,inReplyTo,referencesHeader,authenticationHeaders:gmailPayload?.headers});
  if(!route) return {ingested:false};
  const {identity,hit,sender}=route;
  const attachments = await prepareInboundAttachments({gmail,gmailMessageId,payload:gmailPayload,inboxId:hit.inbox_id});
  // Existing persistence serializes the inbox, deduplicates delivery receipts,
  // and records the linked guardian reply in the parent-contact milestones.
  return persistInboundEmail({inboxId:hit.inbox_id,agencyId:identity.agency_id,conversationId:hit.conversation_id,
    ownerUserId:identity.owner_user_id,deliveryId:messageIdHeader || `gmail:${gmailMessageId}`,fromEmail:sender,subject,bodyText,
    bodyHtml:await readGmailBodyHtml(gmailPayload,{gmail,gmailMessageId}),to:toAddresses.map(email=>({email})),cc:ccAddresses.map(email=>({email})),
    inReplyTo,referencesHeader,receivedAt,attachments});
}

/** Read only RFC threads initiated by this contact plan. Do not scan a staff
 * member's general inbox, import other email, or mark anything read in Gmail. */
export async function syncSchoolContactWorkReplies() {
  const [targets]=await pool.execute(`SELECT DISTINCT m.id,m.internet_message_id,c.id AS conversation_id,esi.id AS identity_id,esi.from_email
    FROM communication_messages m JOIN communication_conversations c ON c.id=m.conversation_id
    JOIN school_contact_workflows w ON w.id=CAST(JSON_UNQUOTE(JSON_EXTRACT(m.from_json,'$.schoolContactAutomation.workflowId')) AS UNSIGNED)
      AND w.agency_id=c.agency_id AND w.provider_user_id=c.owner_user_id
    JOIN client_provider_assignments assignment ON assignment.client_id=w.client_id AND assignment.provider_user_id=w.provider_user_id AND assignment.organization_id=w.school_id AND assignment.is_active=1
    JOIN users u ON u.id=w.provider_user_id AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(u.status) IN ('ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING')
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=w.agency_id AND ua.is_active=1
    JOIN communication_inboxes own ON own.owner_user_id=u.id AND own.agency_id=w.agency_id AND own.kind='personal' AND own.is_active=1
    JOIN email_sender_identities esi ON esi.id=own.sender_identity_id AND esi.agency_id=own.agency_id AND esi.is_active=1 AND esi.identity_key=CONCAT('personal_',u.id) AND LOWER(esi.from_email)=LOWER(own.from_email)
    JOIN agencies pilot ON pilot.id=w.agency_id
    JOIN school_provider_contact_plans p ON p.agency_id=w.agency_id AND p.provider_user_id=w.provider_user_id
    WHERE w.agency_id IN (?,?) AND ${schoolContactScopeSql('pilot','w.provider_user_id')} AND COALESCE(u.sso_password_override,0)=0 AND COALESCE(u.login_is_group_email,0)=0
      AND m.direction='outbound' AND m.author_user_id=u.id AND m.send_status IN ('sent','delivered') AND COALESCE(m.is_auto_reply,0)=0
      AND m.sent_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 180 DAY)
      AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(m.from_json,'$.replyTo')))=LOWER(esi.from_email)
    ORDER BY (m.id>?) DESC,m.id LIMIT 20`,[...SCHOOL_CONTACT_AGENCY_IDS,lastPolledMessageId]);
  let ingested=0;
  for(const target of targets || []) {
    lastPolledMessageId=Number(target.id);
    // Search syntax is built solely from the stable message ID generated by
    // the school sender; arbitrary subjects or family input are never queries.
    if(!/^<school-contact-\d+-[a-z0-9_]+@itsco\.health>$/i.test(target.internet_message_id || '')) continue;
    const gmail=await verifiedWorkGmail(target.from_email);
    if(!gmail) continue;
    try {
      const anchor=await gmail.users.messages.list({userId:'me',q:`rfc822msgid:${target.internet_message_id.slice(1,-1)}`,maxResults:2});
      const anchorMessages=anchor.data?.messages || [];
      if(anchorMessages.length!==1 || !anchorMessages[0].threadId) continue;
      const thread=await gmail.users.threads.get({userId:'me',id:anchorMessages[0].threadId,format:'metadata',metadataHeaders:['From','To','Message-ID','In-Reply-To','References','Authentication-Results','Auto-Submitted','X-Autoreply','X-Autorespond','X-Auto-Response-Suppress']});
      for(const candidate of (thread.data?.messages || []).slice(-100)) {
        const headers=headerMap(candidate.payload?.headers || []),auto=headers.get('auto-submitted');
        if((auto && auto.toLowerCase()!=='no') || headers.get('x-autoreply') || headers.get('x-autorespond') || headers.get('x-auto-response-suppress')?.toLowerCase().includes('all')) continue;
        const messageIdHeader=headers.get('message-id');
        if(!messageIdHeader || messageIdHeader===target.internet_message_id) continue;
        const incoming={identityId:target.identity_id,fromEmail:extractEmails(headers.get('from'))[0],toAddresses:extractEmails(headers.get('to')),
          inReplyTo:headers.get('in-reply-to'),referencesHeader:headers.get('references'),authenticationHeaders:candidate.payload?.headers};
        // Check authorization using headers before fetching any message body.
        if(!await resolveSchoolContactWorkReply(incoming)) continue;
        const [[existing]]=await pool.execute('SELECT id FROM communication_messages WHERE conversation_id=? AND internet_message_id=? LIMIT 1',[target.conversation_id,messageIdHeader]);
        if(existing) continue;
        const full=await gmail.users.messages.get({userId:'me',id:candidate.id,format:'full'});
        const payload=full.data?.payload, fullHeaders=headerMap(payload?.headers || []);
        const saved=await ingestSchoolContactWorkReply({...incoming,messageIdHeader,ccAddresses:extractEmails(fullHeaders.get('cc')),
          subject:fullHeaders.get('subject'),bodyText:pickBodyText(payload),receivedAt:new Date(Number(full.data?.internalDate)||Date.now()),
          gmail,gmailMessageId:candidate.id,gmailPayload:payload});
        if(saved.ingested && !saved.duplicate) ingested++;
      }
    } catch(error) {
      console.warn('[school contact work replies] sync needs review',error.code || 'read_failed');
    }
  }
  return {checked:targets?.length || 0,ingested};
}
