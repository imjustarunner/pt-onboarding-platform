import pool from '../config/database.js';
import { generateJoinToken, joinUrlForSupervision, joinUrlForTeamMeeting } from '../utils/joinToken.js';
import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { recurringWindowEnd, nextRecurringWindow } from '../utils/recurringWindow.js';
import { utcToZonedMysqlWall, parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { withSupervisorTimeLock, assertNoReviewTimeOverlap } from './supervisionReviewTime.service.js';

// Explicit allowlists: never copy recordings, consent, attendance, live-room
// state, RSVP responses, join tokens, payroll completion, or presentation text.
const definitions = {
  supervision: {
    table: 'supervision_sessions', active: 'SCHEDULED', host: 'supervisor_user_id',
    filter: "recurrence_series_id IS NOT NULL AND session_type IN ('individual','group')",
    fields: 'agency_id supervisor_user_id co_facilitator_user_id supervisee_user_id session_type invite_scope invite_audience_all_supervised invite_audience_group_support enrollment_mode auto_cancel_if_empty start_at end_at modality location_text notes created_by_user_id waiting_room_enabled notify_participants recurrence_series_id recurrence_frequency recurrence_index recurrence_policy event_timezone reminder_minutes meeting_settings_json'
  },
  meeting: {
    table: 'provider_schedule_events', active: 'ACTIVE', host: 'provider_id',
    filter: "recurrence_series_id IS NOT NULL AND kind IN ('TEAM_MEETING','HUDDLE') AND client_id IS NULL AND all_day=0",
    fields: 'agency_id provider_id kind title description is_private start_at end_at event_timezone recurrence_series_id recurrence_frequency recurrence_index recurrence_policy platform_video_link google_meet_link created_by_user_id waiting_room_enabled meeting_subtype attendance_tracking_enabled notify_participants reminder_minutes meeting_settings_json is_training_pay_eligible'
  }
};
const key = row => `${row.agency_id}:${row.recurrence_series_id}:${row.recurrence_frequency === 'MONTHLY' ? '' : new Date(`${date(row)}T12:00:00Z`).getUTCDay()}`;
const date = (row, now) => utcToZonedMysqlWall(now || row.start_at, row.event_timezone || 'America/Denver')?.slice(0,10);

export async function copyRecurringRoster(db, kind, oldId, newId) {
  if (kind === 'supervision') {
    await db.execute(`INSERT INTO supervision_session_attendees
      (session_id,user_id,participant_role,is_required,is_compensable_snapshot,status,invited_at)
      SELECT ?,a.user_id,a.participant_role,a.is_required,
        CASE WHEN a.is_required=1 AND a.participant_role='supervisee' THEN COALESCE(ua.supervision_is_compensable,0) ELSE 0 END,'INVITED',UTC_TIMESTAMP()
      FROM supervision_session_attendees a JOIN supervision_sessions s ON s.id=a.session_id
      JOIN user_agencies ua ON ua.user_id=a.user_id AND ua.agency_id=s.agency_id
      WHERE a.session_id=? AND ua.is_active=1 AND a.status NOT IN ('REMOVED','CANCELLED','WITHDRAWN')`, [newId, oldId]);
  } else {
    await db.execute(`INSERT INTO provider_schedule_event_attendees (event_id,user_id)
      SELECT ?,a.user_id FROM provider_schedule_event_attendees a JOIN provider_schedule_events e ON e.id=a.event_id
      JOIN user_agencies ua ON ua.user_id=a.user_id AND ua.agency_id=e.agency_id WHERE a.event_id=? AND ua.is_active=1`, [newId, oldId]);
    await db.execute(`INSERT INTO meeting_participant_preferences (event_id,user_id,is_required,is_cohost)
      SELECT ?,p.user_id,p.is_required,p.is_cohost FROM meeting_participant_preferences p
      JOIN provider_schedule_event_attendees a ON a.event_id=? AND a.user_id=p.user_id WHERE p.event_id=?`, [newId,newId,oldId]);
    await db.execute(`INSERT INTO provider_schedule_event_invite_groups (event_id,invite_group_id)
      SELECT ?,invite_group_id FROM provider_schedule_event_invite_groups WHERE event_id=?`, [newId,oldId]);
  }
}

async function appendOccurrence(db, kind, template, window, index) {
  const def = definitions[kind];
  const columns = def.fields.split(' ');
  const values = columns.map(field => {
    if (field === 'start_at') return window.startAt;
    if (field === 'end_at') return window.endAt;
    if (field === 'recurrence_index') return index;
    const value = template[field] ?? null;
    return field.endsWith('_json') && value && typeof value !== 'string' ? JSON.stringify(value) : value;
  });
  const participant = generateJoinToken();
  columns.push('join_token','participant_join_token','host_join_token','status','recurrence_calendar_pending');
  values.push(participant, participant, generateJoinToken(), def.active, 1);
  const [result] = await db.execute(`INSERT INTO ${def.table} (${columns.join(',')}) VALUES (${values.map(()=>'?').join(',')})`, values);
  await copyRecurringRoster(db, kind, template.id, result.insertId);
  return result.insertId;
}

/** Idempotent cross-instance worker. No invitation/notification APIs are called.
 * Existing beyond-window rows are soft-held, preserving IDs and per-date work.
 * Legacy series without an explicit indefinite policy stop at their original
 * end; we must not silently turn a finite agreement into perpetual meetings.
 */
export async function maintainRecurringScheduleWindow({ now = new Date() } = {}) {
  const db = await pool.getConnection();
  const counts = { held: 0, restored: 0, added: 0 };
  let locked = false;
  try {
    const [[lock]] = await db.execute("SELECT GET_LOCK('recurring-schedule-year',0) AS acquired");
    if (!Number(lock?.acquired)) return { skipped: true };
    locked = true;
    for (const [kind, def] of Object.entries(definitions)) {
      // Include cancelled occurrences so individual cancellations remain holes.
      const [rows] = await db.execute(`SELECT * FROM ${def.table} WHERE ${def.filter} ORDER BY start_at,id`);
      const series = new Map();
      for (const row of rows) {
        if (!series.has(key(row))) series.set(key(row), []);
        series.get(key(row)).push(row);
        const boundary = recurringWindowEnd(now, row.event_timezone || 'America/Denver');
        const day = date(row);
        if (row.status === def.active && !row.finalized_at && !row.meeting_completed_at && day >= boundary) {
          await db.execute(`UPDATE ${def.table} SET status='CANCELLED',recurrence_horizon_held=1,recurrence_calendar_pending=1,recurrence_calendar_generation=recurrence_calendar_generation+1 WHERE id=? AND status=?`, [row.id, def.active]);
          row.status = 'CANCELLED'; row.recurrence_horizon_held = 1; counts.held++;
        } else if (Number(row.recurrence_horizon_held) && day < date(row,now)) {
          await db.execute(`UPDATE ${def.table} SET recurrence_horizon_held=0 WHERE id=? AND recurrence_horizon_held=1`,[row.id]);
          row.recurrence_horizon_held=0;
        } else if (Number(row.recurrence_horizon_held) && !Number(row.recurrence_stopped)
          && day < boundary && day >= date(row, now)) {
          try {
            const restore=()=>db.execute(`UPDATE ${def.table} SET status=?,recurrence_horizon_held=0,recurrence_calendar_pending=1 WHERE id=? AND recurrence_horizon_held=1 AND recurrence_stopped=0`, [def.active,row.id]);
            if(kind==='supervision'){
              const ids=[row.supervisor_user_id,row.co_facilitator_user_id,row.supervisee_user_id].filter(Boolean);
              await withSupervisorTimeLock(ids,async lockDb=>{
                await assertNoReviewTimeOverlap(lockDb,ids,row.start_at,row.end_at);
                await restore();
              });
            }else await restore();
            row.status = def.active; row.recurrence_horizon_held = 0; counts.restored++;
          }catch(error){
            counts.deferred=(counts.deferred || 0)+1;
            console.warn('[Recurring schedule] Restore deferred',kind,row.id,error.code || error.status || 'error');
          }
        }
      }
      for (const items of series.values()) {
        if (items.some(row => Number(row.recurrence_stopped))) continue;
        // The scheduling UI creates initial occurrences sequentially. Never
        // extend a series while that initial batch may still be arriving.
        if (items.some(row => row.created_at && +parseUtcDate(row.created_at) > +now-3600000)) continue;
        const template = items.findLast(row => row.status === def.active && !row.finalized_at && !row.meeting_completed_at);
        if (!template || template.recurrence_policy !== 'INDEFINITE') continue;
        // Existing held dates already describe the intended future recurrence.
        if (items.some(row => Number(row.recurrence_horizon_held))) continue;
        // Each weekday is extended independently for multi-weekday series.
        const anchor = items[0];
        let last = items[items.length-1];
        const boundary = recurringWindowEnd(now, template.event_timezone || 'America/Denver');
        for (let n=0; n<600; n++) {
          const window = nextRecurringWindow(anchor,last);
          if (!window || window.day >= boundary) break;
          let index = Number(last.recurrence_index || 0)+1;
          if (window.day < date(template,now)) {
            last={...last,start_at:window.startAt,end_at:window.endAt,recurrence_index:index};
            continue;
          }
          await db.beginTransaction();
          try {
            const [[stopped]] = await db.execute(`SELECT MAX(recurrence_stopped) AS stopped,COALESCE(MAX(recurrence_index),-1)+1 AS next_index FROM ${def.table} WHERE agency_id=? AND recurrence_series_id=?`, [template.agency_id,template.recurrence_series_id]);
            if (Number(stopped?.stopped)) { await db.rollback(); break; }
            index=Number(stopped?.next_index ?? index);
            const [existing] = await db.execute(`SELECT id FROM ${def.table} WHERE agency_id=? AND recurrence_series_id=? AND start_at=? LIMIT 1`, [template.agency_id,template.recurrence_series_id,window.startAt]);
            if (!existing.length) {
              if (kind === 'supervision') {
                const ids=[template.supervisor_user_id,template.co_facilitator_user_id,template.supervisee_user_id].filter(Boolean);
                await withSupervisorTimeLock(ids,async lockDb=>{
                  await assertNoReviewTimeOverlap(lockDb,ids,window.startAt,window.endAt);
                  await appendOccurrence(db,kind,template,window,index);
                  // Commit while review-time locks are still held.
                  await db.commit();
                });
              } else await appendOccurrence(db,kind,template,window,index);
              counts.added++;
            }
            await db.commit();
          } catch(error) {
            await db.rollback();
            counts.deferred=(counts.deferred || 0)+1;
            console.warn('[Recurring schedule] Extension deferred',kind,template.id,error.code || error.status || 'error');
            break;
          }
          last = { ...last,start_at:window.startAt,end_at:window.endAt,recurrence_index:index };
        }
      }
    }
    return counts;
  } finally {
    try { if (locked) await db.execute("SELECT RELEASE_LOCK('recurring-schedule-year')"); }
    finally { db.release(); }
  }
}

// Calendar maintenance is separate from materialization; failures retry without
// recreating app appointments or sending Google invitation emails.
export async function syncRecurringCalendars() {
  const { default: Google } = await import('./googleCalendar.service.js');
  for (const [kind,def] of Object.entries(definitions)) {
    const [rows] = await pool.execute(`SELECT e.*,u.email AS host_email FROM ${def.table} e
      JOIN users u ON u.id=e.${def.host} WHERE e.recurrence_calendar_pending=1 ORDER BY e.id LIMIT 100`);
    for (const row of rows) {
      try {
        let result;
        if (row.status === 'CANCELLED') {
          result = row.google_event_id ? await Google.deleteEvent({subjectEmail:row.host_email,eventId:row.google_event_id,sendUpdates:'none'}) : {ok:true};
        } else {
          const base = await tenantMeetingBase(row.agency_id);
          let join = kind === 'supervision' ? joinUrlForSupervision(base,row.participant_join_token || row.join_token || row.id)
            : joinUrlForTeamMeeting(base,row.participant_join_token || row.join_token || row.id);
          if (kind === 'supervision' && String(row.modality).toLowerCase()==='in_person') join=null;
          if (kind === 'meeting' && Number(row.platform_video_link)===0 && row.platform_video_link!=null) join=row.google_meet_link || null;
          result = await Google.upsertProviderPrimaryCalendarEvent({subjectEmail:row.host_email,
            existingGoogleEventId:row.google_event_id, stableInsertId:`rec${kind === 'supervision' ? 'a' : 'b'}${row.id.toString(16)}d${Number(row.recurrence_calendar_generation || 0).toString(16)}`,
            summary:row.title || 'Supervision', description:[row.description || row.notes,join ? `Join: ${join}` : row.location_text].filter(Boolean).join('\n\n'),
            startAt:utcToZonedMysqlWall(row.start_at,row.event_timezone || 'America/Denver'),endAt:utcToZonedMysqlWall(row.end_at,row.event_timezone || 'America/Denver'),
            timeZone:row.event_timezone || 'America/Denver',sendUpdates:'none',disableReminders:true});
        }
        if (result?.ok || result?.skipped) await pool.execute(`UPDATE ${def.table} SET google_event_id=?,recurrence_calendar_pending=0 WHERE id=? AND status=?`,[row.status === 'CANCELLED' ? null : result.googleEventId || row.google_event_id || null,row.id,row.status]);
      } catch(error) { console.warn('[Recurring calendar] Retry pending',kind,row.id,error.code || 'error'); }
    }
  }
}
