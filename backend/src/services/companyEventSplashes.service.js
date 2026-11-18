import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { readEventOperations } from '../utils/companyEventOperations.js';
import { invitationResponse } from '../utils/companyEventReminders.js';
import { isReadableCompanyGathering, storedCompanyEventPage, companyEventPageUrl } from '../utils/companyEventPage.js';
import { isCompanyEventInvitee } from './companyEventAudience.service.js';

export const splashLoginKey = (user, fallback) => createHash('sha256').update(`${user.id}:${user.sessionId || fallback}`).digest('hex');

export function eventRsvpSplash(event, now = new Date()) {
  const operations = readEventOperations(event);
  if (!isReadableCompanyGathering(event) || operations.loginSplashEnabled === false || invitationResponse(event)) return null;
  const deadline = event.rsvp_deadline || (!operations.dateToBeDecided && event.ends_at);
  if (deadline && new Date(deadline) <= now) return null;
  const page = storedCompanyEventPage(event);
  const responseUrl = page ? `/company-events/page/${page.organizationSlug}/${page.eventSlug}/staff/respond`
    : event.staff_link_token ? `/company-events/${event.id}/staff/${event.staff_link_token}/respond` : null;
  return { id: `rsvp:${event.id}`, eventId: Number(event.id), agencyId: Number(event.agency_id), kind: 'rsvp',
    title: event.title, message: 'Will you join us? Please let the organizer know.', closesAt: event.rsvp_deadline || null,
    url: companyEventPageUrl(event) || (event.staff_link_token ? `/company-events/${event.id}/staff/${event.staff_link_token}` : `/staff-events/${event.id}`),
    responseUrl, options: [{ key:'yes',label:'Yes, I’m coming' },{ key:'no',label:'No, I can’t make it' },{ key:'maybe',label:'Maybe' }],
    potluck: !!event.potluck_enabled };
}

export function pollSplash(poll) {
  if (!poll.canVote || poll.closedAt || poll.myResponse || poll.loginSplashEnabled === false) return null;
  return { id:`poll:${poll.id}`, eventId:poll.id, agencyId:poll.agencyId, kind:'poll', title:poll.title, message:poll.question,
    options:poll.options, closesAt:poll.closesAt, responseUrl:`/me/company-events/${poll.id}/respond`,
    url:`/staff-polls/${poll.id}?agencyId=${poll.agencyId}`, linkedEvent:poll.linkedEvent };
}

// Eligibility is independent of unread notification state and of the reminder worker.
export async function pendingEventSplashes({ userId, polls = [], now = new Date(), db = pool, canSee = isCompanyEventInvitee }) {
  const items = polls.map(pollSplash).filter(Boolean);
  const [events] = await db.execute(`SELECT e.*, i.response, r.response_key FROM company_events e
    JOIN company_event_invitations i ON i.company_event_id=e.id AND i.user_id=?
    LEFT JOIN company_event_responses r ON r.company_event_id=e.id AND r.user_id=i.user_id
    WHERE e.is_active=1 AND COALESCE(e.school_event_status,'') NOT IN ('canceled','cancelled')
      AND e.event_type NOT IN ('team_poll','direct_notice') ORDER BY e.id`, [userId]);
  for (const event of events) {
    if (!await canSee({event,userId,db})) continue;
    const rsvp = eventRsvpSplash(event, now);
    // Older events with their own vote already have an answer card above.
    if (rsvp && !items.some(item => item.eventId === rsvp.eventId)) items.push(rsvp);
    for (const announcement of readEventOperations(event).dashboardAnnouncements || []) {
      if (new Date(announcement.scheduledAt) > now || new Date(announcement.endsAt) <= now || !announcement.content) continue;
      if (items.some(item => item.eventId === Number(event.id))) continue;
      items.push({ id:`announcement:${event.id}:${announcement.id}`, eventId:Number(event.id), agencyId:Number(event.agency_id), kind:'announcement',
        title:event.title, message:announcement.content, url:companyEventPageUrl(event) || `/staff-events/${event.id}`, options:[] });
    }
  }
  return [...new Map(items.map(item=>[item.id,item])).values()].sort((a,b) => (a.closesAt ? new Date(a.closesAt).getTime() : Infinity) - (b.closesAt ? new Date(b.closesAt).getTime() : Infinity) || a.eventId-b.eventId);
}

export async function filterLoginSplashes(items, userId, loginKey, db = pool) {
  const [seen] = await db.execute(`SELECT item_key FROM company_event_splash_views WHERE user_id=? AND login_key=?
    AND (dismissed_at IS NOT NULL OR opened_at IS NOT NULL OR responded_at IS NOT NULL)`, [userId,loginKey]);
  const done = new Set(seen.map(row => row.item_key));
  return items.filter(item => !done.has(item.id));
}

export async function recordSplashInteraction({ userId, loginKey, item, displayId, action, db=pool }) {
  if (action === 'viewed') {
    await db.execute(`INSERT IGNORE INTO company_event_splash_views (company_event_id,user_id,login_key,item_key,display_id,kind)
      VALUES (?,?,?,?,?,?)`, [item.eventId,userId,loginKey,item.id,displayId,item.kind]);
    return;
  }
  const column = {dismissed:'dismissed_at',opened:'opened_at',responded:'responded_at'}[action];
  if (!column) throw Object.assign(new Error('Unknown splash action'),{status:400});
  // Every interaction belongs to this authenticated user and login, never a supplied actor.
  await db.execute(`UPDATE company_event_splash_views SET ${column}=COALESCE(${column},CURRENT_TIMESTAMP(3))
    WHERE user_id=? AND login_key=? AND item_key=? AND display_id=?`, [userId,loginKey,item.id,displayId]);
}

export async function splashHistory(eventId, db=pool) {
  const [rows] = await db.execute(`SELECT s.*,e.title,u.first_name,u.last_name FROM company_event_splash_views s
    JOIN company_events e ON e.id=s.company_event_id JOIN users u ON u.id=s.user_id
    WHERE s.company_event_id=? OR (e.agency_id=(SELECT agency_id FROM company_events WHERE id=?)
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(e.voting_config_json,'$.linkedEventId')) AS UNSIGNED)=?)
    ORDER BY s.viewed_at DESC,s.id DESC`, [eventId,eventId,eventId]);
  return rows.map(row=>({id:Number(row.id),eventId:Number(row.company_event_id),userId:Number(row.user_id),title:row.title,
    name:[row.first_name,row.last_name].filter(Boolean).join(' '),kind:row.kind,viewedAt:row.viewed_at,
    dismissedAt:row.dismissed_at,openedAt:row.opened_at,respondedAt:row.responded_at}));
}
