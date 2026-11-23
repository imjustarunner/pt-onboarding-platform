import pool from '../config/database.js';
import { MEETING_TYPES, meetingTypeForEvent, defaultMeetingSettings, normalizeMeetingSettings, parseMeetingSettings } from './meetingSettingsPolicy.js';
export async function meetingTypesForAgency(agencyId) {
  const [rows] = await pool.execute('SELECT type_key,settings_json FROM agency_meeting_types WHERE agency_id=?',[agencyId]);
  return Object.entries(MEETING_TYPES).map(([key,label]) => {
    const settings = normalizeMeetingSettings(rows.find(r=>r.type_key===key)?.settings_json,defaultMeetingSettings(key));
    if (key === 'interview') settings.compensation = true;
    return { key, label, settings };
  });
}
export async function saveEventMeetingSettings(event, input) {
  const type = meetingTypeForEvent(event);
  const types = await meetingTypesForAgency(event.agency_id);
  const defaults = event.meeting_settings_json && input !== null ? normalizeMeetingSettings(event.meeting_settings_json,defaultMeetingSettings(type)) : types.find(t=>t.key===type)?.settings;
  const settings = normalizeMeetingSettings(input,defaults || defaultMeetingSettings(type));
  if (type === 'interview') settings.compensation = true;
  await pool.execute('UPDATE provider_schedule_events SET meeting_settings_json=?,attendance_tracking_enabled=? WHERE id=?',[JSON.stringify(settings),Number(settings.attendance),event.id]);
  event.meeting_settings_json = settings;
  event.attendance_tracking_enabled = Number(settings.attendance);
  return settings;
}
export function eventMeetingSettings(event) {
  // Legacy meetings retain their explicit transcription choice until edited.
  if (!event.meeting_settings_json) return null;
  const type = meetingTypeForEvent(event);
  const settings = normalizeMeetingSettings(event.meeting_settings_json,defaultMeetingSettings(type));
  // Earlier interview defaults incorrectly disabled eligible staff time.
  // Actual attendance, salary coverage and assigned rates decide compensation.
  if (type === 'interview') settings.compensation = true;
  return settings;
}

export async function assertMeetingCompensationSetting({agencyId,existing=null,type='general',input,role}) {
  if ((existing?.meeting_subtype === 'interview' || type === 'interview') && input?.compensation === false) {
    throw Object.assign(new Error('Interview staff time is evaluated from recorded attendance, salary coverage and assigned rates.'), { status: 400 });
  }
  if (['admin','super_admin','superadmin'].includes(role) || input?.compensation === undefined) return;
  const approved = existing?.meeting_settings_json
    ? eventMeetingSettings(existing)
    : (await meetingTypesForAgency(agencyId)).find(t=>t.key===type)?.settings;
  if (input.compensation !== approved?.compensation) {
    throw Object.assign(new Error('Only administrators can change meeting compensation settings.'),{status:403});
  }
}
