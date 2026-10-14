import { requireProviderAvailabilityAccess } from '../services/providerAvailabilityAccess.service.js';
import { readContractSchedulingExpectation } from '../services/contractSchedulingExpectation.service.js';
export async function getContractSchedulingExpectation(req,res,next) {
  try {
    const providerId=Number(req.params.providerId),agencyId=Number(req.query.agencyId);
    if (![providerId,agencyId].every(id=>Number.isSafeInteger(id)&&id>0)) return res.status(400).json({error:{message:'Valid provider and agency are required.'}});
    await requireProviderAvailabilityAccess({actor:req.user,providerId,agencyId});
    res.set('Cache-Control','no-store');
    res.json(await readContractSchedulingExpectation({providerId,agencyId}));
  } catch(error) { if(error.status)return res.status(error.status).json({error:{message:error.message}}); next(error); }
}
