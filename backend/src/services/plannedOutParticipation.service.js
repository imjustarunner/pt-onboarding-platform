import pool from '../config/database.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

// RSVP changes affect only this occurrence and remain editable through the usual RSVP route.
export function createPlannedOutParticipation({ database = pool, now = () => new Date() } = {}) {
  async function list({ agencyId, providerId, start, end, date, timeZone }) {
    const [meetings] = await database.execute(`SELECT e.*,p.rsvp FROM provider_schedule_events e
      JOIN provider_schedule_event_attendees a ON a.event_id=e.id AND a.user_id=?
      LEFT JOIN meeting_participant_preferences p ON p.event_id=e.id AND p.user_id=a.user_id
      WHERE e.agency_id=? AND e.provider_id<>? AND e.status<>'CANCELLED'
      AND e.start_at<? AND e.end_at>?`, [providerId,agencyId,providerId,end,start]);
    const [supervision] = await database.execute(`SELECT s.*,a.status AS rsvp_status FROM supervision_sessions s
      JOIN supervision_session_attendees a ON a.session_id=s.id AND a.user_id=?
      WHERE s.agency_id=? AND s.supervisor_user_id<>? AND s.status NOT IN ('CANCELLED','FINALIZED','MISSED')
      AND a.status NOT IN ('REMOVED','WITHDRAWN','CANCELLED') AND s.start_at<? AND s.end_at>?`, [providerId,agencyId,providerId,end,start]);
    const [company] = await database.execute(`SELECT e.*,i.response FROM company_events e
      JOIN company_event_invitations i ON i.company_event_id=e.id AND i.user_id=?
      WHERE e.agency_id=? AND e.is_active=1 AND e.starts_at<? AND e.ends_at>?`, [providerId,agencyId,end,start]);
    const [personal] = await database.execute(`SELECT * FROM provider_schedule_events WHERE agency_id=? AND provider_id=?
      AND kind IN ('PERSONAL_EVENT','INDIRECT_SERVICES','SCHEDULE_HOLD') AND COALESCE(reason_code,'')<>'PLANNED_OUT'
      AND client_id IS NULL AND status<>'CANCELLED' AND ((start_at<? AND end_at>?) OR (all_day=1 AND start_date<=? AND end_date>?))`, [agencyId,providerId,end,start,date,date]);
    return [['meeting',meetings],['supervision',supervision],['company',company],['personal',personal]].flatMap(([type,rows]) => rows
      .filter(r => !r.finalized_at && !r.meeting_completed_at && !r.live_started_at && (!r.start_at && !r.starts_at ? true : parseUtcDate(r.start_at || r.starts_at) > now()))
      .map(row => ({ key:`participation:${type}:${row.id}`,kind:'participation',type,id:Number(row.id),agencyId,providerId,date,timeZone,
        title:row.title || 'Scheduled event',startAt:row.start_at || row.starts_at || start,endAt:row.end_at || row.ends_at || end,
        source:row,detail:type === 'personal' ? 'Cancel this scheduled event; preserve its content' : 'RSVP: not attending (you can change it later)' })));
  }
  async function apply(item, actorUserId) {
    const { agencyId,providerId,id,type } = item;
    const table = type === 'company' ? 'company_events' : type === 'supervision' ? 'supervision_sessions' : 'provider_schedule_events';
    const [[current]] = await database.execute(`SELECT * FROM ${table} WHERE id=? AND agency_id=?`,[id,agencyId]);
    const same = (a,b) => (!a && !b) || (!!a && !!b && +parseUtcDate(a) === +parseUtcDate(b));
    if (!current || !same(current.start_at || current.starts_at,item.source.start_at || item.source.starts_at)
      || !same(current.end_at || current.ends_at,item.source.end_at || item.source.ends_at)
      || !same(current.start_date,item.source.start_date) || !same(current.end_date,item.source.end_date)
      || Number(current.provider_id || current.supervisor_user_id || 0) !== Number(item.source.provider_id || item.source.supervisor_user_id || 0)
      || ((current.start_at || current.starts_at) && parseUtcDate(current.start_at || current.starts_at) <= now())
      || current.finalized_at || current.meeting_completed_at || current.live_started_at) {
      throw Object.assign(new Error('This event changed. Review its RSVP individually.'),{status:409});
    }
    if (type === 'meeting') {
      await database.execute(`INSERT INTO meeting_participant_preferences (event_id,user_id,rsvp,rsvp_at)
        SELECT e.id,?,'declined',UTC_TIMESTAMP() FROM provider_schedule_events e
        JOIN provider_schedule_event_attendees a ON a.event_id=e.id AND a.user_id=?
        WHERE e.id=? AND e.agency_id=? AND e.start_at>UTC_TIMESTAMP() AND e.status<>'CANCELLED'
        ON DUPLICATE KEY UPDATE rsvp='declined',rsvp_at=UTC_TIMESTAMP()`,[providerId,providerId,id,agencyId]);
    } else if (type === 'supervision') {
      await database.execute(`UPDATE supervision_session_attendees a JOIN supervision_sessions s ON s.id=a.session_id
        SET a.status='DECLINED',a.decline_reason='Planned out' WHERE a.session_id=? AND a.user_id=? AND s.agency_id=?
        AND s.start_at>UTC_TIMESTAMP() AND s.status NOT IN ('CANCELLED','FINALIZED','MISSED') AND a.status NOT IN ('REMOVED','WITHDRAWN','CANCELLED')`,[id,providerId,agencyId]);
    } else if (type === 'company') {
      await database.execute(`UPDATE company_event_invitations i JOIN company_events e ON e.id=i.company_event_id
        SET i.response='no',i.responded_at=UTC_TIMESTAMP() WHERE i.company_event_id=? AND i.user_id=? AND e.agency_id=? AND e.starts_at>UTC_TIMESTAMP()`,[id,providerId,agencyId]);
      await database.execute(`INSERT INTO company_event_responses (company_event_id,user_id,response_key,response_label,response_body,source)
        SELECT e.id,?,'no','Not attending','Planned out','in_app' FROM company_events e
        JOIN company_event_invitations i ON i.company_event_id=e.id AND i.user_id=?
        WHERE e.id=? AND e.agency_id=? AND e.starts_at>UTC_TIMESTAMP()
        ON DUPLICATE KEY UPDATE response_key='no',response_label='Not attending',response_body='Planned out',source='in_app',received_at=UTC_TIMESTAMP()`, [providerId,providerId,id,agencyId]);
    } else {
      await database.execute(`UPDATE provider_schedule_events SET status='CANCELLED',updated_by_user_id=?
        WHERE id=? AND agency_id=? AND provider_id=? AND client_id IS NULL AND kind IN ('PERSONAL_EVENT','INDIRECT_SERVICES','SCHEDULE_HOLD') AND COALESCE(reason_code,'')<>'PLANNED_OUT'`,[actorUserId,id,agencyId,providerId]);
    }
    return { sent:0, recordOnly:true };
  }
  return { list,apply };
}
export const plannedOutParticipation = createPlannedOutParticipation();
