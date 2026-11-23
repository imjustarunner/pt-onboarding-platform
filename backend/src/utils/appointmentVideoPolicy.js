import { parseUtcDate } from './officeEventDateTime.util.js';

const virtual = new Set(['TELEHEALTH', 'VIRTUAL', 'VIDEO', 'ONLINE']);

export function appointmentVideoRoomMode({ modality, businessType, videoRoomMode, clinicalBooking = false }) {
  if (clinicalBooking && virtual.has(String(modality).toUpperCase())) return 'google_meet';
  if (videoRoomMode === 'none') return 'none';
  if (virtual.has(String(modality).toUpperCase()) && !['learning', 'tutoring'].includes(String(businessType || '').toLowerCase())) {
    return videoRoomMode === 'google_meet' ? 'google_meet' : 'unique_session';
  }
  return ['my_room', 'external'].includes(videoRoomMode) ? videoRoomMode : 'unique_session';
}

export function appointmentHasStarted(startAt, now = Date.now()) {
  const start = parseUtcDate(startAt);
  return !!start && +start <= +now;
}
