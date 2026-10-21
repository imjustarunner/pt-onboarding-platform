// Explicit demo-family email previews. Never drain a queue or call a payment API.
// Run without --apply to review the exact messages in a private local journal.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { TEST_INBOX, assertDemoFamily, assertTestRedirect, demoDeliveryAccepted } from './sendGuardianExperienceEmails.mjs';
const REVISION = 'standard-portal-20261020-v2';
const demoEmailKey=(run,guardianId,kind)=>crypto.createHash('sha256').update(`${REVISION}:${run}:${guardianId}:${kind}`).digest('hex');
function writePrivate(file, data) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
  fs.chmodSync(file, 0o600);
}
export async function main() {
  const input = process.env.GUARDIAN_TEST_OUTPUT;
  if (!input || !path.isAbsolute(input)) throw new Error('Set GUARDIAN_TEST_OUTPUT to the private fixture JSON.');
  const fixture = JSON.parse(fs.readFileSync(input, 'utf8'));
  const apply = process.argv.includes('--apply'), journalFile = `${input}.emails-v2.json`;
  const journal = fs.existsSync(journalFile) ? JSON.parse(fs.readFileSync(journalFile, 'utf8')) : { run: fixture.run, recipient: TEST_INBOX, messages: {} };
  if (journal.run !== fixture.run || journal.recipient !== TEST_INBOX) throw new Error('Email journal does not match the fixture.');
  const { default: pool } = await import('../config/database.js');
  const { default: clinicalPool } = await import('../config/clinicalDatabase.js');
  let db, locked = false;
  try {
    db = await pool.getConnection();
    const [[guardian]] = await db.execute('SELECT id,email,first_name,last_name,role,is_demo,is_active,status_expires_at,password_hash,passwordless_token,passwordless_token_purpose,passwordless_token_expires_at FROM users WHERE id=?', [fixture.guardian?.id || 0]);
    const ids = (fixture.clients || []).map(c => Number(c.id));
    if (ids.length !== 3 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error('Invalid demo client IDs.');
    const [clients] = await db.execute(`SELECT c.id,c.agency_id,c.organization_id,c.client_type,c.initials,c.full_name,c.is_demo,cg.guardian_user_id,cg.access_enabled
      FROM clients c JOIN client_guardians cg ON cg.client_id=c.id AND cg.guardian_user_id=? WHERE c.id IN (?,?,?)`,
    [guardian?.id || 0, ...ids]);
    assertDemoFamily(fixture, guardian, clients);
    const [allLinks] = await db.execute('SELECT client_id FROM client_guardians WHERE guardian_user_id=?', [guardian.id]);
    if (allLinks.length !== 3 || allLinks.some(row => !ids.includes(Number(row.client_id)))) throw new Error('Demo account has links outside the three fixture children.');
    const [[actor]] = await db.execute("SELECT id FROM users WHERE id=? AND role='super_admin' AND is_active=1", [fixture.actorId]);
    if (!actor) throw new Error('The fixture administrator is unavailable.');
    const { rewriteHogwartsOutboundRecipient } = await import('../utils/hogwartsTestEmail.js');
    const redirectCheck = async () => assertTestRedirect(await rewriteHogwartsOutboundRecipient({ to: guardian.email, subject: 'Guardian experience preview', userId: guardian.id }), guardian.email);
    await redirectCheck();
    const { getClientPreferences } = await import('../services/sessionNotification.service.js');
    for (const client of clients) {
      const prefs = await getClientPreferences(client.agency_id, client.id, guardian.id);
      if (prefs.channels?.email !== true || prefs.channels?.sms === true || prefs.optionalRemindersEnabled === false) {
        throw new Error('Save demo email preferences on and SMS off before sending the preview set.');
      }
    }
    const { clientPortalInviteUrl } = await import('../services/clientPortalContext.service.js');
    const { clientEmailContext, sendClientPortalEmail } = await import('../services/clientPortalEmail.service.js');
    const { buildClientEnrollmentEmail, buildFamilyBillingEmail, buildTreatmentPlanEmail } = await import('../services/clientPortalEmailContent.js');
    const { renderPortalEmail } = await import('../services/portalEmailBranding.service.js');
    const { default: Agency } = await import('../models/Agency.model.js');
    const agencies = new Map();
    for (const client of clients) if (!agencies.has(Number(client.agency_id))) agencies.set(Number(client.agency_id), await Agency.findById(client.agency_id));
    const messages = [];
    const add = (kind, client, content, extra = {}) => messages.push({kind,agencyId:Number(client.agency_id),clientId:Number(client.id),...content,...extra});
    const office = clients.find(c => fixture.clients.find(f => Number(f.id) === Number(c.id))?.setting === 'office' && Number(c.agency_id) === 2);
    const nlu = clients.find(c => Number(c.agency_id) === 6);
    if (!office || !nlu) throw new Error('Expected ITSCO office and NLU demo children.');
    const officeContext = await clientEmailContext({agencyId:office.agency_id,clientId:office.id});
    if (!guardian.password_hash && (!guardian.passwordless_token || guardian.passwordless_token_purpose !== 'setup' || new Date(guardian.passwordless_token_expires_at).getTime() <= Date.now())) throw new Error('The existing demo setup invitation has expired.');
    const expectedSetupUrl = clientPortalInviteUrl({portal:officeContext.portal,token:guardian.passwordless_token,existingAccount:!!guardian.password_hash});
    add('welcome-two-itsco',office,{templateType:'hub_portal_invite',...buildClientEnrollmentEmail({firstName:guardian.first_name,agencyName:officeContext.tenant.name,clients:clients.filter(c=>Number(c.agency_id)===2),existingAccount:!!guardian.password_hash,url:expectedSetupUrl})});
    for (const learning of [true,false]) {
      const context=await clientEmailContext({agencyId:nlu.agency_id,clientId:nlu.id,learning,clinical:!learning});
      // The tutoring example changes email presentation only, never the child's clinical record.
      add(learning?'nlu-tutoring-added':'nlu-counseling-added',nlu,{templateType:'hub_portal_invite',...buildClientEnrollmentEmail({firstName:guardian.first_name,agencyName:context.tenant.name,clients:[nlu],learning,existingAccount:true,url:clientPortalInviteUrl({portal:context.portal,existingAccount:true})})},{learning,clinical:!learning});
    }
    const { default: Appointment } = await import('../models/Appointment.model.js');
    const { buildAppointmentEmail } = await import('../services/appointmentEmailActions.service.js');
    const { resolveAppointmentServiceSetting } = await import('../services/appointmentServiceSetting.service.js');
    let confirmationAdded = false;
    for (const client of clients) {
      const [appointments]=await db.execute(`SELECT a.id FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id
        WHERE p.client_id=? AND a.agency_id=? AND a.start_at>UTC_TIMESTAMP() AND a.status IN ('scheduled','confirmed','client_confirmed') ORDER BY a.start_at LIMIT 1`,[client.id,client.agency_id]);
      if (!appointments.length) throw new Error('Each demo child needs an upcoming appointment.');
      const appointment=await Appointment.findById(appointments[0].id);
      const {context,...content}=await buildAppointmentEmail({appointment,clientId:client.id,to:guardian.email});
      add(`appointment-${client.id}`,client,{templateType:'session_reminder',...content});
      const setting=await resolveAppointmentServiceSetting(appointment);
      if(!setting.isSchool&&!confirmationAdded){
        const {context,...confirmation}=await buildAppointmentEmail({appointment,clientId:client.id,to:guardian.email,kind:'confirmation'});
        add('appointment-confirmation',client,{templateType:'session_confirmation',...confirmation});confirmationAdded=true;
      }
    }
    const { listBalances } = await import('../services/familyLedger/views.js');
    const { getPaymentTask } = await import('../services/familyLedger/tasks.js');
    const { default: Cards } = await import('../models/GuardianPaymentCard.model.js');
    for (const [agencyId, agency] of agencies) {
      const client = clients.find(c => Number(c.agency_id) === agencyId);
      const context = await clientEmailContext({agencyId,clientId:client.id});
      const billingUrl = context.url('guardian?panel=billing');
      const balances = (await listBalances({ agencyId, userId: guardian.id })).filter(b => ids.includes(Number(b.clientId)) && b.isOwnShare && b.billingState === 'due' && b.dueCents > 0);
      if (balances.length) {
        add(`balance-${agencyId}`,client,{templateType:'family_balance_due',...buildFamilyBillingEmail({kind:'balance',agencyName:agency.name,url:billingUrl})},{billing:true});
        if(balances.some(b=>String(b.dueDate instanceof Date?b.dueDate.toISOString():b.dueDate).slice(0,10)<new Date().toISOString().slice(0,10))) add(`statement-${agencyId}`,client,{templateType:'family_collections',...buildFamilyBillingEmail({kind:'statement',agencyName:agency.name,url:billingUrl})},{billing:true});
      }
      const cards = await Cards.findActiveByGuardian(guardian.id, agencyId);
      const now = new Date();
      if (cards.some(c => Number(c.card_exp_year) < now.getUTCFullYear() || (Number(c.card_exp_year) === now.getUTCFullYear() && Number(c.card_exp_month) < now.getUTCMonth() + 1))) {
        const financial = fixture.clients.find(c => Number(c.id) === Number(client.id))?.financial;
        if (!financial?.billingTaskToken || !financial.billingTaskId) throw new Error('An expired demo card needs its seeded payment task invitation.');
        const task = await getPaymentTask({ userId: guardian.id, token: financial.billingTaskToken });
        if (Number(task.id) !== Number(financial.billingTaskId) || Number(task.agencyId) !== agencyId
            || task.status !== 'pending' || !task.clientIds?.length
            || task.clientIds.some(id => !ids.includes(Number(id)))) throw new Error('Demo payment task does not match the fixture.');
        const url=context.url(`billing/complete/${financial.billingTaskToken}`);
        add(`payment-setup-${agencyId}`,client,{templateType:'family_payment_setup',...buildFamilyBillingEmail({kind:'payment_setup',agencyName:agency.name,url})},{billing:true});
      }
    }
    const { cardContext } = await import('../services/insuranceCards/service.js');
    const { cardCycle, cardProgress } = await import('../services/insuranceCards/policy.js');
    const { previewCardEmail } = await import('../services/insuranceCards/staffTasks.js');
    const insuranceAgencies = new Set();
    for (const record of fixture.clients) {
      const client = clients.find(c => Number(c.id) === Number(record.id));
      if (!record.insuranceProfileId || insuranceAgencies.has(Number(client.agency_id))) continue;
      const context = await cardContext({ agencyId: client.agency_id, profileId: record.insuranceProfileId, userId: guardian.id });
      if (Number(context.profile.guardian_user_id) !== Number(guardian.id)) throw new Error('Insurance profile owner mismatch.');
      const [[old]] = await db.execute('SELECT * FROM insurance_card_followups WHERE profile_id=? AND agency_id=?', [record.insuranceProfileId, client.agency_id]);
      const progress = cardProgress(context.profile, old || {}, new Date(), context.coverageVerified, context.followupEligible);
      if (!progress.missingSlots.length) continue;
      const preview = await previewCardEmail({ id: fixture.actorId, role: 'super_admin' },
        { agencyId: client.agency_id, profileId: record.insuranceProfileId, cycle: cardCycle(context.profile) },
        { refresh: async () => ({ ...old, ...progress, cycle_hash: cardCycle(context.profile), first_requested_at: old?.first_requested_at || new Date(), email_enabled: 1 }) });
      if (!preview.senderId || preview.to !== guardian.email) throw new Error('Demo insurance preview sender or recipient mismatch.');
      add(`insurance-${client.agency_id}`,client,{templateType:'insurance_card_followup',subject:preview.subject,text:preview.text,html:preview.html},{billing:true});
      insuranceAgencies.add(Number(client.agency_id));
    }
    const [acks] = await db.execute(`SELECT id,agency_id,client_id FROM treatment_plan_ack_links WHERE recipient_user_id=?
      AND client_id IN (?,?,?) AND dashboard_visible=1 AND status IN ('issued','sent','opened','viewed') ORDER BY id LIMIT 1`, [guardian.id, ...ids]);
    if (acks.length) {
      const client = clients.find(c => Number(c.id) === Number(acks[0].client_id)), agency = agencies.get(Number(client.agency_id));
      const context=await clientEmailContext({agencyId:client.agency_id,clientId:client.id});
      const url=context.url(`guardian?panel=plan&clientId=${client.id}`);
      add('treatment-plan',client,{templateType:'guardian_plan_review',...buildTreatmentPlanEmail({client,recipientName:guardian.first_name,url})});
    }
    for (const message of messages) {
      const previous = journal.messages[message.kind];
      // Refresh unsent previews; preserve the actual snapshot of attempted mail.
      journal.messages[message.kind] = { ...(previous?.status ? previous : message),
        key: demoEmailKey(fixture.run, guardian.id, message.kind) };
    }
    const previewDir=`${input}.email-v2-previews`;
    fs.mkdirSync(previewDir,{recursive:true,mode:0o700});
    for(const message of messages){
      const context=await clientEmailContext(message);
      fs.writeFileSync(path.join(previewDir,`${message.kind}.html`),renderPortalEmail({brand:context.brand,...message}),{mode:0o600});
    }
    writePrivate(journalFile, journal);
    if (!apply) {
      console.log(JSON.stringify({ preview: true, recipient: TEST_INBOX, messageCount: messages.length, kinds: messages.map(m => m.kind), privateJournal: journalFile }));
      return;
    }
    const lockName = `guardian-demo-mail:${guardian.id}`;
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,0) AS acquired', [lockName]);
    locked = Number(lock.acquired) === 1;
    if (!locked) throw new Error('Another demo email run is active.');
    const { default: Communication } = await import('../models/UserCommunication.model.js');
    for (const message of messages) {
      const entry = journal.messages[message.kind];
      const [[existing]] = await db.execute("SELECT id,delivery_status FROM user_communications WHERE user_id=? AND template_type='guardian_test_email_attempt' AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.guardianExperienceEmailKey'))=? LIMIT 1", [guardian.id, entry.key]);
      if (existing || entry.status) {
        if (existing?.delivery_status === 'sent' || entry.status === 'sent') { entry.status = 'sent'; continue; }
        throw new Error(`Demo ${message.kind} has a prior uncertain attempt. Reconcile its communication record before retrying.`);
      }
      await redirectCheck();
      const marker = await Communication.create({ userId: guardian.id, agencyId: message.agencyId,
        templateType: 'guardian_test_email_attempt', channel: 'email', recipientAddress: guardian.email,
        subject: `Demo preview attempt: ${message.kind}`, body: 'Explicitly requested fictional-family email preview.',
        deliveryStatus: 'pending', generatedByUserId: fixture.actorId,
        metadata: { guardianExperienceEmailKey: entry.key, run: fixture.run, previewKind: message.kind, deliveredTo: TEST_INBOX } });
      entry.status = 'sending'; entry.attemptCommunicationId = marker.id; entry.startedAt = new Date().toISOString();
      writePrivate(journalFile, journal);
      try {
        const {kind,learning,clinical,...payload}=message;
        const context=await clientEmailContext({agencyId:message.agencyId,clientId:message.clientId,learning,clinical});
        const result=await sendClientPortalEmail({...payload,context,to:guardian.email,userId:guardian.id,
          generatedByUserId:fixture.actorId,source:'manual',usedFallbackSender:false,
          internetMessageIdOverride:`<guardian-demo-${entry.key}@itsco.health>`});
        if(kind==='welcome-two-itsco') {fixture.guardian.setupUrl=expectedSetupUrl;writePrivate(input,fixture);}
        entry.delivery = result;
        if (!demoDeliveryAccepted(result, guardian.email)) throw new Error('Demo email was not confirmed as submitted to the testing inbox.');
        await db.execute("UPDATE user_communications SET delivery_status='sent',external_message_id=?,sent_at=UTC_TIMESTAMP() WHERE id=? AND user_id=?",
          [result.id, marker.id, guardian.id]);
        entry.status = 'sent'; entry.finishedAt = new Date().toISOString(); writePrivate(journalFile, journal);
      } catch (error) {
        entry.status = 'needs_review'; entry.error = error.code || 'delivery_needs_review'; writePrivate(journalFile, journal);
        throw error;
      }
    }
    writePrivate(journalFile, journal);
    console.log(JSON.stringify({ applied: true, recipient: TEST_INBOX, sent: messages.filter(m => journal.messages[m.kind]?.status === 'sent').length, privateJournal: journalFile }));
  } finally {
    if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [`guardian-demo-mail:${fixture.guardian.id}`]);
    db?.release();
    await pool.end();
    if (clinicalPool !== pool) await clinicalPool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error('Demo email run stopped:', error.code || error.message); process.exitCode = 1; });
}
