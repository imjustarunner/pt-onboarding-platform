import crypto from 'node:crypto';
import pool from '../config/database.js';

export async function enqueueMeetingSummary(type, id) {
  if (!['team','supervision'].includes(type) || !Number(id)) throw new Error('Invalid meeting');
  await pool.execute(`INSERT INTO meeting_summary_jobs (meeting_type,meeting_id) VALUES (?,?)
    ON DUPLICATE KEY UPDATE rerun_requested=IF(status='generating',1,0),
    attempts=IF(status='generating',attempts,0),available_at=UTC_TIMESTAMP(),
    status=IF(status='generating','generating','queued')`, [type,Number(id)]);
  return { ok: true, status: 'queued' };
}
export async function meetingSummaryStatus(type, id) {
  const [rows] = await pool.execute('SELECT status,updated_at FROM meeting_summary_jobs WHERE meeting_type=? AND meeting_id=?', [type,Number(id)]);
  return rows[0]?.status || null;
}
let running = false;
export async function processMeetingSummaryJobs() {
  if (running) return;
  running = true;
  try {
    for (let i = 0; i < 5; i++) {
      const token = crypto.randomUUID();
      const [claimed] = await pool.execute(`UPDATE meeting_summary_jobs SET status='generating',attempts=attempts+1,
        lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE)
        WHERE (status='queued' AND available_at<=UTC_TIMESTAMP()) OR
          (status='generating' AND lease_until<UTC_TIMESTAMP()) ORDER BY available_at LIMIT 1`, [token]);
      if (!claimed.affectedRows) break;
      const [rows] = await pool.execute('SELECT * FROM meeting_summary_jobs WHERE lease_token=?', [token]);
      const job = rows[0];
      try {
        const result = job.meeting_type === 'team'
          ? await (await import('./teamMeetingTranscriptSummary.service.js')).generateTeamMeetingSummaryFromTranscript(job.meeting_id)
          : await (await import('./supervisionTranscriptSummary.service.js')).generateSupervisionSummaryFromTranscript(job.meeting_id);
        if (!result?.ok) throw new Error('No summary was generated');
        await pool.execute(`UPDATE meeting_summary_jobs SET status=IF(rerun_requested=1,'queued','ready'),
          attempts=0,rerun_requested=0,lease_token=NULL,lease_until=NULL WHERE lease_token=?`, [token]);
      } catch (error) {
        // Store only state, never transcript content or provider error payloads.
        console.warn('[meetingSummaryJobs] generation failed', job.meeting_type, job.meeting_id);
        await pool.execute(`UPDATE meeting_summary_jobs SET status=IF(attempts<3,'queued','failed'),
          available_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 MINUTE),lease_token=NULL,lease_until=NULL WHERE lease_token=?`, [token]);
      }
    }
  } finally { running = false; }
}
