import pool from '../config/database.js';
import GoogleCalendarService from './googleCalendar.service.js';

export async function reconcileClientCalendarPrivacy() {
  if (!GoogleCalendarService.isConfigured()) return;
  const db = await pool.getConnection();
  const lock = 'client-calendar-privacy-reconciliation';
  try {
    const [[{ acquired }]] = await db.execute('SELECT GET_LOCK(?,0) AS acquired', [lock]);
    if (!acquired) return;
    try {
      const [rows] = await db.execute(`
        SELECT p.id,p.provider_id,p.google_event_id,u.email
        FROM provider_schedule_events p JOIN users u ON u.id=p.provider_id
        WHERE p.calendar_privacy_reconciled_at IS NULL
          AND (p.calendar_privacy_retry_at IS NULL OR p.calendar_privacy_retry_at<=UTC_TIMESTAMP())
          AND p.google_event_id IS NOT NULL AND p.google_event_id<>''
          AND (p.client_id IS NOT NULL OR p.kind IN ('SESSION','CLINICAL_SESSION','INDIVIDUAL_SESSION','GROUP_SESSION','VIRTUAL_SESSION')
            OR EXISTS (SELECT 1 FROM appointments a WHERE a.provider_schedule_event_id=p.id AND a.agency_id=p.agency_id))
        ORDER BY (p.end_at >= UTC_TIMESTAMP()) DESC, p.id DESC LIMIT 25`);
      for (const row of rows) {
        const redacted = await GoogleCalendarService.redactLinkedClientCalendarEvent(row.email,row.google_event_id).catch(() => false);
        const update = redacted
          ? 'calendar_privacy_reconciled_at=UTC_TIMESTAMP(),calendar_privacy_retry_at=NULL'
          : 'calendar_privacy_retry_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY)';
        await db.execute(`UPDATE provider_schedule_events SET ${update} WHERE id=? AND provider_id=? AND google_event_id=?`,
          [row.id,row.provider_id,row.google_event_id]);
      }
    } finally {
      await db.execute('SELECT RELEASE_LOCK(?)',[lock]);
    }
  } finally {
    db.release();
  }
}
