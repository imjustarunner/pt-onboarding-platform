import crypto from 'node:crypto';
import { pool, seal, open, list, get, findSource, create, update, audit } from './repository.js';
import { fail, hash, has, requirePhi } from './policy.js';
import { patientAccess } from './clinical.js';
import { platformIntegrations } from './platformIntegrations.js';
import { ensureAppointmentVideo, clientVideoLink, appointmentVersion, requireTelehealthConsent, retireUnusedSessionRooms } from './appointmentVideo.js';
import { queuePatientSms, patientSmsCategoryEnabled, clientSmsPreferences, saveClientSmsPreferences } from './clientMessaging.js';

// Preserve existing API URLs while using one authoritative preference model.
export const sessionPreferences = clientSmsPreferences;
export const saveSessionPreferences = saveClientSmsPreferences;
export function reminderKinds(appointment, now = Date.now()) {
  if (!['scheduled', 'confirmed'].includes(appointment.data.status)) return [];
  const remaining = Date.parse(appointment.data.start) - now;
  if (remaining <= 0 || remaining > 30 * 86400000) return [];
  // A late booking sends one message, not confirmation + both reminder windows.
  return [remaining <= 3600000 ? 'one_hour' : remaining <= 86400000 ? 'one_day' : 'confirmation'];
}
export function deliveryKey(appointment, kind, channel, recipient, room) {
  return hash(JSON.stringify([appointmentVersion(appointment), kind, channel, recipient, room?.provider, room?.version]));
}
async function sendEmail(ctx, to, text) {
  const { default: Email } = await import('../email.service.js');
  const result = await Email.sendEmail({ to, subject: 'Your upcoming appointment', text,
    agencyId: ctx.agencyId, fromName: ctx.practiceName || 'AuricWell', source: 'auto', templateType: 'auricwell_session_reminder' });
  if (!result?.id || result.skipped || result.blocked || result.redirected || result.queued)
    throw fail(503, 'Email was not confirmed as sent.');
  return { provider: 'email', status: 'submitted', id: result.id };
}
export async function deliverAppointment(ctx, appointment, settings, deps = {}) {
  const remaining = Date.parse(appointment.data.start) - (deps.now || Date.now());
  if (!['scheduled','confirmed'].includes(appointment.data.status) || remaining <= 0 || remaining > 30 * 86400000 || !ctx.settings.phiActivatedAt) return;
  const video = appointment.data.modality === 'video';
  if (video && (!ctx.settings.capabilities?.video || settings.videoProvider === 'disabled')) return;
  if (video) await requireTelehealthConsent(ctx, appointment);
  const patient = await get(ctx, 'patient', appointment.patientId);
  const prefs = await findSource(ctx, 'session_preferences', patient.id);
  const kind = remaining <= 3600000 ? 'one_hour' : remaining <= 86400000 ? 'one_day' : 'confirmation';
  const when = new Intl.DateTimeFormat('en-US', { timeZone: ctx.settings.timezone || 'America/Denver', dateStyle: 'full', timeStyle: 'short' }).format(new Date(appointment.data.start));
  const source = { kind: 'appointment', id: appointment.id, start: appointment.data.start, end: appointment.data.end, providerAccountId: appointment.data.providerAccountId };
  const current = await get(ctx, 'appointment', appointment.id);
  if (appointmentVersion(current) !== appointmentVersion(appointment)) return;
  await queuePatientSms(ctx, patient.id, { category: 'reminders', key: `appointment:${appointment.id}:${appointmentVersion(appointment)}:${kind}`,
    body: `${ctx.practiceName || 'AuricWell'}: Your appointment is ${when}. Reply Y to confirm attendance.`, source,
    expiresAt: Date.parse(appointment.data.start) - (kind === 'confirmation' ? 86400000 : kind === 'one_day' ? 3600000 : 0) });
  // Session access is independent of appointment reminder preferences.
  let room = null;
  if (video && remaining <= 5 * 60000 && await patientSmsCategoryEnabled(ctx, patient.id, 'links')) {
    room = await ensureAppointmentVideo(ctx, appointment, settings, deps);
    await queuePatientSms(ctx, patient.id, { category: 'links', key: `session-link:${appointment.id}:${appointmentVersion(appointment)}`,
      body: `${ctx.practiceName || 'AuricWell'}: Your virtual appointment starts shortly. Join here: ${clientVideoLink(room)}`, source,
      expiresAt: Date.parse(appointment.data.start) + 10 * 60000 });
  }
  if (!settings.emailReminders || prefs?.data.emailEnabled === false || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patient.data.email || '')) return;
  room ||= video ? await ensureAppointmentVideo(ctx, appointment, settings, deps) : null;
  const body = `${ctx.practiceName || 'AuricWell'}: Your ${video ? 'virtual ' : ''}appointment is ${when}.${video ? ` Join your session: ${clientVideoLink(room)}` : ''}`;
  const id = crypto.randomUUID(), key = deliveryKey(appointment, kind, 'email', patient.data.email, room);
  const [claim] = await pool.execute(`INSERT IGNORE INTO auricwell_session_deliveries (id,practice_id,appointment_id,delivery_key,channel,status)
    VALUES (?,?,?,?,?,'sending')`, [id, ctx.practiceId, appointment.id, key, 'email']);
  if (!claim.affectedRows) return;
  try {
    const fresh = await get(ctx, 'appointment', appointment.id);
    if (appointmentVersion(fresh) !== appointmentVersion(appointment) || !['scheduled','confirmed'].includes(fresh.data.status)) {
      await pool.execute("UPDATE auricwell_session_deliveries SET status='cancelled',updated_at=UTC_TIMESTAMP(3) WHERE id=?", [id]); return;
    }
    const receipt = await (deps.sendEmail || sendEmail)(ctx, patient.data.email, `${body}\n\n${video ? 'Use Chrome for your video visit. Keep this appointment link private.\n' : ''}For scheduling changes, contact your practice.`);
    await pool.execute("UPDATE auricwell_session_deliveries SET status='submitted',payload=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?", [seal(receipt, `auricwell:delivery:${id}`), id]);
  } catch {
    await pool.execute("UPDATE auricwell_session_deliveries SET status='needs_review',updated_at=UTC_TIMESTAMP(3) WHERE id=?", [id]);
  }
}

export async function sessionDeliveryStatus(ctx, appointmentId) {
  const appointment = await get(ctx, 'appointment', appointmentId);
  await patientAccess(ctx, appointment.patientId);
  if (ctx.actorType !== 'staff' || (!has(ctx, 'schedule') && appointment.data.providerAccountId !== ctx.accountId)) throw fail(403, 'Scheduling access required.');
  const [rows] = await pool.execute('SELECT id,channel,status,created_at,updated_at FROM auricwell_session_deliveries WHERE practice_id=? AND appointment_id=? ORDER BY created_at DESC', [ctx.practiceId, appointmentId]);
  return rows;
}
export async function retrySessionDelivery(ctx, appointmentId, id, confirmedNotSent) {
  if (confirmedNotSent !== true) throw fail(400, 'Verify in the email/SMS account that this message was not sent before retrying.');
  await sessionDeliveryStatus(ctx, appointmentId);
  const [r] = await pool.execute("DELETE FROM auricwell_session_deliveries WHERE id=? AND practice_id=? AND appointment_id=? AND (status='needs_review' OR (status='sending' AND updated_at < UTC_TIMESTAMP(3) - INTERVAL 5 MINUTE))", [id, ctx.practiceId, appointmentId]);
  if (!r.affectedRows) throw fail(409, 'This delivery is not awaiting review. Allow five minutes for an in-progress send to finish.');
  await audit(ctx, 'appointment.delivery_retry_authorized', appointmentId, { deliveryId: id });
  return { queued: true };
}
export async function runSessionReminders() {
  if (process.env.AURICWELL_ENABLED !== 'true') return;
  const { settings } = await platformIntegrations();
  await retireUnusedSessionRooms(settings);
  if (!settings.emailReminders && settings.smsProvider === 'disabled' && !settings.clientMessaging?.routes?.length) return;
  const [practices] = await pool.execute("SELECT * FROM auricwell_practices WHERE product='auricwell_ehr' AND status='active'");
  for (const p of practices) {
    try {
    const ctx = { practiceId: p.id, practiceName: p.name, slug: p.slug, agencyId: p.agency_id,
      settings: open(p.settings, `auricwell:practice:${p.id}`), actorType: 'staff', permissions: ['clinical', 'schedule'] };
    ctx.settings.capabilities.video = settings.videoProvider !== 'disabled';
    if (!ctx.settings.phiActivatedAt) continue;
    for (const appointment of await list(ctx, 'appointment', { limit: 10000 })) {
      if (!reminderKinds(appointment).length) continue;
      const [[member]] = await pool.execute(`SELECT a.id FROM auricwell_accounts a JOIN auricwell_memberships m ON m.account_id=a.id
        WHERE a.id=? AND m.practice_id=? AND m.actor_type='staff' AND m.status='active' AND a.status='active'`, [appointment.data.providerAccountId, p.id]);
      if (!member) continue;
      try { await deliverAppointment({ ...ctx, accountId: member.id }, appointment, settings); }
      catch { /* The next tick retries preparation; delivery outcomes stay in the delivery table. No URLs or PHI in logs. */ }
    }
    } catch { /* One unavailable practice must not prevent other practices' reminders. */ }
  }
}
