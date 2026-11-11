import pool from '../config/database.js';
import { readEventOperations } from '../utils/companyEventOperations.js';
import { isCompanyEventInvitee } from '../services/companyEventAudience.service.js';
import { canManageEventConversation } from '../services/companyEventConversation.service.js';
import { saveStaffPotluckContribution } from '../services/staffEventPotluck.service.js';

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
export async function getCompanyEventStaffLink(req, res, next) {
  try {
    const event = await authorizedEvent(req, res); if (!event) return;
    const operations = readEventOperations(event);
    const [[agency]] = await pool.execute('SELECT name,logo_path,color_palette FROM agencies WHERE id=?', [event.agency_id]);
    const [[response]] = await pool.execute('SELECT response_key FROM company_event_responses WHERE company_event_id=? AND user_id=?', [event.id, req.user.id]);
    const [needList] = event.potluck_enabled ? await pool.execute(`SELECT id,item_name,item_category,item_notes,claimed_by_user_id,claimed_by_guest_email FROM company_event_need_list_items WHERE company_event_id=? ORDER BY id`, [event.id]) : [[]];
    const now = Date.now();
    res.set?.('Cache-Control', 'no-store');
    return res.json({
      event: { id: event.id, agencyId: event.agency_id, title: event.title, description: event.description || '', eventType: event.event_type,
        startsAt: event.starts_at, endsAt: event.ends_at, timezone: event.timezone, dateToBeDecided: !event.starts_at,
        eventLocationName: event.event_location_name, eventLocationAddress: event.event_location_address,
        employeeReportTime: event.employee_report_time, rsvpDeadline: event.rsvp_deadline, rsvpMode: event.rsvp_mode,
        isWorkEvent: operations.isWorkEvent, mandatory: operations.mandatoryUserIds.includes(Number(req.user.id)),
        potluckEnabled: !!event.potluck_enabled, organizerProviding: typeof event.organizer_providing_json === 'string' ? JSON.parse(event.organizer_providing_json || '[]') : event.organizer_providing_json || [],
        updates: operations.dashboardAnnouncements.filter(item => new Date(item.scheduledAt).getTime() <= now && (!item.endsAt || new Date(item.endsAt).getTime() > now)),
        response: response?.response_key || '', updatedAt: event.updated_at },
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
