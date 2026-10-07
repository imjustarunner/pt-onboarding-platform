import {isProviderUpdatePreviewToken} from '../services/providerUpdatePreviewLink.service.js';

export function protectProviderUpdatePreview(req,res,next) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  if (isProviderUpdatePreviewToken(req.params.token) && !['GET','HEAD'].includes(req.method)) {
    return res.status(403).json({error:{message:'This is a read-only preview. No staff information, signatures or completion time can be changed.'}});
  }
  next();
}
