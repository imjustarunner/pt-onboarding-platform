import pool from '../config/database.js';
export function replaceMeetingSpeakerNames(transcript, people) {
  const names = new Map(people.flatMap(person => [person.email, person.work_email].filter(Boolean)
    .map(email => [String(email).trim().toLowerCase(), person.name])));
  return String(transcript || '').replace(/^\[([^\]\n]+)\]/gm, (label, speaker) => {
    const name = names.get(speaker.trim().toLowerCase());
    return name ? `[${name}]` : label;
  });
}
export async function teamMeetingSpeakerNames(eventId, transcript) {
  if (!/^\[[^\]\n]*@[^\]\n]*\]/m.test(String(transcript || ''))) return transcript || '';
  const [people] = await pool.execute(`SELECT u.email,u.work_email,
    CONCAT_WS(' ',COALESCE(NULLIF(u.preferred_name,''),u.first_name),u.last_name) name
    FROM users u WHERE EXISTS(SELECT 1 FROM provider_schedule_events e WHERE e.id=? AND e.provider_id=u.id)
    OR EXISTS(SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=? AND a.user_id=u.id)`, [eventId,eventId]);
  return replaceMeetingSpeakerNames(transcript, people);
}
