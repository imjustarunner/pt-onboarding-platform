import CommunicationInbox from '../models/CommunicationInbox.model.js';
import { getAgencyEmailSettings } from '../services/emailSettings.service.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import { VACATION_ROLES, VACATION_SOURCES } from '../services/vacationResponderPolicy.js';
import { vacationDefaults, saveVacationDefaults, ownPlannedOuts, resolveVacation, saveVacationConfig } from '../services/vacationResponder.service.js';
const deny = (status, message) => { throw Object.assign(new Error(message), { status }); };
export async function vacationAccess(req, defaults = false) {
  const role = String(req.user?.role || '').toLowerCase();
  if (!VACATION_ROLES.includes(role)) deny(403, 'Vacation responders are available to workforce accounts.');
  const id = Number(req.query.agencyId || req.body.agencyId);
  if (!Number.isSafeInteger(id) || id <= 0) deny(400, 'Select an agency.');
  const memberships = await User.getAgencies(req.user.id);
  const membership = memberships.find(a => Number(a.id) === id);
  if (role !== 'super_admin' && !membership) deny(403, 'Access denied to this agency.');
  const canManageDefaults = role === 'super_admin' || ['admin', 'assistant_admin'].includes(String(membership?.agency_role || role));
  if (defaults && !canManageDefaults) deny(403, 'Agency administrators manage default templates.');
  const agency = await Agency.findById(id);
  if (!agency) deny(404, 'Agency not found.');
  return { agency, canManageDefaults };
}
export async function getVacationSettings(req, res, next) {
  try {
    const { agency, canManageDefaults } = await vacationAccess(req);
    const [defaults, config, plannedOuts] = await Promise.all([vacationDefaults(agency), resolveVacation(agency.id, req.user.id), ownPlannedOuts(agency.id, req.user.id)]);
    const [user, inbox, emailSettings] = await Promise.all([User.findById(req.user.id), CommunicationInbox.findPersonalForUser(agency.id, req.user.id), getAgencyEmailSettings(agency.id)]);
    res.json({ personalInboxReady: !!inbox?.sender_identity_id, agencyAutoRepliesEnabled: emailSettings.clientOooAutoReplyEnabled, agencyName: agency.name, providerName: [user.first_name, user.last_name].filter(Boolean).join(' '), defaults, config, plannedOuts, canManageDefaults, sources: VACATION_SOURCES, sourcesReviewedAt: '2026-10-10' });
  } catch (e) { next(e); }
}
export async function updateVacationSettings(req, res, next) {
  try {
    const { agency } = await vacationAccess(req);
    await saveVacationConfig(agency.id, req.user.id, req.body);
    res.json({ config: await resolveVacation(agency.id, req.user.id) });
  } catch (e) { next(e); }
}
export async function updateVacationDefaults(req, res, next) {
  try {
    const { agency } = await vacationAccess(req, true);
    await saveVacationDefaults(agency, req.user.id, req.body);
    res.json({ defaults: await vacationDefaults(agency) });
  } catch (e) { next(e); }
}
