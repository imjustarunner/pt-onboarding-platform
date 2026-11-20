import {extractEmails, readGmailBodyHtml} from '../utils/gmailMessageParse.shared.js';
import { listDedicatedSchoolMailboxes, schoolContextForAddresses } from './unifiedEmail/schoolMailboxContext.service.js';
import { groupKeyForIdentity } from './departmentalGroupPolicy.js';
import pool from '../config/database.js';
import CommunicationInbox from '../models/CommunicationInbox.model.js';
import {persistInboundEmail} from './inboundEmailPersistence.service.js';

export const SCHOOL_GROUP_EMAIL_TYPE = 'school_group_email_received';
export const packetNotificationSubject = subject => !/^\s*(?:re|fw|fwd):/i.test(subject || '') && / - (?:Paper Enrollment Packet Uploaded|Digital Enrollment Packet)$/i.test(subject || '');
const emails = values => [...new Set((values || []).flatMap(v=>extractEmails(String(v?.email || v || ''))).map(v=>v.toLowerCase()))];

/** Receipt mail remains email. It never enters support-ticket intake or drafting. */
export async function recordSchoolGroupEmail(input, dependencies = {}) {
  const db = dependencies.database || pool;
  if ((!packetNotificationSubject(input.subject) && !input.automated) || !input.messageId || !Number(input.agencyId)) return {handled:false};
  const recipients = emails([...(input.to || []), ...(input.cc || []), ...(input.deliveredTo || [])]);
  if (!recipients.length) return {handled:false};
  const [schools] = await db.execute(`SELECT DISTINCT sp.school_organization_id,sp.itsco_email,a.name
    FROM school_profiles sp JOIN agencies a ON a.id=sp.school_organization_id
    JOIN organization_affiliations oa ON oa.organization_id=a.id AND oa.agency_id=? AND oa.is_active=1
    WHERE a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND a.organization_type='school'
      AND LOWER(TRIM(sp.itsco_email)) IN (${recipients.map(()=>'?').join(',')})`, [input.agencyId,...recipients]);
  if (!schools.length) return {handled:false};
  const [senders] = await db.execute(`SELECT id,from_email FROM email_sender_identities WHERE agency_id=? AND is_active=1
    AND identity_key IN ('schools','schoolreply','school_reply','notifications','support') AND LOWER(TRIM(from_email))=?`, [input.agencyId,String(input.fromEmail || '').trim().toLowerCase()]);
  if (!senders.length && !input.automated) return {handled:false};
  let [[inbox]] = await db.execute(`SELECT * FROM communication_inboxes WHERE agency_id=? AND kind='shared'
    AND owner_user_id IS NULL AND is_active=1 AND identity_key='schools' LIMIT 1`, [input.agencyId]);
  if (!inbox) {
    await (dependencies.ensureInboxes || CommunicationInbox.ensureFromSenderIdentities)(input.agencyId);
    [[inbox]] = await db.execute("SELECT * FROM communication_inboxes WHERE agency_id=? AND kind='shared' AND owner_user_id IS NULL AND is_active=1 AND identity_key='schools' LIMIT 1", [input.agencyId]);
  }
  if (!inbox) throw new Error('Schools group inbox is unavailable');
  const receivedAt = new Date(input.receivedAt || Date.now());
  if (!Number.isFinite(receivedAt.getTime())) throw new Error('Packet email receipt time is unavailable');
  const attachments=input.payload ? await (dependencies.prepareAttachments || (await import('./communicationAttachments.service.js')).prepareInboundAttachments)({gmail:input.gmail,gmailMessageId:input.gmailMessageId,payload:input.payload,inboxId:inbox.id}) : [];
  const persist = dependencies.persistEmail || persistInboundEmail;
  const saved = await persist({agencyId:Number(input.agencyId),inboxId:inbox.id,deliveryId:input.messageId,
    threadId:input.threadId || null,fromEmail:input.fromEmail,subject:input.subject,bodyText:input.bodyText || '',bodyHtml:input.bodyHtml || null,
    to:emails(input.to).map(email=>({email})),cc:emails(input.cc).map(email=>({email})),receivedAt,
    attachments,isGroupEmail:true,isAutoReply:true,autoReplyKind:'school_group_notification',standalone:true,suppressPush:true});
  if (!saved.messageId || !saved.conversationId) throw new Error('School notification email did not persist');
  await db.execute("UPDATE communication_conversations SET is_unknown_sender=0,status='resolved' WHERE id=? AND agency_id=? AND support_ticket_id IS NULL", [saved.conversationId,input.agencyId]);
  // The email itself is available in Groups. Its review state is the signal;
  // do not create a second notification or device/browser alert.
  return {handled:true,...saved,notificationCount:0};
}

export async function recordSentSchoolGroupEmail({agencyId,schoolOrganizationId,to,cc,subject,result,senderIdentityId},dependencies={}) {
  if (!result?.id || result.queued || result.blocked || result.skipped || result.redirected || !result.internetMessageId) return {handled:false};
  const db=dependencies.database || pool;
  const [[sender]]=await db.execute('SELECT from_email FROM email_sender_identities WHERE id=? AND agency_id=? AND is_active=1',[senderIdentityId,agencyId]);
  if(!sender)return {handled:false};
  return recordSchoolGroupEmail({agencyId,schoolOrganizationId,to:[to],cc:(Array.isArray(cc)?cc:String(cc || '').split(',')),subject,
    automated:true,messageId:result.internetMessageId,threadId:result.threadId,fromEmail:sender.from_email,bodyText:result.bodyText,bodyHtml:result.bodyHtml,
    receivedAt:new Date()},dependencies);
}

/** Route an explicit To/Cc school mailbox to its active tenant. Delivery headers
 * can name nested groups or personal relays; they do not establish the audience. */
export async function findDirectSchoolGroup(to, cc, db = pool) {
  const recipients = emails([...(to || []), ...(cc || [])]);
  if (!recipients.length) return null;
  const [agencies] = await db.execute(`
    SELECT DISTINCT affiliation.agency_id
    FROM school_profiles sp
    JOIN agencies school ON school.id=sp.school_organization_id AND school.organization_type='school'
      AND school.is_active=1 AND COALESCE(school.is_archived,0)=0
    JOIN (
      SELECT organization_id AS school_id, agency_id FROM organization_affiliations WHERE is_active=1
      UNION SELECT school_organization_id, agency_id FROM agency_schools WHERE is_active=1
    ) affiliation ON affiliation.school_id=school.id
    JOIN agencies tenant ON tenant.id=affiliation.agency_id AND tenant.is_active=1 AND COALESCE(tenant.is_archived,0)=0
    WHERE LOWER(TRIM(sp.itsco_email)) IN (${recipients.map(() => '?').join(',')})`, recipients);
  if (agencies.length !== 1) return null;
  const agencyId = Number(agencies[0].agency_id);
  const school = schoolContextForAddresses(await listDedicatedSchoolMailboxes(agencyId, db), recipients);
  return school ? { agencyId, ...school } : null;
}

export function schoolGroupPersonalAddresses({ to, cc, deliveryAddresses, school }) {
  if (!school) return [...to, ...cc, ...deliveryAddresses];
  // Keep explicit personal recipients. The school group and relay addresses
  // must not expand to a second set of personal app inboxes.
  return emails([...to, ...cc]).filter(address => address !== school.mailboxAddress);
}

export async function recordDirectSchoolGroupEmail(input, dependencies = {}) {
  const db = dependencies.database || pool;
  const inboxes = dependencies.inboxes || CommunicationInbox;
  const { school } = input;
  await inboxes.ensureFromSenderIdentities(school.agencyId);
  const schoolInboxes = (await inboxes.listForAgency({ agencyId: school.agencyId }))
    .filter(box => Number(box.id) > 0 && groupKeyForIdentity(box) === 'schools');
  const inbox = schoolInboxes.find(box => ['schoolreply', 'school_reply'].includes(box.identity_key)) || schoolInboxes[0];
  if (!inbox) throw new Error('The school group inbox is unavailable');
  const options = { gmail: input.gmail, gmailMessageId: input.gmailMessageId };
  const prepare = dependencies.prepareAttachments || (await import('./communicationAttachments.service.js')).prepareInboundAttachments;
  const persist = dependencies.persistEmail || persistInboundEmail;
  const saved = await persist({
    agencyId: school.agencyId, inboxId: inbox.id, deliveryId: input.messageId,
    // The school and mailbox partition Gmail-derived thread identity.
    threadId: input.threadId ? `school:${school.schoolOrganizationId}:${input.threadId}` : null,
    fromEmail: input.fromEmail, subject: input.subject, bodyText: input.bodyText,
    bodyHtml: await (dependencies.readHtml || readGmailBodyHtml)(input.payload, options),
    to: emails(input.to).map(email => ({ email })), cc: emails(input.cc).map(email => ({ email })),
    receivedAt: input.receivedAt,
    attachments: await prepare({ ...options, payload: input.payload, inboxId: inbox.id }),
    isGroupEmail: true, suppressPush: true, verifiedSchoolGroup: school
  });
  if (!saved.ingested) throw new Error('The school group email could not be saved');
  return saved;
}
