import pool from '../config/database.js';
import { readEventOperations } from '../utils/companyEventOperations.js';
import { dueCompanyEventReminders } from '../utils/companyEventReminders.js';
import { computeNextOccurrence } from './companyEvents.service.js';
import { resolveCompanyEventAudienceUserIds } from './companyEventAudience.service.js';
import { deliverCompanyEventInvitation, listCompanyEventInvitations } from './companyEventInvitations.service.js';

const json = value => {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value || '{}'); } catch { return {}; }
};

/** Runs independently of poll followups. No invitation means no event reminder or splash. */
export async function processCompanyEventInvitationReminders({ now = new Date(), db = pool,
  resolveRecipientIds = event => resolveCompanyEventAudienceUserIds({ event }),
  deliver = deliverCompanyEventInvitation, listInvitations = listCompanyEventInvitations } = {}) {
  const [events] = await db.execute(`SELECT * FROM company_events WHERE is_active = 1
    AND COALESCE(school_event_status,'') <> 'canceled'
    AND event_type NOT IN ('team_poll','direct_notice')
    AND event_type NOT LIKE 'program_%' AND event_type NOT LIKE 'school_%'
    AND event_type NOT IN ('skills_group','guardian_program_class')
    AND (JSON_EXTRACT(reminder_config_json,'$.enabled') = TRUE
      OR JSON_EXTRACT(reminder_config_json,'$.rsvp.enabled') = TRUE
      OR JSON_LENGTH(JSON_EXTRACT(operations_json,'$.dashboardAnnouncements')) > 0)
    ORDER BY id LIMIT 1000`);
  const deliveries = [], failures = [];
  for (const event of events || []) {
    try {
      const eligible = new Set((await resolveRecipientIds(event)).map(Number));
      const invitations = (await listInvitations(event, db)).filter(i => eligible.has(Number(i.user_id)));
      const recurrence = json(event.recurrence_json);
      const occurrence = event.starts_at && event.ends_at ? computeNextOccurrence({ startsAt: event.starts_at, endsAt: event.ends_at, recurrence }, now) : null;
      const operations = readEventOperations(event);
      const announcements = (operations.dashboardAnnouncements || []).filter(a => {
        const starts = a.scheduledAt ? new Date(a.scheduledAt).getTime() : NaN;
        const ends = a.endsAt ? new Date(a.endsAt).getTime() : Infinity;
        return a.id && a.content && Number.isFinite(starts) && starts <= now.getTime() && ends > now.getTime();
      });
      for (const invitation of invitations) {
        for (const due of dueCompanyEventReminders(event, invitation, now, occurrence)) deliveries.push(...await deliver({ event, invitation, ...due,
          scheduleKey: due.key, now, db }));
        for (const announcement of announcements) deliveries.push(...await deliver({ event, invitation, kind: 'announcement',
          scheduleKey: `announcement:${announcement.id}:${announcement.scheduledAt}`, channels: { inApp: true }, announcement, now, db }));
      }
    } catch (error) {
      failures.push({ eventId: Number(event.id), reason: error.code || 'event_reminder_failed' });
      console.warn('Company event reminders:', event.id, error.code || 'event_reminder_failed');
    }
  }
  return { deliveries, failures };
}
