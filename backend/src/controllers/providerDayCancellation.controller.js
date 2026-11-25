import pool from '../config/database.js';
import dayCancellation from '../services/providerDayCancellation.service.js';
import { assertAppointmentChangeAccess } from './appointment.controller.js';

const managers = new Set(['super_admin', 'superadmin', 'admin', 'agency_admin', 'backoffice_admin', 'staff', 'support', 'scheduler', 'front_desk']);
const roleOf = actor => String(actor?.role || '').trim().toLowerCase();
const isSuperAdmin = role => ['super_admin', 'superadmin'].includes(role);
const accessDenied = () => Object.assign(new Error('Choose an organization where the provider has an active schedule and you have scheduling access.'), { status: 403 });
export const isDayCancellationStaff = actor => managers.has(roleOf(actor));

async function dayCancellationAgencies(actor, providerId) {
  const role = roleOf(actor);
  const actorId = Number(actor?.id);
  if (!actorId || !Number.isSafeInteger(providerId) || providerId < 1
    || ['client', 'client_guardian', 'guardian', 'family_member'].includes(role)) throw accessDenied();
  const [rows] = await pool.execute(`SELECT DISTINCT a.id, a.name
    FROM users p JOIN user_agencies membership ON membership.user_id=p.id
    JOIN agencies a ON a.id=membership.agency_id
    WHERE p.id=? AND COALESCE(p.is_active,1)=1 AND COALESCE(p.is_archived,0)=0
      AND COALESCE(membership.is_active,1)=1
      AND LOWER(COALESCE(a.organization_type,'agency')) IN ('agency','clubwebapp','life_coach','consultant')
      AND (? OR EXISTS (SELECT 1 FROM user_agencies own
        WHERE own.user_id=? AND own.agency_id=a.id AND COALESCE(own.is_active,1)=1))
      AND (? OR EXISTS (SELECT 1 FROM supervisor_assignments assignment
        WHERE assignment.supervisor_id=? AND assignment.supervisee_id=p.id AND assignment.agency_id=a.id))
    ORDER BY a.name, a.id`, [providerId, isSuperAdmin(role), actorId, actorId === providerId || isDayCancellationStaff(actor), actorId]);
  return rows;
}

export async function authorizeDayCancellation(actor, providerId, agencyIds) {
  const allowed = new Set((await dayCancellationAgencies(actor, providerId)).map(agency => Number(agency.id)));
  if (!allowed.size || agencyIds.some(id => !allowed.has(Number(id)))) throw accessDenied();
}

export async function listDayCancellationAgencies(req, res, next) {
  try {
    const agencies = await dayCancellationAgencies(req.user, Number(req.params.providerId));
    if (!agencies.length) throw accessDenied();
    res.set('Cache-Control', 'no-store');
    res.json({ agencies });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: { message: e.message } }); next(e); }
}
const appointmentAccess = (actor, appointment) => assertAppointmentChangeAccess({ user: actor }, appointment);
export async function resumeDayCancellation(req, res, next) {
  try { res.json(await dayCancellation.resume({ providerId: Number(req.params.providerId), date: req.query.date, token: req.query.token }, req.user, authorizeDayCancellation)); }
  catch (e) { if (e.status) return res.status(e.status).json({ error: { message: e.message } }); next(e); }
}
export async function previewDayCancellation(req, res, next) {
  try { res.json(await dayCancellation.preview({ ...req.body, absenceSource: 'cancel_day', providerId: Number(req.params.providerId) }, req.user, authorizeDayCancellation, appointmentAccess)); }
  catch (e) { if (e.status) return res.status(e.status).json({ error: { message: e.message } }); next(e); }
}
export async function rewriteDayCancellation(req, res, next) {
  try {
    const agencyId = Number(req.body?.agencyId);
    if (!agencyId) throw Object.assign(new Error('Choose the agency for this letter.'), { status: 400 });
    await authorizeDayCancellation(req.user, Number(req.params.providerId), [agencyId]);
    const { rewriteAbsenceLetter } = await import('../services/dayCancellationRewrite.service.js');
    res.json(await rewriteAbsenceLetter({ text: req.body?.text, tone: req.body?.tone, audience: req.body?.audience }));
  } catch (e) { if (e.status) return res.status(e.status).json({ error: { message: e.message } }); next(e); }
}
export async function previewDayCancellationEmail(req, res, next) {
  try {
    const agencyId = Number(req.body?.agencyId);
    if (!agencyId) throw Object.assign(new Error('Choose the agency for this letter.'), { status: 400 });
    await authorizeDayCancellation(req.user, Number(req.params.providerId), [agencyId]);
    const { previewCancellationEmail } = await import('../services/cancellationEmailPreview.service.js');
    let school=false,clientId=null,learning=false;
    if(req.body?.reviewToken){
      // Resolve branding from the actor-owned review, never a browser-supplied
      // client ID, school flag, or company-wide school feature.
      const {review}=await dayCancellation.resume({providerId:Number(req.params.providerId),date:req.body.date,token:req.body.reviewToken},req.user,authorizeDayCancellation);
      const item=review?.items.find(item=>item.key===req.body.itemKey && Number(item.agencyId)===agencyId);
      if(!item)throw Object.assign(new Error('This email is not part of your cancellation review.'),{status:404});
      school=['school','school_roster'].includes(item.kind);
      clientId=Number(item.clients?.[0]?.clientId)||null;
      if(item.kind==='appointment'){
        const appointment=await (await import('../models/Appointment.model.js')).default.findById(item.id);
        if(!appointment || Number(appointment.agencyId)!==agencyId)throw Object.assign(new Error('This appointment is no longer available.'),{status:404});
        await appointmentAccess(req.user,appointment);
        learning=['learning','tutoring'].includes(String(appointment.businessType||'').toLowerCase());
      }
    }
    res.set('Cache-Control', 'no-store');
    res.json(await previewCancellationEmail({ agencyId, subject: req.body?.subject, text: req.body?.text, school,clientId,learning }));
  } catch (e) { if (e.status) return res.status(e.status).json({ error: { message: e.message } }); next(e); }
}
export async function applyDayCancellation(req, res, next) {
  try {
    // Token ownership is enforced by the service; provider path must match too.
    const result = await dayCancellation.apply(req.params.token, { ...req.body, providerId: Number(req.params.providerId) }, req.user, authorizeDayCancellation, appointmentAccess);
    res.json(result);
  } catch (e) { if (e.status) return res.status(e.status).json({ error: { message: e.message } }); next(e); }
}
