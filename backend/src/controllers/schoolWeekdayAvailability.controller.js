import User from '../models/User.model.js';
import { readSchoolWeekdays, writeSchoolWeekdays, requestSchoolWeekdayUpdates, updateSchoolProviderFocus } from '../services/schoolWeekdayAvailability.service.js';
const managers = ['super_admin', 'admin', 'support', 'staff'];
async function authorize(req, res, request = false) {
  const agencyId = Number(req.query.agencyId || req.body?.agencyId);
  const providerId = Number(req.params.providerId || req.body?.providerId || 0);
  if (!Number.isSafeInteger(agencyId) || agencyId < 1 || (!request && (!Number.isSafeInteger(providerId) || providerId < 1)) ||
      (request && (req.params.providerId != null || req.body?.providerId != null) && (!Number.isSafeInteger(providerId) || providerId < 1))) {
    res.status(400).json({ error: { message: 'Valid agency and provider are required.' } }); return;
  }
  const manager = managers.includes(req.user.role);
  if ((request && !manager) || (!request && Number(req.user.id) !== providerId && !manager)) {
    res.status(403).json({ error: { message: 'Access denied' } }); return;
  }
  if (req.user.role !== 'super_admin' && !(await User.getAgencies(req.user.id)).some(a => Number(a.id) === agencyId)) {
    res.status(403).json({ error: { message: 'Access denied for this agency' } }); return;
  }
  if (providerId && !(await User.getAgencies(providerId)).some(a => Number(a.id) === agencyId)) {
    res.status(404).json({ error: { message: 'Provider not found in this agency' } }); return;
  }
  return { agencyId, providerId, actorId: req.user.id };
}
function fail(error, res, next) { if (error.status) return res.status(error.status).json({ error: { message: error.message } }); next(error); }
export async function getSchoolWeekdays(req, res, next) {
  try { const ids = await authorize(req, res); if (ids) res.json(await readSchoolWeekdays(ids.providerId, ids.agencyId)); } catch (e) { fail(e, res, next); }
}
export async function putSchoolWeekdays(req, res, next) {
  try { const ids = await authorize(req, res); if (ids) res.json(await writeSchoolWeekdays({ ...ids, days: req.body.days })); } catch (e) { fail(e, res, next); }
}
export async function pushSchoolWeekdays(req, res, next) {
  try { const ids = await authorize(req, res, true); if (ids) { const result = await requestSchoolWeekdayUpdates(ids); res.status(result.failed.length ? 207 : 200).json(result); } } catch (e) { fail(e, res, next); }
}

export async function putSchoolProviderFocus(req, res, next) {
  try { const ids = await authorize(req, res, true); if (ids) res.json(await updateSchoolProviderFocus({ ...ids, serviceFocus: req.body.serviceFocus, expectedServiceFocus: req.body.expectedServiceFocus })); } catch (e) { fail(e, res, next); }
}
