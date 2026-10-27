import pool from '../config/database.js';
import dayCancellation from '../services/providerDayCancellation.service.js';
import { assertAppointmentChangeAccess } from './appointment.controller.js';

const managers = new Set(['super_admin', 'superadmin', 'admin', 'agency_admin', 'backoffice_admin', 'staff', 'support', 'scheduler', 'front_desk']);
export async function authorizeDayCancellation(actor, providerId, agencyIds) {
  const role = String(actor?.role || '').toLowerCase();
  const deny = () => { throw Object.assign(new Error('Only the provider or authorized scheduling staff may cancel a day.'), { status: 403 }); };
  if (!actor?.id || ['client', 'client_guardian', 'guardian', 'family_member'].includes(role)) deny();
  const [[target]] = await pool.execute('SELECT id FROM users WHERE id=? AND COALESCE(is_active,1)=1 AND COALESCE(is_archived,0)=0', [providerId]);
  if (!target) deny();
  for (const agencyId of agencyIds) {
    const [[membership]] = await pool.execute(`SELECT ua.user_id FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id
      WHERE ua.user_id=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
      AND LOWER(COALESCE(a.organization_type,'agency')) IN ('agency','clubwebapp','life_coach','consultant')`, [providerId, agencyId]);
    if (!membership) deny();
    if (Number(actor.id) !== providerId && !managers.has(role)) {
      const [[assignment]] = await pool.execute('SELECT id FROM supervisor_assignments WHERE supervisor_id=? AND supervisee_id=? AND agency_id=? LIMIT 1', [actor.id, providerId, agencyId]);
      if (!assignment) deny();
    }
    if (!['super_admin', 'superadmin'].includes(role)) {
      const [[own]] = await pool.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND COALESCE(is_active,1)=1', [actor.id, agencyId]);
      if (!own) deny();
    }
  }
}
const appointmentAccess = (actor, appointment) => assertAppointmentChangeAccess({ user: actor }, appointment);
export async function resumeDayCancellation(req, res, next) {
  try { res.json(await dayCancellation.resume({ providerId: Number(req.params.providerId), date: req.query.date }, req.user, authorizeDayCancellation)); }
  catch (e) { if (e.status) return res.status(e.status).json({ error: { message: e.message } }); next(e); }
}
export async function previewDayCancellation(req, res, next) {
  try { res.json(await dayCancellation.preview({ ...req.body, providerId: Number(req.params.providerId) }, req.user, authorizeDayCancellation, appointmentAccess)); }
  catch (e) { if (e.status) return res.status(e.status).json({ error: { message: e.message } }); next(e); }
}
export async function applyDayCancellation(req, res, next) {
  try {
    // Token ownership is enforced by the service; provider path must match too.
    const result = await dayCancellation.apply(req.params.token, { ...req.body, providerId: Number(req.params.providerId) }, req.user, authorizeDayCancellation, appointmentAccess);
    res.json(result);
  } catch (e) { if (e.status) return res.status(e.status).json({ error: { message: e.message } }); next(e); }
}
