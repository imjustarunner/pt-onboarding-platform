import pool from '../config/database.js';
import { MEETING_TYPES, defaultMeetingSettings, normalizeMeetingSettings, parseMeetingSettings } from './meetingSettingsPolicy.js';
export async function meetingTypesForAgency(agencyId) {
  const [rows] = await pool.execute('SELECT type_key,settings_json FROM agency_meeting_types WHERE agency_id=?',[agencyId]);
  return Object.entries(MEETING_TYPES).map(([key,label]) => ({ key,label,settings: normalizeMeetingSettings(rows.find(r=>r.type_key===key)?.settings_json,defaultMeetingSettings(key)) }));
}
export async function saveEventMeetingSettings(event, input) {
  const type = event.kind === 'HUDDLE' ? 'huddle' : event.meeting_subtype || 'general';
  const types = await meetingTypesForAgency(event.agency_id);
  const defaults = event.meeting_settings_json && input !== null ? normalizeMeetingSettings(event.meeting_settings_json,defaultMeetingSettings(type)) : types.find(t=>t.key===type)?.settings;
  const settings = normalizeMeetingSettings(input,defaults || defaultMeetingSettings(type));
  await pool.execute('UPDATE provider_schedule_events SET meeting_settings_json=?,attendance_tracking_enabled=? WHERE id=?',[JSON.stringify(settings),Number(settings.attendance),event.id]);
  event.meeting_settings_json = settings;
  event.attendance_tracking_enabled = Number(settings.attendance);
  return settings;
}
export function eventMeetingSettings(event) {
  // Legacy meetings retain their explicit transcription choice until edited.
  return event.meeting_settings_json ? normalizeMeetingSettings(event.meeting_settings_json,defaultMeetingSettings(event.meeting_subtype)) : null;
}

export async function assertMeetingCompensationSetting({agencyId,existing=null,type='general',input,role}) {
  if (['admin','super_admin','superadmin'].includes(role) || input?.compensation === undefined) return;
  const approved = existing?.meeting_settings_json
    ? eventMeetingSettings(existing)
    : (await meetingTypesForAgency(agencyId)).find(t=>t.key===type)?.settings;
  if (input.compensation !== approved?.compensation) {
    throw Object.assign(new Error('Only administrators can change meeting compensation settings.'),{status:403});
  }
}
