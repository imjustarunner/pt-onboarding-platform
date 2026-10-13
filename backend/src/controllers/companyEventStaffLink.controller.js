import pool from '../config/database.js';
import { EVENT_STAFF_ROLES_SQL } from '../utils/companyEventOperations.js';
import { getCompanyEventPublic } from './companyEvents.controller.js';

async function loadStaffLink(req) {
  const id = Number(req.params.id);
  const token = String(req.params.token || '');
  if (!Number.isSafeInteger(id) || id <= 0 || !/^[a-f0-9]{48}$/.test(token)) return null;
  const [rows] = await pool.execute(`SELECT * FROM company_events WHERE id = ? AND staff_link_token = ?
    AND is_active = 1 AND COALESCE(school_event_status, '') <> 'canceled' LIMIT 1`, [id, token]);
  return rows[0] || null;
}

export async function getCompanyEventStaffLink(req, res, next) {
  try {
    if (!await loadStaffLink(req)) return res.status(404).json({ error: { message: 'Staff event link not found' } });
    req.companyEventStaffLink = true;
    return getCompanyEventPublic(req, res, next);
  } catch (error) { next(error); }
}

export async function respondToCompanyEventStaffLink(req, res, next) {
  try {
    const event = await loadStaffLink(req);
    if (!event) return res.status(404).json({ error: { message: 'Staff event link not found' } });
    const [members] = await pool.execute(`SELECT u.id FROM user_agencies ua JOIN users u ON u.id = ua.user_id
      WHERE ua.agency_id = ? AND ua.user_id = ? AND COALESCE(ua.is_active, 1) = 1 AND u.is_active = 1 AND COALESCE(u.is_archived, 0) = 0 AND u.terminated_at IS NULL
      AND u.role IN (${EVENT_STAFF_ROLES_SQL}) LIMIT 1`, [event.agency_id, req.user.id]);
    if (!members.length) return res.status(403).json({ error: { message: 'Sign in with a staff account for this agency' } });
    if (new Date(event.ends_at) < new Date() || event.voting_closed_at || (event.rsvp_deadline && new Date(event.rsvp_deadline) < new Date())) {
      return res.status(409).json({ error: { message: 'Responses for this event are closed' } });
    }
    const response = String(req.body?.response || '').toLowerCase();
    const labels = { yes: 'Interested — awaiting assignment', no: 'Not available', maybe: 'Maybe' };
    if (!labels[response]) return res.status(400).json({ error: { message: 'Choose yes, no, or maybe' } });
    const notes = String(req.body?.notes || '').trim().slice(0, 2000);
    await pool.execute(`INSERT INTO company_event_responses
      (company_event_id, user_id, response_key, response_label, response_body, source, received_at)
      VALUES (?, ?, ?, ?, ?, 'in_app', NOW()) ON DUPLICATE KEY UPDATE response_key = VALUES(response_key),
      response_label = VALUES(response_label), response_body = VALUES(response_body), source = 'in_app', received_at = NOW()`,
    [event.id, req.user.id, response, labels[response], notes || response]);
    return res.json({ ok: true, response, assigned: false, message: response === 'yes' ? 'Your interest was recorded. A coordinator will confirm assignments.' : 'Your response was saved.' });
  } catch (error) { next(error); }
}
