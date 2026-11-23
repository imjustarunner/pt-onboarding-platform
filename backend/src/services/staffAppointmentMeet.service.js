import pool from '../config/database.js';
import User from '../models/User.model.js';
import Appointment from '../models/Appointment.model.js';
import { appointmentHasStarted } from '../utils/appointmentVideoPolicy.js';
import { googleSpaceConference } from '../utils/googleMeetingConference.js';
import { createGoogleSession, readGoogleSession, retireGoogleSession } from './auricwell/sessionTransports.js';
import { managedDomain } from './managedWorkspaceGroupPolicy.js';
import { usesGoogleSchedule } from './scheduleCalendarPolicy.service.js';

const activeStatuses = ['scheduled', 'confirmed', 'client_confirmed', 'in_progress'];
const meetingCode = url => /^https:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})$/.exec(String(url || ''))?.[1];
const conflict = message => Object.assign(new Error(message), { status: 409 });

async function providerMeetOrganizer(providerUserId, agencyId, db) {
  const provider = await User.findById(providerUserId);
  if (!provider) return null;
  if (await usesGoogleSchedule(provider)) return provider.email;
  const [[agency]] = await db.execute(
    'SELECT id, slug, is_active, organization_type, feature_flags FROM agencies WHERE id = ?', [agencyId]);
  const domain = agency && managedDomain(agency);
  const workEmail = String(provider.work_email || '').trim().toLowerCase();
  return domain && !Number(provider.login_is_group_email) && workEmail.endsWith(`@${domain}`) ? workEmail : null;
}

// The booking endpoint and a staff retry share the same lock. The retry route
// can pass its already locked connection.
export async function prepareStaffAppointmentMeet(appointment, lockedConnection = null) {
  const db = lockedConnection || await pool.getConnection();
  const lockName = `counseling_appointment:${appointment.id}`;
  let acquired = false;
  try {
    if (!lockedConnection) {
      const [[result]] = await db.execute('SELECT GET_LOCK(?, 8) AS acquired', [lockName]);
      acquired = Number(result?.acquired) === 1;
      if (!acquired) throw conflict('The meeting link is being prepared. Try again shortly.');
    }
    const current = await Appointment.findById(appointment.id, { executor: db });
    if (current?.videoRoomMode !== 'google_meet'
      || Number(current.providerUserId) !== Number(appointment.providerUserId)
      || Number(current.agencyId) !== Number(appointment.agencyId)
      || !activeStatuses.includes(current.status) || appointmentHasStarted(current.endAt)) {
      throw conflict('This appointment cannot open a Google Meet link.');
    }
    const existingUrl = await savedStaffAppointmentMeet(current, db);
    if (existingUrl) return existingUrl;
    const organizer = await providerMeetOrganizer(current.providerUserId, current.agencyId, db);
    if (!organizer) {
      throw conflict('Google Meet is unavailable for this provider’s workspace.');
    }
    const room = await createGoogleSession(organizer, { privateAccess: true });
    try {
      const [updated] = await db.execute(
        `UPDATE appointments SET private_meet_url = ?
         WHERE id = ? AND agency_id = ? AND provider_user_id = ?
           AND private_meet_url IS NULL
           AND video_room_mode = 'google_meet'
           AND status IN ('scheduled', 'confirmed', 'client_confirmed', 'in_progress')`,
        [room.url, current.id, current.agencyId, current.providerUserId]);
      if (!updated.affectedRows) throw conflict('The appointment changed while the link was being created.');
    } catch (error) {
      await retireGoogleSession(room).catch(() => {});
      throw error;
    }
    return room.url;
  } finally {
    if (!lockedConnection) {
      try { if (acquired) await db.execute('SELECT RELEASE_LOCK(?)', [lockName]); }
      finally { db.release(); }
    }
  }
}

export async function savedStaffAppointmentMeet(appointment, db = pool) {
  if (appointment?.videoRoomMode !== 'google_meet' || !activeStatuses.includes(appointment.status)) return null;
  const [[row]] = await db.execute(
    `SELECT private_meet_url FROM appointments WHERE id = ? AND agency_id = ? AND provider_user_id = ?
     AND video_room_mode = 'google_meet' AND status IN ('scheduled', 'confirmed', 'client_confirmed', 'in_progress')`,
    [appointment.id, appointment.agencyId, appointment.providerUserId]);
  return meetingCode(row?.private_meet_url) ? row.private_meet_url : null;
}

export async function readStaffAppointmentMeetConference(appointment, meetLink) {
  const code = meetingCode(meetLink);
  if (!code) return { status: 'not_verified', phones: [] };
  try {
    const organizer = await providerMeetOrganizer(appointment.providerUserId, appointment.agencyId, pool);
    if (!organizer) return { status: 'not_verified', phones: [] };
    const data = await readGoogleSession({ organizer, meetingCode: code });
    return googleSpaceConference(data, meetLink);
  } catch {
    return { status: 'not_verified', phones: [] };
  }
}
