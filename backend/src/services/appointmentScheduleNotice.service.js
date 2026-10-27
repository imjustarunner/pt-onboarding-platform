import pool from '../config/database.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { futureAppointment, scheduleNoticeDeadline, buildScheduleNoticeMessage } from './scheduleNoticeMessage.service.js';

const sqlDate = d => d.toISOString().slice(0, 19).replace('T', ' ');
const active = a => ['scheduled', 'confirmed', 'client_confirmed'].includes(a?.status);
const canceled = a => ['canceled','cancelled','canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','canceled_by_agency','late_canceled','rescheduled'].includes(a?.status);
const defaults = {
  database: pool, now: () => new Date(), encrypt: maybeEncryptNotePayload, decrypt: maybeDecryptNotePayload,
  appointment: async id => (await import('../models/Appointment.model.js')).default.findById(id),
  attendance: async a => (await import('./replacementBookingConfirmation.service.js')).replacementAttendanceDetails(a),
  participants: async id => (await import('../models/Appointment.model.js')).default.listParticipants(id),
  tenant: async id => (await import('./sessionNotification.service.js')).getTenantSettings(id),
  reviewedRecipientAllowed: async (...args) => (await import('./cancellationRecipients.service.js')).cancellationRecipients.permitted(...args),
  familyRecipients: async (...args) => (await import('./appointmentFamilyRecipients.service.js')).appointmentFamilyRecipients(...args),
  consent: async (...args) => (await import('./sessionNotification.service.js')).loadClientConsent(...args),
  preferences: async (...args) => (await import('./sessionNotification.service.js')).getClientPreferences(...args),
  log: async args => (await import('./appointmentReminder.service.js')).logCommunication(args),
  communication: async args => (await import('../models/UserCommunication.model.js')).default.create(args),
  updateCommunication: async (...args) => (await import('../models/UserCommunication.model.js')).default.updateDeliveryStatus(...args),
  sendEmail: async args => (await import('./scheduleNotificationEmail.service.js')).sendScheduleNotificationEmail(args),
  sendSms: async args => (await import('./vonage.service.js')).default.sendSms(args),
  smsSender: async args => (await import('./smsCompliance.service.js')).resolveRegisteredSmsSender(args),
  normalizePhone: async v => (await import('../models/PhoneNumber.model.js')).default.normalizePhone(v),
  followUp: async () => (await import('./cancellationFollowUp.service.js')).cancellationFollowUp,
  offers: async () => (await import('./appointmentReplacementOffer.service.js')).replacementOffers,
  cancellationMessage: async (...args) => (await import('./appointmentCancellationNotification.service.js')).buildCancellationNotification(...args),
  portal: async (agencyId, clientId, appointmentId) => {
    const agency = await (await import('../models/Agency.model.js')).default.findById(agencyId);
    return (await import('../utils/publicPortalUrl.js')).buildPublicAppUrl(agency,
      `guardian?panel=appointments&clientId=${clientId}&appointmentId=${appointmentId}`);
  }
};

/** One final update per client/provider after a quiet editing window. Every edit
 * and every transport result remains attached to all affected appointment records. */
export function createAppointmentScheduleNoticeService(overrides = {}) {
  const d = { ...defaults, ...overrides }, db = d.database;
  const decode = value => JSON.parse(d.decrypt(typeof value === 'string' ? value : JSON.stringify(value)));
  async function lock(key, fn) {
    if (d.lock) return d.lock(key, fn);
    const conn = await db.getConnection(); let acquired = false;
    try {
      const [[result]] = await conn.execute('SELECT GET_LOCK(?, 15) AS acquired', [`schedule_notice:${key}`]);
      acquired = Number(result?.acquired) === 1;
      if (!acquired) throw new Error('Schedule notification queue is busy; retry shortly.');
      return await fn();
    } finally { try { if (acquired) await conn.execute('SELECT RELEASE_LOCK(?)', [`schedule_notice:${key}`]); } finally { conn.release(); } }
  }
  const key = row => `${row.agency_id}:${row.provider_id}:${row.client_id}`;
  async function audit(row, status, message, extra = {}) {
    await d.log({ appointmentId: row.appointment_id, agencyId: row.agency_id, channel: extra.channel || 'in_app', kind: 'other',
      bodyPreview: message, createdByUserId: row.created_by_user_id,
      metadata: { scheduleNotice: true, scheduleNoticeId: row.id, clientId: row.client_id, deliveryStatus: status, body: message, ...extra } });
  }
  async function summary(appointmentId) {
    const [rows] = await db.execute('SELECT id,status,fire_at,payload_json FROM appointment_schedule_notices WHERE appointment_id=? ORDER BY id', [appointmentId]);
    const [deliveryRows] = await db.execute(`SELECT DISTINCT d.id,d.channel,d.status,d.error_message,d.sent_at,d.recipient_address,uc.opened_at,uc.delivered_at,n.client_id FROM appointment_schedule_notice_deliveries d JOIN appointment_schedule_notices n ON n.batch_id=d.batch_id LEFT JOIN user_communications uc ON uc.id=d.communication_id WHERE n.appointment_id=?`, [appointmentId]);
    return { pending: rows.filter(r => r.status === 'pending').length, suppressed: rows.filter(r => r.status === 'suppressed').length,
      warnings: rows.map(r=>r.payload_json && decode(r.payload_json).offerUnavailableReason).filter(Boolean),
      queuedUntil: rows.filter(r => r.status === 'pending').map(r => r.fire_at).at(-1) || null, deliveries: deliveryRows.map(r=>({id:r.id,source:'schedule_notice',channel:r.channel,status:r.status,reason:r.error_message,sentAt:r.sent_at,recipient:r.recipient_address,openedAt:r.opened_at,deliveredAt:r.delivered_at,clientId:r.client_id})),
      sent: deliveryRows.filter(r=>r.status==='sent').length, failed: deliveryRows.filter(r=>r.status==='failed').length, held: deliveryRows.filter(r=>['held','review','sending'].includes(r.status)).length, skipped: deliveryRows.filter(r=>r.status==='skipped').length };
  }
  async function queue(appointmentId, { eventType, before = null, facts = {}, actorUserId = null, channels = null, sendImmediately = false } = {}) {
    const a = await d.appointment(appointmentId);
    if (!a) return null;
    const providerId = Number(a.providerUserId) || 0;
    const retrospect = !futureAppointment(before || a, d.now());
    const suppressed = (retrospect && facts.reviewedDeferredCancellation !== true) || facts.notificationMode === 'none';
    const clientIds = [...new Set((await d.participants(a.id)).map(p => Number(p.clientId)).filter(Boolean))];
    const tenant = suppressed ? null : await d.tenant(a.agencyId);
    const allowedChannels = ['email', ...(tenant?.channelsEnabled?.sms === true && tenant?.changeNotify?.channels?.includes('sms') ? ['sms'] : [])]
      .filter(ch => !channels || channels.includes(ch));
    for (const clientId of clientIds) {
      const selectedContacts = facts.notificationRecipients?.find(c => Number(c.clientId) === clientId);
      if (facts.reviewedCancellation && !selectedContacts) throw Object.assign(new Error('Appointment recipients changed. Review the cancellation emails again.'), { status: 409 });
      const clientSuppressed = suppressed || selectedContacts?.mode === 'none';
      const group = { agency_id: a.agencyId, provider_id: providerId, client_id: clientId };
      await lock(key(group), async () => {
        if (eventType === 'created') {
          const [existing] = await db.execute("SELECT id FROM appointment_schedule_notices WHERE appointment_id=? AND client_id=? AND event_type='created' LIMIT 1", [a.id, clientId]);
          if (existing.length) return;
        }
        // Signed cancellation retries cannot create another invitation or notice.
        if (['canceled','rescheduled'].includes(eventType)) {
          const [existing] = await db.execute("SELECT id,status,payload_json FROM appointment_schedule_notices WHERE appointment_id=? AND client_id=? AND event_type IN ('canceled','rescheduled') LIMIT 1", [a.id, clientId]);
          if (existing.length) {
            const row = existing[0];
            // Only the signed deferred-email review can release an explicitly held notice.
            if (facts.reviewedDeferredCancellation === true && facts.reviewedCancellation === true
                && facts.notificationMode === 'send' && row.status === 'suppressed'
                && decode(row.payload_json).facts?.notificationMode === 'none') {
              const payload = { eventType, facts, originalStartAt: a.startAt, initialBooking: false };
              await db.execute("UPDATE appointment_schedule_notices SET status='pending',payload_json=?,channels_json=?,fire_at=?,created_by_user_id=? WHERE id=? AND status='suppressed'",
                [d.encrypt(JSON.stringify(payload)), JSON.stringify(allowedChannels.filter(ch => !selectedContacts || selectedContacts.channels.includes(ch))), sqlDate(d.now()), actorUserId, row.id]);
              await audit({ ...group, id: row.id, appointment_id: a.id, created_by_user_id: actorUserId }, 'pending', 'Deferred cancellation email reviewed and approved for sending.');
            }
            return;
          }
        }
        const [previous] = await db.execute("SELECT * FROM appointment_schedule_notices WHERE agency_id=? AND provider_id=? AND client_id=? AND status='pending' ORDER BY id", [a.agencyId, providerId, clientId]);
        const prior = previous.filter(r => Number(r.appointment_id) === Number(a.id)).at(-1);
        const priorPayload = prior ? decode(prior.payload_json) : null;
        const payload = { eventType, facts, originalStartAt: priorPayload?.originalStartAt || before?.startAt || a.startAt,
          initialBooking: eventType === 'created' || priorPayload?.initialBooking === true };
        if (!clientSuppressed && ['private_slots','portal_booking'].includes(facts.followUpAction)) {
          // Reserve private openings immediately, before their invitation is sent.
          try { await (await d.offers()).ensure(a, clientId, facts, actorUserId); }
          catch (e) {
            if (![400,409].includes(e.status)) throw e;
            payload.facts = { ...facts, followUpAction: 'keep_next_or_support' };
            payload.offerUnavailableReason = `Replacement times could not be secured: ${e.message}. The notice will keep the next appointment or direct the client to support.`;
          }
        }
        for (const row of previous.filter(r => Number(r.appointment_id) === Number(a.id))) {
          await db.execute("UPDATE appointment_schedule_notices SET status='superseded' WHERE id=? AND status='pending'", [row.id]);
          await audit(row, 'superseded', 'A later schedule edit replaced this queued notification.');
        }
        const firstQueuedAt = previous.length ? parseUtcDate(previous[0].created_at) : d.now();
        const familyCancellation = eventType === 'canceled' && ['guardian','client_guardian','client'].includes(facts.cancellationActorRole);
        let due = (sendImmediately || familyCancellation) ? d.now() : scheduleNoticeDeadline({ now: d.now(), firstQueuedAt,
          startAt: before?.startAt || a.startAt, bufferMinutes: tenant?.changeNotify?.bufferMinutes });
        // An imminent cancellation already queued for this client must not be delayed by a later booking.
        for (const row of previous) {
          const p = decode(row.payload_json);
          due = new Date(Math.min(+due, +scheduleNoticeDeadline({ now: d.now(), firstQueuedAt, startAt: p.originalStartAt })));
        }
        const state = clientSuppressed ? 'suppressed' : 'pending';
        const [insert] = await db.execute(`INSERT INTO appointment_schedule_notices
          (appointment_id,agency_id,provider_id,client_id,event_type,status,payload_json,channels_json,fire_at,created_by_user_id)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, [a.id,a.agencyId,providerId,clientId,eventType,state,d.encrypt(JSON.stringify(payload)),JSON.stringify(allowedChannels.filter(ch => !selectedContacts || selectedContacts.channels.includes(ch))),sqlDate(due),actorUserId]);
        if (!clientSuppressed) await db.execute("UPDATE appointment_schedule_notices SET fire_at=? WHERE agency_id=? AND provider_id=? AND client_id=? AND status='pending'", [sqlDate(due),a.agencyId,providerId,clientId]);
        const row = { ...group, id: insert.insertId, appointment_id: a.id, created_by_user_id: actorUserId };
        const explanation = retrospect ? 'Past appointment: record updated only. No cancellation notice, replacement offer, or rescheduling follow-up was sent.'
          : clientSuppressed ? 'Provider chose no email or text. See the signed cancellation record.'
            : 'Schedule update queued. Related edits for this client and provider will be combined; the final appointment details are checked before sending.';
        await audit(row, state, explanation, { scheduledFor: clientSuppressed ? null : due.toISOString() });
        if (payload.offerUnavailableReason) await audit(row, 'review', payload.offerUnavailableReason);
        if (clientSuppressed) await d.communication({ agencyId:a.agencyId,clientId,templateType:'session_change',channel:'in_app',
          subject:'Schedule record updated without notification',body:explanation,deliveryStatus:'skipped',generatedByUserId:actorUserId,metadata:{appointmentId:a.id,scheduleNoticeId:row.id} });
      });
    }
    // Old confirmation and provider-push queues must not race this single schedule update.
    await db.execute("UPDATE appointment_reminders SET status='canceled' WHERE appointment_id=? AND status='pending' AND kind='confirmation'", [a.id]);
    await db.execute("UPDATE appointment_change_notification_queue SET status='canceled',canceled_at=NOW() WHERE appointment_id=? AND status='pending'", [a.id]);
    return summary(a.id);
  }
  async function process(id) {
    const [[seed]] = await db.execute('SELECT * FROM appointment_schedule_notices WHERE id=?', [id]);
    if (!seed || seed.status !== 'pending') return;
    return lock(key(seed), async () => {
      const [allPending] = await db.execute("SELECT * FROM appointment_schedule_notices WHERE agency_id=? AND provider_id=? AND client_id=? AND status='pending' ORDER BY id", [seed.agency_id,seed.provider_id,seed.client_id]);
      // Reviewed correspondence stays scoped to its exact session and recipients.
      const reviewed = decode(seed.payload_json).facts?.reviewedCancellation;
      const pending = allPending.filter(r => reviewed ? Number(r.id) === Number(seed.id) : !decode(r.payload_json).facts?.reviewedCancellation);
      if (!pending.length || pending.some(r => +parseUtcDate(r.fire_at) > +d.now())) return;
      const entries = [];
      for (const row of pending) {
        const a = await d.appointment(row.appointment_id), payload = decode(row.payload_json);
        const linked = a && Number(a.agencyId) === Number(row.agency_id) && (await d.participants(a.id)).some(p => Number(p.clientId) === Number(row.client_id));
        if (!linked || (!active(a) && !canceled(a))) {
          await db.execute("UPDATE appointment_schedule_notices SET status='skipped' WHERE id=?", [row.id]);
          await audit(row,'skipped','Appointment or recipient is no longer eligible for this update.'); continue;
        }
        const portalUrl = await d.portal(a.agencyId,row.client_id,a.id);
        let cancellation;
        if (canceled(a)) {
          if (!['canceled','rescheduled'].includes(payload.eventType)) {
            await db.execute("UPDATE appointment_schedule_notices SET status='superseded' WHERE id=?", [row.id]);
            await audit(row,'superseded','Appointment was canceled; its cancellation workflow controls notification.'); continue;
          }
          const followUp = await d.followUp();
          const nextAppointment = await followUp.nextAppointment(a,row.client_id,{afterAt:payload.facts.followUpAfterAt || null,excludeAppointmentIds:payload.facts.followUpExcludedAppointmentIds || []});
          const offer = ['private_slots','portal_booking'].includes(payload.facts.followUpAction) ? await (await d.offers()).view(a.id,row.client_id) : null;
          let replacement = null;
          if (payload.facts.replacementAppointmentId) {
            const candidate = await d.appointment(payload.facts.replacementAppointmentId);
            if (candidate && Number(candidate.agencyId) === Number(a.agencyId) && active(candidate)
              && (await d.participants(candidate.id)).some(p => Number(p.clientId) === Number(row.client_id))) replacement = candidate;
          }
          cancellation = await d.cancellationMessage(a,payload.facts,{nextAppointment,offer:offer ? {...offer,expires_at:offer.expiresAt} : null,portalUrl,replacement});
        }
        if (payload.facts?.replacementForAppointmentId && active(a)) a.attendanceDetails = await d.attendance(a);
        entries.push({row,appointment:a,payload,cancellation});
      }
      if (!entries.length) return;
      const portalUrl = await d.portal(seed.agency_id,seed.client_id,entries[0].appointment.id);
      const message = buildScheduleNoticeMessage(entries,portalUrl);
      const channels = [...new Set(entries.flatMap(e => typeof e.row.channels_json === 'string' ? JSON.parse(e.row.channels_json) : e.row.channels_json || []))];
      const batchId = entries[0].row.id;
      for (const e of entries) {
        await db.execute("UPDATE appointment_schedule_notices SET status='sending',batch_id=? WHERE id=? AND status='pending'", [batchId,e.row.id]);
        await audit(e.row,'sending','Final schedule update prepared for delivery. Verify delivery status before resending.');
      }
      const selectedContacts = entries[0].payload.facts?.notificationRecipients?.find(c => Number(c.clientId) === Number(seed.client_id));
      const family = await d.familyRecipients(seed.client_id,seed.agency_id);
      const targets = selectedContacts ? selectedContacts.recipients : family.hasRelationships ? family.recipients : [null];
      const sentTargets = new Set();
      for (const target of targets) for (const channel of channels.length ? channels : ['in_app']) {
        let attempted = false, communication = null, recipient = null, externalId = null, status = 'failed', reason = null;
        const recipientMessage = buildScheduleNoticeMessage(entries,portalUrl,{recipientUserId:target?.userId || null});
        const body = channel === 'sms' ? recipientMessage.sms : recipientMessage.text;
        const [delivery] = await db.execute(`INSERT INTO appointment_schedule_notice_deliveries (batch_id,channel,message_json,recipient_key) VALUES (?,?,?,?)`, [batchId,channel,d.encrypt(JSON.stringify(recipientMessage)),target?.key || 'default']);
        try {
          const consent = await d.consent(seed.client_id,seed.agency_id,target?.userId || null);
          if (target && selectedContacts) { consent.emailAddress=target.email;consent.phoneNumber=target.phone; }
          const prefs = await d.preferences(seed.agency_id,seed.client_id,consent.guardianUserId);
          const tenant = await d.tenant(seed.agency_id);
          recipient = channel === 'sms' ? await d.normalizePhone(consent.phoneNumber) : consent.emailAddress;
          const targetKey = `${channel}:${recipient || target?.key || 'default'}`.toLowerCase();
          if (sentTargets.has(targetKey)) {
            await db.execute("UPDATE appointment_schedule_notice_deliveries SET status='skipped',error_message='Shared destination already processed' WHERE id=?",[delivery.insertId]);
            continue;
          }
          communication = await d.communication({agencyId:seed.agency_id,clientId:seed.client_id,userId:consent.guardianUserId || null,
            templateType:'session_change',channel,subject:recipientMessage.subject,body,recipientAddress:recipient,generatedByUserId:seed.created_by_user_id,
            metadata:{appointmentIds:entries.map(e=>e.appointment.id),scheduleNoticeBatchId:batchId},deliveryStatus:'pending'});
          const guardianAuthorized = !target?.userId || !family.hasRelationships || family.recipients.some(r => r.userId === Number(target.userId));
          const permitted = guardianAuthorized && (!target || !selectedContacts || await d.reviewedRecipientAllowed(seed.client_id,seed.agency_id,target,channel)) && channel !== 'in_app' && recipient && consent[channel] && prefs.schedulingChangesEnabled !== false && prefs.providerPushedUpdatesEnabled !== false
            && (prefs.isDefault || prefs.channels?.[channel] !== false)
            && (channel !== 'sms' || (tenant?.channelsEnabled?.sms === true && tenant?.changeNotify?.channels?.includes('sms')));
          if (!permitted) { status='skipped'; reason='No permitted contact channel. Review and follow up with the client through an approved channel.'; }
          else {
            sentTargets.add(targetKey);
            let result;
            if (channel === 'email') {
              attempted = true;
              result = await d.sendEmail({agencyId:seed.agency_id,clientId:seed.client_id,userId:consent.guardianUserId || null,to:recipient,
                entries,
                subject:recipientMessage.subject,text:recipientMessage.text,html:recipientMessage.html,triggerKey:'session_change',templateType:'session_change',
                generatedByUserId:seed.created_by_user_id,source:'auto',existingCommunicationId:communication.id});
            } else {
              const from = await d.smsSender({agencyId:seed.agency_id,purpose:'reminders'});
              if (!from) { status='held'; reason='No registered SMS sender. Review before contacting the client.'; }
              else { attempted=true; result=await d.sendSms({agencyId:seed.agency_id,clientId:seed.client_id,notificationCategory:'schedule_changes',purpose:'reminders',from,to:recipient,body}); }
            }
            if (result) {
              externalId = result.id || result.sid || result.messageId || result.messageUuid || result.messageUUID || null;
              status = externalId && !result.skipped && !result.blocked && !result.redirected && !result.pendingApproval && !result.queued ? 'sent' : 'held';
              if(result.reason==='school_session_email_opted_out') status='skipped';
              reason = status === 'sent' ? null : result.reason || 'Transport held the message. Review before resending.';
            } else if (attempted) { status='review'; reason='Transport did not confirm acceptance. Verify before resending.'; }
          }
        } catch (e) { status=attempted ? 'review' : 'failed'; reason=String(e?.message || 'Notification failed').slice(0,500); }
        const sentAt = status === 'sent' ? sqlDate(d.now()) : null;
        await db.execute('UPDATE appointment_schedule_notice_deliveries SET status=?,recipient_address=?,communication_id=?,external_message_id=?,error_message=?,sent_at=? WHERE id=?',
          [status,recipient,communication?.id || null,externalId,reason,sentAt,delivery.insertId]);
        if (communication?.id) await d.updateCommunication(communication.id,['review','held'].includes(status)?'failed':status,externalId,null,reason);
        for (const e of entries) await audit(e.row,status,body,{channel,subject:recipientMessage.subject,recipient,reason,sentAt,
          scheduleNoticeDeliveryId:delivery.insertId,communicationId:communication?.id || null,externalMessageId:externalId});
      }
      for (const e of entries) await db.execute("UPDATE appointment_schedule_notices SET status='processed' WHERE id=?",[e.row.id]);
    });
  }
  async function control(appointmentId, { cancel = false, sendImmediately = false } = {}) {
    const [rows]=await db.execute("SELECT * FROM appointment_schedule_notices WHERE appointment_id=? AND status='pending'",[appointmentId]);
    for(const seed of rows) {
      await lock(key(seed),async()=>{
        const [[row]]=await db.execute('SELECT * FROM appointment_schedule_notices WHERE id=?',[seed.id]);
        if(row?.status!=='pending')return;
        if(cancel){
          await db.execute("UPDATE appointment_schedule_notices SET status='suppressed' WHERE id=? AND status='pending'",[row.id]);
          await audit(row,'suppressed','Staff stopped this queued schedule notification.');
          await d.communication({agencyId:row.agency_id,clientId:row.client_id,channel:'in_app',templateType:'session_change',subject:'Schedule notice stopped',body:'Staff stopped the queued schedule notification.',deliveryStatus:'skipped',metadata:{appointmentId}});
        }else if(sendImmediately) await db.execute("UPDATE appointment_schedule_notices SET fire_at=? WHERE agency_id=? AND provider_id=? AND client_id=? AND status='pending'",[sqlDate(d.now()),row.agency_id,row.provider_id,row.client_id]);
      });
      if(sendImmediately && !cancel)await process(seed.id);
    }
    return {canceled:cancel};
  }
  async function processDue({limit=20, agencyId=null}={}) {
    const [rows] = await db.execute(`SELECT id FROM appointment_schedule_notices WHERE status='pending' AND fire_at<=UTC_TIMESTAMP() AND (? IS NULL OR agency_id=?) ORDER BY fire_at,id LIMIT ${Math.min(100,Math.max(1,Number(limit)||20))}`, [agencyId,agencyId]);
    let failed=0;
    for (const row of rows) { try { await process(row.id); } catch (e) { failed++; console.warn('[schedule-notice] delivery requires review',row.id,e.message); } }
    return {processed:rows.length,failed};
  }
  return {queue,process,processDue,summary,control};
}
export const appointmentScheduleNotices = createAppointmentScheduleNoticeService();
