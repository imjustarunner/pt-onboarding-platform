import pool from '../config/database.js';
import { parseMeetingSettings } from './meetingSettingsPolicy.js';

/** Enable populated content without replacing concurrent settings or changing other meeting options. */
export async function enableMeetingContentSettings(meetingType, meeting, content) {
  const table = { provider_schedule_event: 'provider_schedule_events', supervision_session: 'supervision_sessions' }[meetingType];
  if (!table || !meeting?.id) return;
  const sections = ['agenda', 'goals', 'actionItems'].filter(key => Array.isArray(content[key])
    && content[key].some(item => typeof (item?.text ?? item?.title) === 'string' && (item.text ?? item.title).trim()));
  if (!sections.length) return;
  // Legacy meetings with no options already display content. Preserve their existing defaults.
  if (meeting.meeting_settings_json == null) return;
  const settings = parseMeetingSettings(meeting.meeting_settings_json);
  const disabled = sections.filter(key => settings[key] === false);
  if (!disabled.length) return;
  const paths = disabled.map(key => `'$.${key}', JSON_EXTRACT('true', '$')`).join(', ');
  await pool.execute(`UPDATE ${table} SET meeting_settings_json=JSON_SET(COALESCE(meeting_settings_json,JSON_OBJECT()), ${paths}) WHERE id=?`, [meeting.id]);
  meeting.meeting_settings_json = { ...settings, ...Object.fromEntries(disabled.map(key => [key, true])) };
}
