import { randomBytes, createHash } from 'node:crypto';
import pool from '../config/database.js';
import Conversation from '../models/CommunicationConversation.model.js';
import { resolveMessagesSendMailbox } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { managedDomain } from './managedWorkspaceGroupPolicy.js';

import { SCHOOL_CONTACT_DEMO_AGENCY_ID, SCHOOL_CONTACT_TEST_INBOX, SCHOOL_CONTACT_AGENCY_IDS, SCHOOL_CONTACT_CARE_ROLES, isSchoolContactDemoAgency, isSchoolContactProviderEnabled, isAssignedSchoolRollout, schoolContactDelivery } from './schoolContactRollout.js';
export { SCHOOL_CONTACT_DEMO_AGENCY_ID, SCHOOL_CONTACT_TEST_INBOX, isSchoolContactDemoAgency } from './schoolContactRollout.js';
export { DEFAULT_SCHOOL_CONTACT_TEMPLATE } from './schoolContactTemplates.js';
import { DEFAULT_SCHOOL_CONTACT_TEMPLATE, DEFAULT_SECOND_CONTACT_TEMPLATE, DEFAULT_FINAL_CONTACT_TEMPLATE, DEFAULT_CONTACT_SMS_TEMPLATE, SCHOOL_CONTACT_SUBJECTS,preferredSchoolContactTemplate,displaySchoolContactDay } from './schoolContactTemplates.js';
import { buildProviderIntroductionPdf, introductionPdfAttachment, providerProfileUrl } from './familyWelcomeAssets.service.js';
export const FAMILY_WELCOME_NAME = 'Family Welcome & Follow-Up';
const TOKENS = ['parent_name', 'provider_name', 'school_name', 'service_day'];
const OPTIONAL_TOKENS = ['profile_link'];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const email = value => String(value || '').trim().toLowerCase();
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const flag = value => [true, 1, '1'].includes(value);

export function validateSchoolContactTemplate(value) {
  const template = String(value ?? DEFAULT_SCHOOL_CONTACT_TEMPLATE).trim();
  if (template.length < 80 || template.length > 6000) throw fail('Keep your message between 80 and 6,000 characters.');
  if (/<[^>]*>/.test(template)) throw fail('Use plain text in your contact message.');
  for (const token of TOKENS) if (!template.includes(`{{${token}}}`)) throw fail(`Keep the {{${token}}} placeholder in your message.`);
  const unknown = [...template.matchAll(/{{\s*([^}]+)\s*}}/g)].find(match => ![...TOKENS, ...OPTIONAL_TOKENS].includes(match[1]));
  if (unknown) throw fail('Use only the supported name, school, day, and profile link placeholders.');
  if (/{{|}}/.test(template.replace(/{{(?:parent_name|provider_name|school_name|service_day|profile_link)}}/g, ''))) throw fail('An automatic field is incomplete. Remove it and insert it again using its button.');
  return template;
}

export function renderSchoolContactTemplate(template, values) {
  return validateSchoolContactTemplate(template).replace(/{{(parent_name|provider_name|school_name|service_day|profile_link)}}/g, (_, key) => String(values[key] || ''));
}

function linkedEmailHtml(text, profileUrl) {
  let html = escapeHtml(text).replaceAll('\n', '<br>');
  if (profileUrl && /^https?:\/\//.test(profileUrl)) {
    const safe = escapeHtml(profileUrl);
    html = html.replaceAll(safe, `<a href="${safe}">${safe}</a>`);
  }
  return `<div style="font:16px/1.65 Arial,sans-serif;color:#203847">${html}</div>`;
}

export function schoolContactRouting(provider, from = 'messages@itsco.health', agency = {}) {
  const policyRequiresSso = parse(agency.feature_flags).googleSsoEnabled === true || !!managedDomain(agency);
  const isSso = policyRequiresSso && !flag(provider.sso_password_override) && !flag(provider.login_is_group_email);
  const providerEmail = email(isSso ? provider.work_mailbox_email : provider.personal_email || provider.email || provider.work_email);
  return { isSso, from, providerEmail, replyTo: providerEmail,
    replyTracking: isSso ? 'in_app' : 'external_email',
    replyTrackingNote: isSso ? 'Replies go to your configured work email. Replies to this contact email are also linked to the client’s app conversation.' : 'Replies go to your email. Replies sent outside the app may not be visible here; record them in the client contact history to stop follow-ups.' };
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
    const [parents] = await pool.execute(`SELECT a.id,a.name,a.slug,a.is_active,a.is_archived,a.feature_flags,a.organization_type
      FROM organization_affiliations oa JOIN agencies a ON a.id=oa.agency_id
      WHERE oa.organization_id=? AND oa.agency_id IN (?,?) AND oa.is_active=1 ORDER BY a.id`, [aid, ...SCHOOL_CONTACT_AGENCY_IDS]);
    const parent = parents.find(candidate => isSchoolContactProviderEnabled(candidate, uid));
    if (parent) { agency = parent; aid = Number(parent.id); }
  }
  if (!isSchoolContactProviderEnabled(agency, uid)) {
    if (requireEligible) throw fail('Family Welcome is not enabled for this account in the current rollout.', 403);
    return { eligible: false, agency };
  }
  const [[provider]] = await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.role,u.has_provider_access,u.email,u.work_email,u.personal_email,u.sso_password_override,u.login_is_group_email,
      (SELECT i.from_email FROM communication_inboxes i JOIN email_sender_identities esi ON esi.id=i.sender_identity_id AND esi.agency_id=i.agency_id AND esi.is_active=1 AND esi.identity_key=CONCAT('personal_',u.id) AND LOWER(esi.from_email)=LOWER(i.from_email)
        WHERE i.agency_id=ua.agency_id AND i.owner_user_id=u.id AND i.kind='personal' AND i.is_active=1 ORDER BY i.id LIMIT 1) AS work_mailbox_email
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.id=? AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_active,1)=1 AND u.terminated_at IS NULL AND (ua.agency_id=450 OR COALESCE(u.is_demo,0)=0)`, [aid, uid]);
  const careRole = SCHOOL_CONTACT_CARE_ROLES.includes(provider?.role) || flag(provider?.has_provider_access);
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

const WEEKDAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
async function loadPreviewSchoolDays(ctx) {
  const [rows] = await pool.execute(`SELECT school_organization_id,day_of_week FROM provider_school_assignments
    WHERE provider_user_id=? AND is_active=1 AND school_organization_id IN (${ctx.schools.map(()=>'?').join(',')})`, [ctx.userId,...ctx.schools.map(s=>s.id)]);
  ctx.schools = ctx.schools.map(s => {
    const assigned = (Array.isArray(rows) ? rows : []).filter(r=>Number(r.school_organization_id)===Number(s.id)).map(r=>String(r.day_of_week || ''));
    const serviceDays = WEEKDAYS.filter(day=>assigned.includes(day));
    const serviceDayLabel = serviceDays.length > 1 ? serviceDays.slice(0,-1).join(', ')+' and '+serviceDays.at(-1) : serviceDays[0] || 'to be confirmed';
    return {...s,serviceDays,serviceDayLabel};
  });
}

function planDto(ctx, plan = {}, from) {
  const template = preferredSchoolContactTemplate(plan.template);
  const providerName = [ctx.provider.first_name, ctx.provider.last_name].filter(Boolean).join(' ') || 'Provider name';
  const profileUrl = providerProfileUrl(ctx.agency, ctx.provider);
  const routing = schoolContactRouting(ctx.provider, from, ctx.agency);
  return { eligible: ctx.eligible, agencyId: ctx.agencyId, demoOnly: isSchoolContactDemoAgency(ctx.agency), rolloutPhase: isSchoolContactDemoAgency(ctx.agency) ? 'qa' : isAssignedSchoolRollout(ctx.agency) ? 'assigned_school_providers' : 'phase_1', mandatory: ctx.mandatory || flag(plan.required_by_admin), status: plan.status || 'unconfigured',
    featureName: FAMILY_WELCOME_NAME, agencySlug: ctx.agency.slug, includePdf: plan.include_pdf === undefined || plan.include_pdf === null ? true : flag(plan.include_pdf),
    welcomeSeen: !!plan.welcome_seen_at, canEnable: !!routing.providerEmail, setupNotice: routing.providerEmail ? null : 'Your messaging email needs support setup before you turn this on. You can still review your messages and save Off.', profileUrl, agencyName: ctx.agency.name, previewValues: { profile_link: profileUrl, agency_name: ctx.agency.name },
    recommendedTemplates:{template:DEFAULT_SCHOOL_CONTACT_TEMPLATE,secondTemplate:DEFAULT_SECOND_CONTACT_TEMPLATE,finalTemplate:DEFAULT_FINAL_CONTACT_TEMPLATE,smsTemplate:DEFAULT_CONTACT_SMS_TEMPLATE},
    template, secondTemplate:plan.second_template || DEFAULT_SECOND_CONTACT_TEMPLATE, finalTemplate:plan.final_template || DEFAULT_FINAL_CONTACT_TEMPLATE, smsTemplate:plan.sms_template || DEFAULT_CONTACT_SMS_TEMPLATE,
    smsAfterDays:2, emailAfterDays:4, staleAfterHours:48, providerNoticeAfterDays:6, reminderEveryHours:48,
    routing, schools: ctx.schools, providerName,
    subjects: SCHOOL_CONTACT_SUBJECTS,
    preview: { subject: SCHOOL_CONTACT_SUBJECTS.initial_email, body: renderSchoolContactTemplate(template, { parent_name: 'Parent name', provider_name: providerName, school_name: ctx.schools[0]?.name || 'Your assigned school', service_day: ctx.schools[0]?.serviceDayLabel || 'to be confirmed', profile_link: profileUrl }) },
    testDestination: isSchoolContactDemoAgency(ctx.agency) ? SCHOOL_CONTACT_TEST_INBOX : schoolContactRouting(ctx.provider, from, ctx.agency).providerEmail };
}

export async function getSchoolContactPlan(input) {
  const ctx = await getContactPlanContext({ ...input, requireEligible: false });
  if (!ctx.eligible) return { eligible: false, demoOnly: true };
  await loadPreviewSchoolDays(ctx);
  const [[plan]] = await pool.execute('SELECT * FROM school_provider_contact_plans WHERE agency_id=? AND provider_user_id=?', [ctx.agencyId, ctx.userId]);
  const [[identity]] = await pool.execute("SELECT from_email FROM email_sender_identities WHERE agency_id=? AND identity_key IN ('messages','messages_at_tenant') AND is_active=1 LIMIT 1", [ctx.agencyId]);
  return planDto(ctx, plan, identity?.from_email || 'messages@itsco.health');
}

export async function saveSchoolContactPlan(input, body = {}) {
  const ctx = await getContactPlanContext(input);
  const [[existing]] = await pool.execute('SELECT * FROM school_provider_contact_plans WHERE agency_id=? AND provider_user_id=?', [ctx.agencyId, ctx.userId]);
  const status = body.status ?? existing?.status ?? 'unconfigured';
  if (!['declined', 'enabled'].includes(status)) throw fail('Choose whether to enable help with initial contact.');
  if (status === 'enabled' && !schoolContactRouting(ctx.provider,undefined,ctx.agency).providerEmail) throw fail('Your messaging email needs support setup before you turn Family Welcome on.',409);
  if ((ctx.mandatory || flag(existing?.required_by_admin)) && status !== 'enabled') throw fail('Your organization requires an initial contact plan.', 409);
  const template = validateSchoolContactTemplate(body.template ?? existing?.template);
  const second = validateSchoolContactTemplate(body.secondTemplate ?? existing?.second_template ?? DEFAULT_SECOND_CONTACT_TEMPLATE);
  const final = validateSchoolContactTemplate(body.finalTemplate ?? existing?.final_template ?? DEFAULT_FINAL_CONTACT_TEMPLATE);
  const sms = String(body.smsTemplate ?? existing?.sms_template ?? DEFAULT_CONTACT_SMS_TEMPLATE).trim();
  if (sms.length < 40 || sms.length > 1000 || /<[^>]*>/.test(sms) || !sms.includes('{{parent_name}}') || !sms.includes('{{provider_name}}')) throw fail('Keep your text between 40 and 1,000 characters and retain the parent and provider fields.');
  if ([...sms.matchAll(/{{\s*([^}]+)\s*}}/g)].some(m => ![...TOKENS,'agency_name'].includes(m[1]))) throw fail('Use only the supported text fields.');
  if (/{{|}}/.test(sms.replace(/{{(?:parent_name|provider_name|school_name|service_day|agency_name)}}/g, ''))) throw fail('An automatic text field is incomplete. Use its insertion button.');
  const timings = [2,4,48];
  const includePdf = body.includePdf === undefined ? (existing?.include_pdf ?? 1) : (body.includePdf ? 1 : 0);
  // Editing an enabled plan never moves the assignment cutoff. Re-enabling starts
  // a new opt-in window, so old assignments are not unexpectedly contacted.
  const decidedAt = existing?.status === 'enabled' && status === 'enabled' ? existing.decided_at : new Date();
  await pool.execute(`INSERT INTO school_provider_contact_plans
    (agency_id,provider_user_id,status,template,second_template,final_template,sms_template,sms_after_days,email_after_days,stale_after_hours,decided_at,include_pdf,welcome_seen_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE status=VALUES(status),template=VALUES(template),second_template=VALUES(second_template),final_template=VALUES(final_template),sms_template=VALUES(sms_template),sms_after_days=VALUES(sms_after_days),
    email_after_days=VALUES(email_after_days),stale_after_hours=VALUES(stale_after_hours),decided_at=VALUES(decided_at),include_pdf=VALUES(include_pdf),welcome_seen_at=COALESCE(welcome_seen_at,VALUES(welcome_seen_at))`,
  [ctx.agencyId, ctx.userId, status, template, second, final, sms, ...timings, decidedAt, includePdf]);
  return getSchoolContactPlan(input);
}

export async function buildFamilyWelcomePdfPreview(input, schoolId = null) {
  const ctx = await getContactPlanContext(input);
  const school = schoolId == null ? ctx.schools[0] : ctx.schools.find(s => Number(s.id) === Number(schoolId));
  if (!school) throw fail('Choose one of your assigned schools for the PDF.',403);
  return buildProviderIntroductionPdf({ agencyId: ctx.agencyId, providerUserId: ctx.userId, schoolId: school.id });
}

export async function sendSchoolContactEmail({ agencyId, providerUserId, clientId = null, schoolId = null, to, parentName, schoolName, serviceDay,
  template = DEFAULT_SCHOOL_CONTACT_TEMPLATE, subject = SCHOOL_CONTACT_SUBJECTS.initial_email, body, example = false, conversationId = null, workflowId = null, stepKey = null, includePdf = null, beforeDelivery=null,qaAcceleration=null } = {}) {
  const ctx = await getContactPlanContext({ agencyId, userId: providerUserId });
  if (example) await loadPreviewSchoolDays(ctx);
  const exampleSchool = example ? (schoolId == null ? ctx.schools[0] : ctx.schools.find(s => Number(s.id) === Number(schoolId))) : null;
  if (example && !exampleSchool) throw fail('Choose one of your assigned schools for the example.', 403);
  const mailbox = await resolveMessagesSendMailbox(ctx.agencyId);
  const from = email(mailbox.fromEmail || mailbox.identity?.from_email);
  if (!mailbox.identity?.id || Number(mailbox.identity.agency_id) !== ctx.agencyId || !/^messages@[^\s<>]+$/.test(from) || !mailbox.inbox?.id) throw fail('The messages mailbox is not configured.', 409);
  const routing = schoolContactRouting(ctx.provider, from, ctx.agency);
  if (!routing.providerEmail) throw fail('Your email address must be configured before sending.', 409);
  const recipient = example ? (isSchoolContactDemoAgency(ctx.agency) ? SCHOOL_CONTACT_TEST_INBOX : routing.providerEmail) : email(to);
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient)) throw fail('A valid guardian email is required.');
  if (!example) {
    if (!clientId || !schoolId || !ctx.schools.some(s => Number(s.id) === Number(schoolId))) throw fail('A current school client assignment is required.', 403);
    const [[assignment]] = await pool.execute(`SELECT c.id FROM clients c JOIN client_provider_assignments p ON p.client_id=c.id
      WHERE c.id=? AND c.agency_id=? AND p.provider_user_id=? AND p.organization_id=? AND p.is_active=1 LIMIT 1`, [clientId, ctx.agencyId, ctx.userId, schoolId]);
    if (!assignment) throw fail('This client is no longer assigned to you at this school.', 403);
  }
  const title = String(subject).trim();
  if (!title || title.length > 200 || /[\r\n]/.test(title)) throw fail('Enter a valid email subject.');
  const profileUrl = providerProfileUrl(ctx.agency, ctx.provider);
  const text = body === undefined ? renderSchoolContactTemplate(template, {
    parent_name: parentName || 'Parent name', provider_name: [ctx.provider.first_name, ctx.provider.last_name].filter(Boolean).join(' ') || 'Provider name',
    school_name: example ? exampleSchool.name : ctx.schools.find(s => Number(s.id) === Number(schoolId))?.name || schoolName || 'School', service_day: example ? exampleSchool.serviceDayLabel : displaySchoolContactDay(serviceDay), profile_link: profileUrl
  }) : String(body).trim();
  let attachments = null;
  if ((stepKey === 'initial_email' || (example && !stepKey)) && ctx.schools.length) {
    let attach = includePdf;
    if (attach === null) {
      const [[saved]] = await pool.execute('SELECT include_pdf FROM school_provider_contact_plans WHERE agency_id=? AND provider_user_id=?', [ctx.agencyId, ctx.userId]);
      attach = saved ? flag(saved.include_pdf) : true;
    }
    if (attach) {
      const pdfSchool = ctx.schools.find(s => Number(s.id) === Number(schoolId)) || ctx.schools[0];
      attachments = [introductionPdfAttachment(await buildProviderIntroductionPdf({ agencyId: ctx.agencyId, providerUserId: ctx.userId, schoolId: pdfSchool.id }))];
    }
  }
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
  if(routing.isSso) {
    const {schoolContactWorkMailboxAvailable}=await import('./schoolContactReplyRouting.service.js');
    if(!await schoolContactWorkMailboxAvailable(routing.providerEmail)) {
      // Keep replies in the app when delegated access to the SSO work mailbox
      // is unavailable. This token route remains valid for historical sends.
      const token=randomBytes(18).toString('hex');
      replyTo=from.replace('@',`+${token}@`);
      await pool.execute(`INSERT INTO hub_email_reply_tokens (token_hash,agency_id,conversation_id,person_key,created_by_user_id,expires_at)
        VALUES (?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 180 DAY))`,[createHash('sha256').update(token).digest('hex'),ctx.agencyId,conversation.id,null,ctx.userId]);
    }
  }
  const html = linkedEmailHtml(text, profileUrl);
  const stableMessageId = workflowId && stepKey && /^[a-z0-9_]+$/i.test(String(stepKey))
    ? `<school-contact-${Number(workflowId)}-${stepKey}@itsco.health>` : null;
  const messageId = await Conversation.addMessage({ conversationId: conversation.id, channel: 'email', direction: 'outbound', authorUserId: ctx.userId,
    from: { email: from, name: [ctx.provider.first_name, ctx.provider.last_name].filter(Boolean).join(' '), replyTo,
      ...(workflowId && stepKey ? { schoolContactAutomation: { workflowId: Number(workflowId), stepKey,...(qaAcceleration?{acceleratedQa:qaAcceleration}:{}) } } : {}) },
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
    // QA remains physically closed. The approved live cohort uses the verified
    // guardian/provider addresses. Automatic sends never expand generic copies.
    if(beforeDelivery)await beforeDelivery();
    const recipients = schoolContactDelivery(ctx.agencyId, { to: recipient, cc: example && isSchoolContactDemoAgency(ctx.agency) ? routing.providerEmail : null, bcc: !example || isSchoolContactDemoAgency(ctx.agency) ? routing.providerEmail : null });
    const receipt = await sendEmailFromIdentity({ senderIdentityId: mailbox.identity.id, ...recipients,
      subject: example ? `[Example] ${title}` : title, text, html, attachments, replyToOverride: replyTo,
      fromDisplayNameOverride: [ctx.provider.first_name, ctx.provider.last_name].filter(Boolean).join(' '),
      source: 'auto', templateType: example ? 'school_contact_example' : 'school_contact_plan', generatedByUserId: ctx.userId, internetMessageIdOverride: stableMessageId,
      clientId: example ? null : Number(clientId), schoolOrganizationId: example ? null : Number(schoolId) });
    if (!receipt?.id || receipt.pendingApproval || receipt.queued || receipt.skipped) throw fail('The email was not accepted. Review its delivery before trying again.', 502);
    delivered = true;
    await Conversation.updateMessage(messageId, { sendStatus: 'sent', sentAt: new Date(), internetMessageId: receipt.internetMessageId || stableMessageId });
    await Conversation.update(conversation.id, { externalThreadId: receipt.threadId || undefined, lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 220) });
    return { sent: true, conversationId: conversation.id, messageId, deliveredTo: schoolContactDelivery(ctx.agencyId, { to: recipient }).to, example, replyTo };
  } catch (error) {
    if (delivered) return { sent: true, conversationId: conversation.id, messageId, deliveredTo: schoolContactDelivery(ctx.agencyId, { to: recipient }).to, example, recordPending: true };
    await Conversation.updateMessage(messageId, { sendStatus: 'failed' });
    throw error;
  }
}

export async function sendSchoolContactExample(input, body = {}) {
  const stepKey=['initial_email','second_contact','final_contact'].includes(body.stepKey)?body.stepKey:'initial_email';
  return sendSchoolContactEmail({agencyId:input.agencyId,providerUserId:input.userId,schoolId:body.schoolId ?? null,template:validateSchoolContactTemplate(body.template),subject:SCHOOL_CONTACT_SUBJECTS[stepKey],example:true,
    stepKey:stepKey==='initial_email'?'initial_email':null,includePdf:stepKey==='initial_email'?body.includePdf!==false:false});
}
