import Client from '../models/Client.model.js';
import { requireBillingStaff } from '../services/familyLedger/policy.js';
import { paymentFollowupPreview, sendPaymentFollowup } from '../services/clientPaymentFollowup.service.js';
import { billingError } from '../services/familyBillingPolicy.service.js';

async function scope(req){
  const client=await Client.findById(req.params.id);
  if(!client)throw billingError(404,'Client not found');
  await requireBillingStaff(req.user,client.agency_id);
  return {agencyId:Number(client.agency_id),clientId:Number(client.id)};
}
export async function previewClientPaymentFollowup(req,res,next){try{
  const {agencyId,clientId}=await scope(req);
  const preview=await paymentFollowupPreview(agencyId,clientId);
  const {senderId,...publicPreview}=preview;
  res.set('Cache-Control','no-store').json(publicPreview);
}catch(e){next(e);}}
export async function requestClientPaymentFollowup(req,res,next){try{
  const context=await scope(req);
  res.set('Cache-Control','no-store').json(await sendPaymentFollowup({...context,userId:req.user.id,requestKey:req.body.requestKey,reviewHash:req.body.reviewHash}));
}catch(e){next(e);}}
