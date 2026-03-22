/**
 * Shared persistence for skills_group_meetings (school portal + event portal).
 */
const allowedWeekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function normalizeSkillsGroupMeetingWeekday(d) {
  const s = String(d || '').trim();
  return allowedWeekdays.includes(s) ? s : null;
}

export function normalizeSkillsGroupMeetingTime(t) {
  const s = String(t || '').trim();
  if (!s) return null;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return null;
}

/**
 * Replace all meetings for a skills group. Accepts weekday + startTime/endTime or start_time/end_time.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} skillsGroupId
 * @param {Array<{weekday?:string,startTime?:string,endTime?:string,start_time?:string,end_time?:string}>} meetings
 */
export async function replaceSkillsGroupMeetings(conn, skillsGroupId, meetings) {
  const gid = Number(skillsGroupId);
  if (!Number.isFinite(gid) || gid <= 0) {
    const err = new Error('Invalid skillsGroupId');
    err.statusCode = 400;
    throw err;
  }
  const list = Array.isArray(meetings) ? meetings : [];
  await conn.execute(`DELETE FROM skills_group_meetings WHERE skills_group_id = ?`, [gid]);
  for (const raw of list) {
    const weekdayRaw = String(raw?.weekday || '').trim();
    const startRaw = String(raw?.start_time ?? raw?.startTime ?? '').trim();
    const endRaw = String(raw?.end_time ?? raw?.endTime ?? '').trim();
    const any = !!weekdayRaw || !!startRaw || !!endRaw;
    if (!any) continue;
    const weekday = normalizeSkillsGroupMeetingWeekday(weekdayRaw);
    const startTime = normalizeSkillsGroupMeetingTime(startRaw);
    const endTime = normalizeSkillsGroupMeetingTime(endRaw);
    if (!weekday || !startTime || !endTime) {
      const err = new Error('Invalid meeting (weekday/start/end time)');
      err.statusCode = 400;
      throw err;
    }
    // eslint-disable-next-line no-await-in-loop
    await conn.execute(
      `INSERT INTO skills_group_meetings (skills_group_id, weekday, start_time, end_time)
       VALUES (?, ?, ?, ?)`,
      [gid, weekday, startTime, endTime]
    );
  }
}
