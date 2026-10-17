import { listGuardianInvitations, resendGuardianInvitation } from '../services/coGuardianDelivery.service.js';
export async function list(req, res, next) {
  try { res.set('Cache-Control','no-store'); res.json({ invitations: await listGuardianInvitations({ userId:req.user.id, agencyId:Number(req.query.agencyId) }) }); }
  catch (error) { next(error); }
}
export async function resend(req, res, next) {
  try { res.set('Cache-Control','no-store'); res.json(await resendGuardianInvitation({ userId:req.user.id, agencyId:Number(req.body.agencyId), inviteId:Number(req.params.inviteId), email:req.body.email })); }
  catch (error) { next(error); }
}
