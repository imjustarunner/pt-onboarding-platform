import { parseMeetingSettings } from './meetingSettingsPolicy.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export const INVITATION_SNOOZE_MS = 12 * 60 * 60 * 1000;

// Existing trainings close at their start time unless an earlier deadline is configured.
export function trainingRegistrationClosesAt(event) {
  const start = parseUtcDate(event.registration_start_at ?? event.start_at ?? event.startAt);
  const configured = parseUtcDate(parseMeetingSettings(event.meeting_settings_json).registrationClosesAt);
  const deadline = configured && (!start || configured < start) ? configured : start;
  return deadline && Number.isFinite(deadline.getTime()) ? deadline.toISOString() : null;
}

export function invitationSnoozedUntil(prompt, now = new Date()) {
  const deadline = Date.parse(prompt.registrationClosesAt || prompt.signupClosesAt || prompt.startAt);
  const cutoff = deadline - INVITATION_SNOOZE_MS;
  if (!Number.isFinite(cutoff) || now.getTime() >= cutoff) return null;
  return new Date(Math.min(now.getTime() + INVITATION_SNOOZE_MS, cutoff));
}
