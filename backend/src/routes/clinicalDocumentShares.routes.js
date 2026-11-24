import {Router} from 'express';
import rateLimit from 'express-rate-limit';
import {authenticate} from '../middleware/auth.middleware.js';
import {requireClinicalStaffSecurity} from '../middleware/clinicalStaffSecurity.middleware.js';
import * as shares from '../services/clinicalDocumentShares.service.js';

const secure = (_req,res,next) => {
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});
  next();
};
const sendError = (res,error) => res.status(error.status||503).json({error:{
  message:error.status?error.message:'The document request is temporarily unavailable. Please try again.'
}});
const json = handler => async (req,res) => {
  try { res.json(await handler(req)); } catch(error) { sendError(res,error); }
};
const sendPdf = handler => async(req,res) => {
  try {
    const bytes=await handler(req);
    res.type('application/pdf').set('Content-Disposition','attachment; filename="document.pdf"').send(bytes);
  } catch(error) { sendError(res,error); }
};

const staff=Router();
staff.use(secure,authenticate,requireClinicalStaffSecurity);
staff.get('/clients/:id/filed-files/:itemId',sendPdf(req=>shares.readFiledRequestFile(req.user,req.params.id,req.params.itemId)));
staff.get('/clients/:id',json(req=>shares.listDocumentRequests(req.user,req.params.id)));
staff.get('/clients/:id/related',json(req=>shares.documentShareRelatedClients(req.user,req.params.id,req.query.agencyId,req.query.recipient)));
staff.post('/clients/:id/preview',json(req=>shares.previewDocumentShare(req.user,req.params.id,req.body)));
staff.post('/clients/:id/send',json(req=>shares.sendDocumentShare(req.user,req.params.id,req.body)));
staff.post('/:id/resend',json(req=>shares.resendDocumentRequest(req.user,req.params.id,req.body.channel)));
staff.post('/:id/revoke',json(req=>shares.revokeDocumentRequest(req.user,req.params.id)));

const guest=Router();
const cookie='auricwell_document_request';
const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/public/clinical-document-requests',maxAge:60*60*1000};
guest.use(secure,rateLimit({windowMs:60000,max:60,standardHeaders:true,legacyHeaders:false}));
guest.post('/redeem',rateLimit({windowMs:60000,max:10,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{
  try {
    const session=await shares.redeemDocumentLink(req.body.token);
    res.cookie(cookie,session,cookieOptions).json({ready:true});
  } catch(error) { sendError(res,error); }
});
guest.get('/session',json(req=>shares.documentSession(req.cookies?.[cookie])));
guest.get('/items/:id',json(req=>shares.readSessionItem(req.cookies?.[cookie],req.params.id)));
guest.get('/items/:id/file',sendPdf(req=>shares.sessionItemFile(req.cookies?.[cookie],req.params.id)));
guest.post('/items/:id/submit',json(req=>shares.submitSessionItem(req.cookies?.[cookie],req.params.id,req.body)));

const portal=Router();
portal.use(secure,authenticate);
portal.get('/clients/:id/files',json(req=>shares.portalRequestFiles(req.user,req.params.id)));
portal.get('/files/:id',sendPdf(req=>shares.portalRequestFile(req.user,req.params.id)));
portal.post('/files/:id/submit',json(req=>shares.submitPortalFile(req.user,req.params.id,req.body)));
export {staff as clinicalDocumentShareRoutes,guest as publicClinicalDocumentShareRoutes,portal as portalClinicalDocumentShareRoutes};
