import { randomBytes, createHash } from 'node:crypto';
import pool from '../config/database.js';
import Conversation from '../models/CommunicationConversation.model.js';
import { resolveMessagesSendMailbox } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { managedDomain } from './managedWorkspaceGroupPolicy.js';

export const SCHOOL_CONTACT_DEMO_AGENCY_ID = 450;
export const SCHOOL_CONTACT_TEST_INBOX = 'testing@itsco.health';
export const DEFAULT_SCHOOL_CONTACT_TEMPLATE = `{{parent_name}},

My name is {{provider_name}}, and I was recently assigned to your child at {{school_name}}. I will see them on {{service_day}}.

The next steps are for me to work with you to identify a time to touch base, schedule an intake, and establish the goals and direction of therapy. Please send me some days and times you may be available to meet virtually before I begin working with your child.

If you have any questions, please do not hesitate to reach out by hitting "reply".`;
const TOKENS = ['parent_name', 'provider_name', 'school_name', 'service_day'];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const email = value => String(value || '').trim().toLowerCase();
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const flag = value => [true, 1, '1'].includes(value);

// Keep this gate explicit: neither an arbitrary "demo" name nor a request body
// may opt another tenant into sending contact-plan messages during this pilot.
export function isSchoolContactDemoAgency(agency) {
  return Number(agency?.id) === SCHOOL_CONTACT_DEMO_AGENCY_ID
    && agency?.slug === 'auricwell-qa-demo' && flag(agency.is_active)
    && !flag(agency.is_archived);
}

export function validateSchoolContactTemplate(value) {
  const template = String(value ?? DEFAULT_SCHOOL_CONTACT_TEMPLATE).trim();
  if (template.length < 80 || template.length > 6000) throw fail('Keep your message between 80 and 6,000 characters.');
  if (/<[^>]*>/.test(template)) throw fail('Use plain text in your contact message.');
  for (const token of TOKENS) if (!template.includes(`{{${token}}}`)) throw fail(`Keep the {{${token}}} placeholder in your message.`);
  const unknown = [...template.matchAll(/{{\s*([^}]+)\s*}}/g)].find(match => !TOKENS.includes(match[1]));
  if (unknown) throw fail('Use only the four supported name, school, and day placeholders.');
  return template;
}

export function renderSchoolContactTemplate(template, values) {
  return validateSchoolContactTemplate(template).replace(/{{(parent_name|provider_name|school_name|service_day)}}/g, (_, key) => String(values[key] || ''));
}

export function schoolContactRouting(provider, from = 'messages@itsco.health', agency = {}) {
  const policyRequiresSso = parse(agency.feature_flags).googleSsoEnabled === true || !!managedDomain(agency);
  const isSso = policyRequiresSso && !flag(provider.sso_password_override) && !flag(provider.login_is_group_email);
  const providerEmail = email(isSso ? provider.work_mailbox_email || provider.work_email || provider.email : provider.personal_email || provider.email || provider.work_email);
  return { isSso, from, providerEmail, replyTo: isSso ? from : providerEmail,
    replyTracking: isSso ? 'in_app' : 'external_email',
    replyTrackingNote: isSso ? 'Replies stay in your app inbox.' : 'Replies go to your email. Replies sent outside the app may not be visible here; record them in the client contact history to stop follow-ups.' };
}

export async function getContactPlanContext({ agencyId, userId, requireEligible = true }) {
  let aid = Number(agencyId);
  const uid = Number(userId);
  if (!Number.isSafeInteger(aid) || aid < 1 || !Number.isSafeInteger(uid) || uid < 1) throw fail('Select an agency.');
  let [[agency]] = await pool.execute('SELECT id,name,slug,is_active,is_archived,feature_flags,organization_type FROM agencies WHERE id=?', [aid]);
  if (agency?.organization_type === 'school' && flag(agency.is_active) && !flag(agency.is_archived)) {
    // The app can hold the school as its current organization while a provider
    // opens SchoolCareBridge. Resolve only an active affiliation to this pilot;
    // an unrelated school's membership cannot opt its parent into the feature.
    const [[parent]] = await pool.execute(`SELECT a.id,a.name,a.slug,a.is_active,a.is_archived,a.feature_flags,a.organization_type
      FROM organization_affiliations oa JOIN agencies a ON a.id=oa.agency_id
      WHERE oa.organization_id=? AND oa.agency_id=? AND oa.is_active=1 LIMIT 1`, [aid, SCHOOL_CONTACT_DEMO_AGENCY_ID]);
    if (isSchoolContactDemoAgency(parent)) { agency = parent; aid = Number(parent.id); }
  }
  if (!isSchoolContactDemoAgency(agency)) {
    if (requireEligible) throw fail('Contact plans are currently available only in the ITSCOLLC demo.', 403);
    return { eligible: false, agency };
  }
  const [[provider]] = await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.role,u.has_provider_access,u.email,u.work_email,u.personal_email,u.sso_password_override,u.login_is_group_email,
      (SELECT i.from_email FROM communication_inboxes i WHERE i.agency_id=ua.agency_id AND i.owner_user_id=u.id AND i.kind='personal' AND i.is_active=1 ORDER BY i.id LIMIT 1) AS work_mailbox_email
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.id=? AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_active,1)=1`, [aid, uid]);
  const careRole = ['provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'clinical_practice_assistant'].includes(provider?.role) || flag(provider?.has_provider_access);
  if (!provider || !careRole) {
    if (requireEligible) throw fail('This contact plan is available to assigned school providers.', 403);
    return { eligible: false, agency };
  }
  const [schools] = await pool.execute(`SELECT DISTINCT s.id,s.name FROM agencies s
    JOIN organization_affiliations oa ON oa.organization_id=s.id AND oa.agency_id=? AND oa.is_active=1
    WHERE s.organization_type='school' AND s.is_active=1 AND COALESCE(s.is_archived,0)=0
      AND (EXISTS (SELECT 1 FROM provider_school_assignments p WHERE p.school_organization_id=s.id AND p.provider_user_id=? AND p.is_active=1)
        OR EXISTS (SELECT 1 FROM client_provider_assignments c WHERE c.organization_id=s.id AND c.provider_user_id=? AND c.is_active=1))
    ORDER BY s.name`, [aid, uid, uid]);
  if (!schools.length && requireEligible) throw fail('A school assignment is required to set a contact plan.', 403);
  const flags = parse(agency.feature_flags);
  const mandatory = flags.schoolContactPlanRequired === true || (Array.isArray(flags.schoolContactPlanRequiredProviderIds) && flags.schoolContactPlanRequiredProviderIds.map(Number).includes(uid));
  return { eligible: schools.length > 0, agency, provider, schools, agencyId: aid, userId: uid, mandatory };
}

function planDto(ctx, plan = {}, from) {
  const template = plan.template || DEFAULT_SCHOOL_CONTACT_TEMPLATE;
  const providerName = [ctx.provider.first_name, ctx.provider.last_name].filter(Boolean).join(' ') || 'Provider name';
  return { eligible: ctx.eligible, agencyId: ctx.agencyId, demoOnly: true, mandatory: ctx.mandatory, status: plan.status || 'unconfigured',
    template, smsAfterDays: plan.sms_after_days ?? 3, emailAfterDays: plan.email_after_days ?? 7, staleAfterHours: plan.stale_after_hours ?? 72,
    routing: schoolContactRouting(ctx.provider, from, ctx.agency), schools: ctx.schools, providerName,
    preview: { subject: 'Getting started with school therapy', body: renderSchoolContactTemplate(template, { parent_name: 'Parent name', provider_name: providerName, school_name: 'Example Middle School', service_day: 'Example Day' }) },
    testDestination: SCHOOL_CONTACT_TEST_INBOX };
}

export async function getSchoolContactPlan(input) {
  const ctx = await getContactPlanContext({ ...input, requireEligible: false });
  if (!ctx.eligible) return { eligible: false, demoOnly: true };
  const [[plan]] = await pool.execute('SELECT * FROM school_provider_contact_plans WHERE agency_id=? AND provider_user_id=?', [ctx.agencyId, ctx.userId]);
  const [[identity]] = await pool.execute("SELECT from_email FROM email_sender_identities WHERE agency_id=? AND identity_key IN ('messages','messages_at_tenant') AND is_active=1 LIMIT 1", [ctx.agencyId]);
  return planDto(ctx, plan, identity?.from_email || 'messages@itsco.health');
}

export async function saveSchoolContactPlan(input, body = {}) {
  const ctx = await getContactPlanContext(input);
  const [[existing]] = await pool.execute('SELECT * FROM school_provider_contact_plans WHERE agency_id=? AND provider_user_id=?', [ctx.agencyId, ctx.userId]);
  const status = body.status ?? existing?.status ?? 'unconfigured';
  if (!['declined', 'enabled'].includes(status)) throw fail('Choose whether to enable help with initial contact.');
  if (ctx.mandatory && status !== 'enabled') throw fail('Your organization requires an initial contact plan.', 409);
  const template = validateSchoolContactTemplate(body.template ?? existing?.template);
  const timings = [['smsAfterDays', 'sms_after_days', 3, 1, 30], ['emailAfterDays', 'email_after_days', 7, 2, 60], ['staleAfterHours', 'stale_after_hours', 72, 1, 336]].map(([key, col, fallback, min, max]) => {
    const value = Number(body[key] ?? existing?.[col] ?? fallback);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw fail(`${key} must be a whole number between ${min} and ${max}.`);
    return value;
  });
  if (timings[1] <= timings[0]) throw fail('The email follow-up must be later than the text follow-up.');
  // Editing an enabled plan never moves the assignment cutoff. Re-enabling starts
  // a new opt-in window, so old assignments are not unexpectedly contacted.
  const decidedAt = existing?.status === 'enabled' && status === 'enabled' ? existing.decided_at : new Date();
  await pool.execute(`INSERT INTO school_provider_contact_plans
    (agency_id,provider_user_id,status,template,sms_after_days,email_after_days,stale_after_hours,decided_at)
    VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),template=VALUES(template),sms_after_days=VALUES(sms_after_days),
    email_after_days=VALUES(email_after_days),stale_after_hours=VALUES(stale_after_hours),decided_at=VALUES(decided_at)`,
  [ctx.agencyId, ctx.userId, status, template, ...timings, decidedAt]);
  return getSchoolContactPlan(input);
}

export async function sendSchoolContactEmail({ agencyId, providerUserId, clientId = null, schoolId = null, to, parentName, schoolName, serviceDay,
  template = DEFAULT_SCHOOL_CONTACT_TEMPLATE, subject = 'Getting started with school therapy', body, example = false, conversationId = null, workflowId = null, stepKey = null } = {}) {
  const ctx = await getContactPlanContext({ agencyId, userId: providerUserId });
  const mailbox = await resolveMessagesSendMailbox(ctx.agencyId);
  const from = email(mailbox.fromEmail || mailbox.identity?.from_email);
  if (!mailbox.identity?.id || Number(mailbox.identity.agency_id) !== ctx.agencyId || !/^messages@[^\s<>]+$/.test(from) || !mailbox.inbox?.id) throw fail('The demo messages mailbox is not configured.', 409);
  const routing = schoolContactRouting(ctx.provider, from, ctx.agency);
  if (!routing.providerEmail) throw fail('Your email address must be configured before sending.', 409);
  const recipient = example ? SCHOOL_CONTACT_TEST_INBOX : email(to);
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient)) throw fail('A valid guardian email is required.');
  if (!example) {
    if (!clientId || !schoolId || !ctx.schools.some(s => Number(s.id) === Number(schoolId))) throw fail('A current school client assignment is required.', 403);
    const [[assignment]] = await pool.execute(`SELECT c.id FROM clients c JOIN client_provider_assignments p ON p.client_id=c.id
      WHERE c.id=? AND c.agency_id=? AND p.provider_user_id=? AND p.organization_id=? AND p.is_active=1 LIMIT 1`, [clientId, ctx.agencyId, ctx.userId, schoolId]);
    if (!assignment) throw fail('This client is no longer assigned to you at this school.', 403);
  }
  const title = String(subject).trim();
  if (!title || title.length > 200 || /[\r\n]/.test(title)) throw fail('Enter a valid email subject.');
  const text = body === undefined ? renderSchoolContactTemplate(template, {
    parent_name: parentName || 'Parent name', provider_name: [ctx.provider.first_name, ctx.provider.last_name].filter(Boolean).join(' ') || 'Provider name',
    school_name: schoolName || 'Example Middle School', service_day: serviceDay || 'Example Day'
  }) : String(body).trim();
  if (!text || text.length > 10000) throw fail('Enter a message of up to 10,000 characters.');
  let conversation;
  if (conversationId) {
    conversation = await Conversation.findById(conversationId);
    if (Number(conversation?.agency_id) !== ctx.agencyId || Number(conversation?.owner_user_id) !== ctx.userId) throw fail('Contact conversation not found.', 404);
  } else conversation = await Conversation.create({ agencyId: ctx.agencyId, inboxId: mailbox.inbox.id, channel: 'email', subject: example ? `[Example] ${title}` : title, ownerUserId: ctx.userId, status: 'waiting_on_them' });
  if (!example) {
    await Conversation.upsertLink(conversation.id, 'client', Number(clientId), 'Automated school contact plan');
    await Conversation.upsertLink(conversation.id, 'school', Number(schoolId), schoolName || 'School contact plan');
    await Conversation.upsertParticipant(conversation.id, { kind: 'email', email: recipient, isPrimary: true });
  }
  let replyTo = routing.replyTo;
  if (routing.isSso) {
    const token = randomBytes(18).toString('hex');
    replyTo = from.replace('@', `+${token}@`);
    await pool.execute(`INSERT INTO hub_email_reply_tokens (token_hash,agency_id,conversation_id,person_key,created_by_user_id,expires_at)
      VALUES (?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 180 DAY))`, [createHash('sha256').update(token).digest('hex'), ctx.agencyId, conversation.id, null, ctx.userId]);
  }
  const html = `<div style="font:16px/1.65 Arial,sans-serif;color:#203847">${escapeHtml(text).replaceAll('\n', '<br>')}</div>`;
  const stableMessageId = workflowId && stepKey && /^[a-z0-9_]+$/i.test(String(stepKey))
    ? `<school-contact-${Number(workflowId)}-${stepKey}@itsco.health>` : null;
  const messageId = await Conversation.addMessage({ conversationId: conversation.id, channel: 'email', direction: 'outbound', authorUserId: ctx.userId,
    from: { email: from, name: [ctx.provider.first_name, ctx.provider.last_name].filter(Boolean).join(' '), replyTo,
      ...(workflowId && stepKey ? { schoolContactAutomation: { workflowId: Number(workflowId), stepKey } } : {}) },
    to: [{ email: recipient }], cc: example ? [{ email: routing.providerEmail }] : [], bcc: [{ email: routing.providerEmail }],
    subject: example ? `[Example] ${title}` : title, bodyText: text, bodyHtml: html, sendStatus: 'preparing', internetMessageId: stableMessageId,
    isAutoReply: example, autoReplyKind: example ? 'school_contact_example' : null });
  let delivered = false;
  try {
    if (!example) {
      // A provider may decline while a worker is preparing a message. Recheck
      // the persisted choice immediately before calling the external transport.
      const [[currentPlan]] = await pool.execute('SELECT status,decided_at FROM school_provider_contact_plans WHERE agency_id=? AND provider_user_id=?', [ctx.agencyId, ctx.userId]);
      if (currentPlan?.status !== 'enabled') throw fail('The provider contact plan is no longer enabled.', 409);
      if (workflowId) {
        const [[enrollment]] = await pool.execute(`SELECT plan_decided_at FROM school_contact_workflows
          WHERE id=? AND agency_id=? AND provider_user_id=? AND client_id=? AND school_id=?`, [Number(workflowId), ctx.agencyId, ctx.userId, Number(clientId), Number(schoolId)]);
        if (!enrollment?.plan_decided_at || new Date(enrollment.plan_decided_at).getTime() !== new Date(currentPlan.decided_at).getTime()) {
          throw fail('The provider contact plan enrollment changed before sending.', 409);
        }
      }
    }
    // Pilot transport is a closed sandbox. Logical recipients above preserve the
    // client/provider record; every physical recipient, including copies, is the
    // testing inbox. source:auto prevents generic manual SSO copy expansion.
    const receipt = await sendEmailFromIdentity({ senderIdentityId: mailbox.identity.id, to: SCHOOL_CONTACT_TEST_INBOX,
      cc: example ? SCHOOL_CONTACT_TEST_INBOX : null, bcc: SCHOOL_CONTACT_TEST_INBOX,
      subject: example ? `[Example] ${title}` : title, text, html, replyToOverride: replyTo,
      fromDisplayNameOverride: [ctx.provider.first_name, ctx.provider.last_name].filter(Boolean).join(' '),
      source: 'auto', templateType: example ? 'school_contact_example' : 'school_contact_plan', generatedByUserId: ctx.userId, internetMessageIdOverride: stableMessageId,
      clientId: example ? null : Number(clientId), schoolOrganizationId: example ? null : Number(schoolId) });
    if (!receipt?.id || receipt.pendingApproval || receipt.queued || receipt.skipped) throw fail('The demo email was not delivered. Try again after the message service is ready.', 502);
    delivered = true;
    await Conversation.updateMessage(messageId, { sendStatus: 'sent', sentAt: new Date(), internetMessageId: receipt.internetMessageId || stableMessageId });
    await Conversation.update(conversation.id, { externalThreadId: receipt.threadId || undefined, lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 220) });
    return { sent: true, conversationId: conversation.id, messageId, deliveredTo: SCHOOL_CONTACT_TEST_INBOX, example, replyTo };
  } catch (error) {
    if (delivered) return { sent: true, conversationId: conversation.id, messageId, deliveredTo: SCHOOL_CONTACT_TEST_INBOX, example, recordPending: true };
    await Conversation.updateMessage(messageId, { sendStatus: 'failed' });
    throw error;
  }
}

export async function sendSchoolContactExample(input, body = {}) {
  return sendSchoolContactEmail({ agencyId: input.agencyId, providerUserId: input.userId, template: validateSchoolContactTemplate(body.template), example: true });
}
