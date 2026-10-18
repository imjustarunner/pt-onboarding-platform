import crypto from 'node:crypto';
import { pool, seal, open, get, list, audit } from './repository.js';
import { fail, hash, requirePhi, requireCapability } from './policy.js';
import { patientAccess } from './clinical.js';
import { platformIntegrations } from './platformIntegrations.js';
import { assertVideoWindow } from './integrationPolicy.js';
import { createGoogleSession, retireGoogleSession } from './sessionTransports.js';

export const videoContext = (ctx, id, provider) => `auricwell:video:${ctx.practiceId}:${id}:${provider}`;
export const appointmentVersion = a => hash(JSON.stringify([a.patientId, a.data.providerAccountId, a.data.start, a.data.end, a.data.modality]));
const roomLock = (practiceId, appointmentId) => `aw-video-${hash(`${practiceId}:${appointmentId}`).slice(0, 40)}`;
async function retireRoom(ctx, row, db, adapters = {}) {
  if (row.retired_at) return;
  const room = open(row.payload, videoContext(ctx, row.appointment_id, row.provider));
  if (row.provider === 'google_meet') await (adapters.retireGoogleSession || retireGoogleSession)(room);
  await db.execute('UPDATE auricwell_appointment_video SET retired_at=UTC_TIMESTAMP(3),guest_token_hash=NULL WHERE practice_id=? AND appointment_id=? AND provider=?', [ctx.practiceId, row.appointment_id, row.provider]);
}
export async function requireTelehealthConsent(ctx, appointment) {
  if (!(await list(ctx, 'agreement', { patientId: appointment.patientId })).some(a => a.data.type === 'telehealth_consent' && a.data.status === 'completed'))
    throw fail(409, 'Complete the practice telehealth consent before joining a video visit.');
}
async function requireActiveProvider(ctx, appointment, db = pool) {
  const [[member]] = await db.execute(`SELECT a.id FROM auricwell_accounts a JOIN auricwell_memberships m ON m.account_id=a.id
    WHERE a.id=? AND m.practice_id=? AND m.actor_type='staff' AND m.status='active' AND a.status='active'`, [appointment.data.providerAccountId, ctx.practiceId]);
  if (!member) throw fail(409, 'The assigned provider is not available for this session. Contact your practice.');
}
export async function ensureAppointmentVideo(ctx, appointment, settings, adapters = {}) {
  if (settings.videoProvider === 'disabled') throw fail(409, 'Virtual appointments are turned off by the platform.');
  requirePhi(ctx);
  requireCapability(ctx, 'video');
  const version = appointmentVersion(appointment);
  // One connection owns the lock for the entire external creation. Retries and
  // simultaneous provider/client joins reuse the persisted room, not new rooms.
  const db = await pool.getConnection();
  const lock = roomLock(ctx.practiceId, appointment.id);
  try {
    const [[r]] = await db.execute('SELECT GET_LOCK(?,20) acquired', [lock]);
    if (Number(r.acquired) !== 1) throw fail(409, 'The session is being prepared. Try again shortly.');
    const current = await get(ctx, 'appointment', appointment.id, db);
    if (appointmentVersion(current) !== version || !['scheduled', 'confirmed'].includes(current.data.status))
      throw fail(409, 'This appointment changed. Refresh before joining.');
    await requireActiveProvider(ctx, current, db);
    const [rows] = await db.execute('SELECT * FROM auricwell_appointment_video WHERE practice_id=? AND appointment_id=? ORDER BY created_at DESC', [ctx.practiceId, appointment.id]);
    for (const row of rows) {
      const data = open(row.payload, videoContext(ctx, appointment.id, row.provider));
      // Existing appointments keep the video destination already emailed to the client.
      if (data.version === version && !row.retired_at) return { ...data, provider: row.provider };
      await retireRoom(ctx, row, db, adapters);
    }
    let data;
    if (settings.videoProvider === 'google_meet') {
      data = await (adapters.createGoogleSession || createGoogleSession)(settings.googleOrganizer);
    } else {
      if (process.env.VONAGE_CLINICAL_VIDEO_APPROVED !== 'true') throw fail(409, 'Vonage clinical video readiness has not been enabled.');
      const { default: Video } = await import('../vonageVideo.service.js');
      const result = await Video.createSession();
      data = { sessionId: typeof result === 'string' ? result : result.sessionId };
    }
    const guestToken = crypto.randomBytes(32).toString('hex');
    data = { ...data, version, guestToken, provider: settings.videoProvider };
    await db.execute(`INSERT INTO auricwell_appointment_video (practice_id,appointment_id,provider,payload,guest_token_hash)
      VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload),guest_token_hash=VALUES(guest_token_hash),retired_at=NULL,created_at=UTC_TIMESTAMP(3)`,
      [ctx.practiceId, appointment.id, data.provider, seal(data, videoContext(ctx, appointment.id, data.provider)), hash(guestToken)]);
    await audit(ctx, 'appointment.video_prepared', appointment.id, { provider: data.provider }, db);
    return data;
  } finally {
    await db.execute('SELECT RELEASE_LOCK(?)', [lock]).catch(() => {});
    db.release();
  }
}
export function clientVideoLink(room) {
  if (room.provider === 'google_meet') return room.url;
  return `${process.env.AURICWELL_PUBLIC_ORIGIN || 'https://auricwell.com'}/join/session#token=${room.guestToken}`;
}
async function videoResponse(room, actor, appointment) {
  if (room.provider === 'google_meet') return { provider: 'google_meet', url: room.url };
  if (process.env.VONAGE_CLINICAL_VIDEO_APPROVED !== 'true') throw fail(409, 'Vonage clinical video readiness has not been enabled.');
  const { default: Video, resolveVideoProjectId } = await import('../vonageVideo.service.js');
  return { provider: 'vonage', apiKey: resolveVideoProjectId(), sessionId: room.sessionId,
    token: Video.generateToken(room.sessionId, { role: 'publisher', expireTime: Math.floor(Math.min(Date.now() + 3600000, Date.parse(appointment.data.end) + 30 * 60000) / 1000), data: actor }) };
}
export async function joinAppointmentVideo(ctx, id) {
  requirePhi(ctx);
  requireCapability(ctx, 'video');
  const appointment = await get(ctx, 'appointment', id);
  // Providers use their authenticated account; practice admins cannot obtain a
  // clinical room URL simply because they can administer appointments.
  if (ctx.actorType === 'staff' && (appointment.data.providerAccountId !== ctx.accountId || !ctx.permissions.includes('clinical')))
    throw fail(403, 'Only the assigned provider can join this session.');
  await patientAccess(ctx, appointment.patientId);
  assertVideoWindow(appointment);
  await requireTelehealthConsent(ctx, appointment);
  const { settings } = await platformIntegrations();
  const room = await ensureAppointmentVideo(ctx, appointment, settings);
  await audit(ctx, 'appointment.video_joined', id, { provider: room.provider });
  return videoResponse(room, `account=${ctx.accountId}`, appointment);
}
export async function joinGuestVideo(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) throw fail(404, 'This appointment link is unavailable.');
  const [[row]] = await pool.execute(`SELECT v.*,p.settings,p.slug,p.status practice_status FROM auricwell_appointment_video v
    JOIN auricwell_practices p ON p.id=v.practice_id WHERE v.guest_token_hash=?`, [hash(token)]);
  if (!row || row.practice_status !== 'active') throw fail(404, 'This appointment link is unavailable.');
  const ctx = { practiceId: row.practice_id, settings: open(row.settings, `auricwell:practice:${row.practice_id}`) };
  ctx.settings.capabilities.video = (await platformIntegrations()).settings.videoProvider !== 'disabled';
  requirePhi(ctx); requireCapability(ctx, 'video');
  const appointment = await get(ctx, 'appointment', row.appointment_id);
  await requireActiveProvider(ctx, appointment);
  assertVideoWindow(appointment);
  await requireTelehealthConsent(ctx, appointment);
  const room = open(row.payload, videoContext(ctx, appointment.id, row.provider));
  if (room.version !== appointmentVersion(appointment) || (await platformIntegrations()).settings.videoProvider === 'disabled')
    throw fail(409, 'This appointment link changed. Use the most recent reminder.');
  return videoResponse({ ...room, provider: row.provider }, 'patient', appointment);
}

export async function retireUnusedSessionRooms(settings, adapters = {}) {
  const [candidates] = await pool.execute(`SELECT v.practice_id,v.appointment_id,v.provider,p.status practice_status
    FROM auricwell_appointment_video v JOIN auricwell_practices p ON p.id=v.practice_id WHERE v.retired_at IS NULL`);
  for (const candidate of candidates) {
    const db = await pool.getConnection();
    const lock = roomLock(candidate.practice_id, candidate.appointment_id);
    try {
      const [[held]] = await db.execute('SELECT GET_LOCK(?,0) acquired', [lock]);
      if (Number(held.acquired) !== 1) continue;
      const [[row]] = await db.execute('SELECT * FROM auricwell_appointment_video WHERE practice_id=? AND appointment_id=? AND provider=? AND retired_at IS NULL', [candidate.practice_id, candidate.appointment_id, candidate.provider]);
      if (!row) continue;
      const ctx = { practiceId: row.practice_id };
      let appointment;
      try { appointment = await get(ctx, 'appointment', row.appointment_id, db); }
      catch(e) { if (![404, 409].includes(e.status)) throw e; }
      const room = open(row.payload, videoContext(ctx, row.appointment_id, row.provider));
      if (settings.videoProvider === 'disabled' || candidate.practice_status !== 'active' || !appointment
        || appointmentVersion(appointment) !== room.version || !['scheduled', 'confirmed'].includes(appointment.data.status)
        || Date.now() > Date.parse(appointment.data.end) + 30 * 60000)
        await retireRoom(ctx, row, db, adapters);
    } catch { /* Keep the room pending retirement for the next worker tick. Never log URLs. */ }
    finally { await db.execute('SELECT RELEASE_LOCK(?)', [lock]).catch(() => {}); db.release(); }
  }
}
