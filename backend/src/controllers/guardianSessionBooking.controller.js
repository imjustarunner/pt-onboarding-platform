import {guardianBookingOptions,guardianBookingSlots,bookGuardianSession} from '../services/guardianSessionBooking.service.js';
const handle=fn=>async(req,res,next)=>{try {
  if(req.guardianPreviewMode)return res.status(403).json({error:{message:'Preview cannot book sessions.'}});
  const input={...req.query,...req.body,userId:req.user.id,clientId:Number(req.params.clientId)};
  res.json(await fn(input));
}catch(error){next(error);}};
export const options=handle(guardianBookingOptions);
export const slots=handle(guardianBookingSlots);
export const book=handle(bookGuardianSession);
