import {getUserCapabilities} from '../utils/capabilities.js';
import {requireBackofficeAdmin} from './auth.middleware.js';

// The marker is set only by the authenticated product policy after checking
// the selected company and exact hiring resource. It is never client input.
export function requirePlotlineHiringOrBackoffice(req,res,next) {
  if(req.plotlineHiringAgencyId){
    if(getUserCapabilities(req.user).canManageHiring)return next();
    return res.status(403).json({error:{message:'Hiring access is required for this company.'}});
  }
  return requireBackofficeAdmin(req,res,next);
}
