import pool from '../config/database.js';
import { readEventOperations } from '../utils/companyEventOperations.js';
import { isCompanyEventInvitee, listCompanyEventInvitees } from '../services/companyEventAudience.service.js';
import { canManageEventConversation } from '../services/companyEventConversation.service.js';
import { saveStaffPotluckContribution } from '../services/staffEventPotluck.service.js';
import { isCompanyGathering } from '../services/companyEventPersonalAgenda.service.js';
import { companyEventInvitationLinks } from '../services/companyEventLinks.service.js';

async function loadStaffLink(req) {
  const id = Number(req.params.id);
  const token = String(req.params.token || '');
  if (!Number.isSafeInteger(id) || id <= 0 || !/^[a-f0-9]{48}$/.test(token)) return null;
  const [rows] = await pool.execute(`SELECT * FROM company_events WHERE id = ? AND staff_link_token = ?
    AND is_active = 1 AND COALESCE(school_event_status, '') <> 'canceled' LIMIT 1`, [id, token]);
  return rows[0] || null;
}
async function authorizedEvent(req, res) {
  const event = await loadStaffLink(req);
  if (!event) { res.status(404).json({ error: { message: 'Staff event link not found' } }); return null; }
  if (!req.user?.id || (!await isCompanyEventInvitee({ event, userId: req.user.id }) && !await canManageEventConversation(event, req.user))) {
    res.status(403).json({ error: { message: 'This private page is available to event invitees and coordinators.' } }); return null;
  }
  return event;
}

/** An unlisted invitation preview. Possession of this shared link never grants
 * access to staff identities, responses, messages, voting or work records. */
export async function getCompanyEventInvitationPreview(req, res, next) {
  try {
    const event = await loadStaffLink(req);
    if (!event || !isCompanyGathering(event)) return res.status(404).json({ error: { message: 'Event invitation not found' } });
    const operations = readEventOperations(event);
    const ids = [...new Set([Number(event.agency_id), ...operations.invitedAgencyIds.map(Number)])];
    const [agencies] = await pool.execute(`SELECT id,name,slug,portal_url,custom_domain,logo_path,color_palette FROM agencies WHERE id IN (${ids.map(() => '?').join(',')}) AND is_active=1`, ids);
    const host = agencies.find(agency => Number(agency.id) === Number(event.agency_id));
    const links = companyEventInvitationLinks(event, null, host);
    const providing = typeof event.organizer_providing_json === 'string' ? JSON.parse(event.organizer_providing_json || '[]') : event.organizer_providing_json || [];
    res.set?.('Cache-Control', 'no-store');
    res.set?.('X-Robots-Tag', 'noindex, nofollow');
    return res.json({
      event: { id: event.id, title: event.title, description: event.description || '', eventType: event.event_type,
        startsAt: event.starts_at, endsAt: event.ends_at, timezone: event.timezone, dateToBeDecided: !event.starts_at,
        eventLocationName: event.event_location_name || '', eventLocationAddress: event.event_location_address || '',
        rsvpDeadline: event.rsvp_deadline, potluckEnabled: !!event.potluck_enabled, organizerProviding: providing,
        heroImageUrl: event.public_hero_image_url || '', publicHeroFocalPoint: event.public_hero_focal_point || 'center' },
      branding: { agencyName: agencies.map(agency => agency.name).filter(Boolean).join(' + '), logoUrl: host?.logo_path || '' },
      agencies: agencies.map(agency => ({ name: agency.name, logoUrl: agency.logo_path || '' })),
      canonicalUrl: links.detailsUrl
    });
  } catch (error) { next(error); }
}
export async function getCompanyEventStaffLink(req, res, next) {
  try {
    const event = await authorizedEvent(req, res); if (!event) return;
    const operations = readEventOperations(event);
    const [[agency]] = await pool.execute('SELECT name,logo_path,color_palette FROM agencies WHERE id=?', [event.agency_id]);
    const [invitees, [responses], [organizers]] = await Promise.all([
      listCompanyEventInvitees({ event }),
      pool.execute('SELECT user_id,response_key FROM company_event_responses WHERE company_event_id=?', [event.id]),
      pool.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name FROM users u JOIN user_agencies ua ON ua.user_id=u.id
        WHERE ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
          AND u.terminated_at IS NULL AND COALESCE(u.is_demo,0)=0
          AND (u.id=? OR EXISTS(SELECT 1 FROM company_event_coordinators c WHERE c.company_event_id=? AND c.user_id=u.id))
        ORDER BY u.first_name,u.last_name`, [event.agency_id, event.created_by_user_id || 0, event.id])
    ]);
    const normalize = value => ({yes:'yes',y:'yes','1':'yes',maybe:'maybe',m:'maybe','3':'maybe',no:'no',n:'no','2':'no'})[String(value || '').toLowerCase()] || '';
    const responseByUser = new Map(responses.map(item => [Number(item.user_id), normalize(item.response_key)]));
    const attendees = invitees.filter(user => responseByUser.get(Number(user.id)) === 'yes')
      .map(user => ({ id: Number(user.id), name: user.name || [user.first_name,user.last_name].filter(Boolean).join(' ') }));
    const [needList] = event.potluck_enabled ? await pool.execute(`SELECT id,item_name,item_category,item_notes,claimed_by_user_id,claimed_by_guest_email FROM company_event_need_list_items WHERE company_event_id=? ORDER BY id`, [event.id]) : [[]];
    const now = Date.now();
    res.set?.('Cache-Control', 'no-store');
    return res.json({
      event: { id: event.id, agencyId: event.agency_id, title: event.title, description: event.description || '', eventType: event.event_type,
        startsAt: event.starts_at, endsAt: event.ends_at, timezone: event.timezone, dateToBeDecided: !event.starts_at,
        eventLocationName: event.event_location_name, eventLocationAddress: event.event_location_address,
        employeeReportTime: event.employee_report_time, rsvpDeadline: event.rsvp_deadline, rsvpMode: event.rsvp_mode,
        isWorkEvent: operations.isWorkEvent, mandatory: operations.mandatoryUserIds.includes(Number(req.user.id)),
        heroImageUrl: event.public_hero_image_url || '', publicHeroFocalPoint: event.public_hero_focal_point || 'center',
        organizerNames: organizers.map(user => [user.first_name,user.last_name].filter(Boolean).join(' ')).filter(Boolean),
        audienceLabel: `${invitees.length} invited ${invitees.length === 1 ? 'person' : 'people'}`,
        attendance: { invited: invitees.length, attending: attendees.length, maybe: invitees.filter(user => responseByUser.get(Number(user.id)) === 'maybe').length },
        attendees,
        potluckEnabled: !!event.potluck_enabled, organizerProviding: typeof event.organizer_providing_json === 'string' ? JSON.parse(event.organizer_providing_json || '[]') : event.organizer_providing_json || [],
        updates: operations.dashboardAnnouncements.filter(item => new Date(item.scheduledAt).getTime() <= now && (!item.endsAt || new Date(item.endsAt).getTime() > now)),
        response: responseByUser.get(Number(req.user.id)) || '', updatedAt: event.updated_at },
      branding: { agencyName: agency?.name || '', logoUrl: agency?.logo_path || '', colorPalette: agency?.color_palette || null },
      needList: needList.map(item => ({ id: item.id, name: item.item_name, category: item.item_category,
        custom: String(item.item_notes || '').startsWith('[INVITEE_CONTRIBUTION]'), openRequest: String(item.item_notes || '').startsWith('[OPEN_REQUEST_SLOT]'), claimed: !!(item.claimed_by_user_id || item.claimed_by_guest_email), mine: Number(item.claimed_by_user_id) === Number(req.user.id) })),
      canManage: await canManageEventConversation(event, req.user)
    });
  } catch (error) { next(error); }
}
export async function respondToCompanyEventStaffLink(req, res, next) {
  try {
    const event = await authorizedEvent(req, res); if (!event) return;
    if ((event.ends_at && new Date(event.ends_at) < new Date()) || (event.rsvp_deadline && new Date(event.rsvp_deadline) < new Date())) return res.status(409).json({ error: { message: 'Responses for this event are closed' } });
    const response = String(req.body?.response || '').toLowerCase();
    const labels = { yes: 'Yes', no: 'No', maybe: 'Maybe' };
    if (!labels[response]) return res.status(400).json({ error: { message: 'Choose yes, no, or maybe' } });
    if (event.potluck_enabled && response !== 'yes') await saveStaffPotluckContribution({
      eventId: Number(event.id), agencyId: Number(event.agency_id), userId: Number(req.user.id), itemId: null, customItemName: ''
    });
    const notes = String(req.body?.notes || '').trim().slice(0, 2000);
    await pool.execute(`INSERT INTO company_event_responses
      (company_event_id,user_id,response_key,response_label,response_body,source,received_at)
      VALUES (?,?,?,?,?,'in_app',NOW()) ON DUPLICATE KEY UPDATE response_key=VALUES(response_key),
      response_label=VALUES(response_label),response_body=VALUES(response_body),source='in_app',received_at=NOW()`,
    [event.id,req.user.id,response,labels[response],notes || response]);
    await pool.execute('UPDATE company_event_invitations SET response=?,responded_at=NOW() WHERE company_event_id=? AND user_id=?', [response,event.id,req.user.id]);
    return res.json({ ok: true, response, assigned: false, message: 'Thank you! Your RSVP was saved.' });
  } catch (error) { next(error); }
}
export async function updateCompanyEventStaffPotluck(req, res, next) {
  try {
    const event = await authorizedEvent(req, res); if (!event) return;
    await saveStaffPotluckContribution({eventId:Number(event.id),agencyId:Number(event.agency_id),userId:Number(req.user.id),itemId:req.body?.itemId,customItemName:req.body?.customItemName});
    return res.json({ok:true});
  } catch(error) {next(error);}
}
