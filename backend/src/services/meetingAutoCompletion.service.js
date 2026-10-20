import pool from '../config/database.js';
import { triggerTeamMeetingSummaryFromTranscript } from './teamMeetingTranscriptSummary.service.js';
// Only close after the scheduled end AND ten minutes with nobody connected.
// The stored end is the final actual attendance segment, never the worker's run time.
export async function completeEmptyPastMeetings({eventId=null,enqueue=true}={}) {
  let completed=0;
  const [rows]=await pool.execute(`SELECT e.id FROM provider_schedule_events e
    WHERE (? IS NULL OR e.id=?) AND e.kind IN ('TEAM_MEETING','HUDDLE') AND COALESCE(e.meeting_subtype,'')<>'interview' AND e.status='ACTIVE' AND e.meeting_completed_at IS NULL
      AND e.end_at<UTC_TIMESTAMP()-INTERVAL 10 MINUTE AND e.start_at>UTC_TIMESTAMP()-INTERVAL 2 DAY
      AND EXISTS(SELECT 1 FROM provider_schedule_event_attendance_segments a WHERE a.event_id=e.id AND a.ended_at IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM provider_schedule_event_attendance_segments a WHERE a.event_id=e.id AND a.ended_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM provider_schedule_event_join_presence p WHERE p.event_id=e.id AND (p.left_at IS NULL OR p.last_seen_at>UTC_TIMESTAMP()-INTERVAL 10 MINUTE)) LIMIT 30`,[eventId,eventId]);
  for (const {id} of rows) {
    const [result]=await pool.execute(`UPDATE provider_schedule_events e SET meeting_completed_at=(SELECT MAX(a.ended_at) FROM provider_schedule_event_attendance_segments a WHERE a.event_id=e.id),updated_at=UTC_TIMESTAMP()
      WHERE e.id=? AND e.meeting_completed_at IS NULL AND e.status='ACTIVE'
      AND NOT EXISTS(SELECT 1 FROM provider_schedule_event_attendance_segments a WHERE a.event_id=e.id AND a.ended_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM provider_schedule_event_join_presence p WHERE p.event_id=e.id AND (p.left_at IS NULL OR p.last_seen_at>UTC_TIMESTAMP()-INTERVAL 10 MINUTE))`,[id]);
    if(result.affectedRows) completed++;
  }
  if (enqueue) {
    // Completion persists even if enqueue fails. A subsequent worker pass finds
    // completed meetings without a job and retries, without reopening attendance.
    const [missing] = await pool.execute(`SELECT e.id FROM provider_schedule_events e
      LEFT JOIN meeting_summary_jobs j ON j.meeting_type='team' AND j.meeting_id=e.id
      WHERE (? IS NULL OR e.id=?) AND e.meeting_completed_at>UTC_TIMESTAMP()-INTERVAL 2 DAY
      AND e.kind IN ('TEAM_MEETING','HUDDLE') AND COALESCE(e.meeting_subtype,'')<>'interview'
      AND e.status='ACTIVE' AND j.meeting_id IS NULL LIMIT 30`,[eventId,eventId]);
    for (const {id} of missing) await triggerTeamMeetingSummaryFromTranscript(id);
  }
  return completed;
}
