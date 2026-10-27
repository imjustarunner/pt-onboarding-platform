import { listGuardianInvitations, resendGuardianInvitation } from '../services/coGuardianDelivery.service.js';
export async function list(req, res, next) {
  try {
    const clientId=req.query.clientId==null?null:Number(req.query.clientId);
    if(clientId!==null&&(!Number.isSafeInteger(clientId)||clientId<1))return res.status(400).json({error:{message:'Invalid client'}});
    res.set('Cache-Control','no-store');res.json({ invitations: await listGuardianInvitations({ userId:req.user.id, agencyId:Number(req.query.agencyId),clientId }) });
  }
  catch (error) { next(error); }
}
export async function resend(req, res, next) {
  try { res.set('Cache-Control','no-store'); res.json(await resendGuardianInvitation({ userId:req.user.id, agencyId:Number(req.body.agencyId), inviteId:Number(req.params.inviteId), email:req.body.email })); }
  catch (error) { next(error); }
}
