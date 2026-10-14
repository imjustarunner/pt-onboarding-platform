import {getAuricwellPricingDraft,saveAuricwellPricingDraft} from '../services/auricwellPricing.service.js';
function agencyId(req) {
  const id=Number(req.params.agencyId);
  if(!Number.isSafeInteger(id)||id<1)throw Object.assign(new Error('Invalid practice ID.'),{status:400});
  return id;
}
export async function getAuricwellPricing(req,res,next) {
  try {res.json(await getAuricwellPricingDraft(agencyId(req)));}catch(e){next(e);}
}
export async function saveAuricwellPricing(req,res,next) {
  try {res.json(await saveAuricwellPricingDraft(agencyId(req),req.user.id,req.body));}catch(e){next(e);}
}
