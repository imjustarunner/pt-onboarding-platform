import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { fail } from '../services/auricwell/policy.js';
import * as archive from '../services/organizationAgreements.js';
const router=express.Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:3}});
const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const withoutBytes=record=>{ const {base64,...data}=record.data; return {...record,data}; };
router.use(authenticate,requireActiveStatus,(req,res,next)=>{
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  if(!['GET','HEAD','OPTIONS'].includes(req.method) && (req.get('X-Organization-Agreement')!=='1' || req.get('Sec-Fetch-Site')==='cross-site')) return next(fail(403,'Use the organization agreement workspace to make changes.'));
  next();
});
router.use(rateLimit({windowMs:15*60000,limit:200,standardHeaders:true,legacyHeaders:false}));
router.get('/organizations',run(async(req,res)=>res.json({organizations:await archive.organizations(req.user.id)})));
// Explicit async scope middleware; never accept an agency or actor from the body.
router.use('/:agencyId',async(req,res,next)=>{
  try { req.agreementScope=await archive.scopeFor(req.user.id,req.params.agencyId);next(); } catch(error) {next(error);}
});
router.get('/:agencyId',run(async(req,res)=>res.json({organization:req.agreementScope.organization,actor:{id:req.agreementScope.accountId,name:req.agreementScope.profile.name,operator:req.agreementScope.profile.operator},signers:await archive.signerOptions(req.agreementScope),documents:await archive.listArchive(req.agreementScope)})));
router.post('/:agencyId/agreements',run(async(req,res)=>res.status(201).json(await archive.agreementActions.create(req.agreementScope,{type:req.body?.type || 'baa'}))));
router.put('/:agencyId/agreements/:id',run(async(req,res)=>res.json(await archive.agreementActions.save(req.agreementScope,req.params.id,req.body))));
for(const action of ['approve','issue','sign','revise']) router.post(`/:agencyId/agreements/:id/${action}`,run(async(req,res)=>{
  req.agreementScope.signatureRequest={ipAddress:req.ip,userAgent:String(req.get('User-Agent') || '').slice(0,1000)};
  const args=['sign','approve'].includes(action)?[req.body]:[];
  res.json(await archive.agreementActions[action](req.agreementScope,req.params.id,...args));
}));
router.get('/:agencyId/agreements/:id/pdf',run(async(req,res)=>res.type('pdf').set('Content-Disposition','attachment; filename="organization-agreement.pdf"').send(await archive.downloadAgreement(req.agreementScope,req.params.id))));
router.get('/:agencyId/agreements/:id/html',run(async(req,res)=>res.type('html').set({'Content-Disposition':'attachment; filename="organization-agreement.html"','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"}).send(await archive.downloadHtml(req.agreementScope,req.params.id))));
router.post('/:agencyId/uploads',upload.single('file'),run(async(req,res)=>res.status(201).json(withoutBytes(await archive.uploadOriginal(req.agreementScope,req.body,req.file)))));
router.get('/:agencyId/uploads/:id/original',run(async(req,res)=>{
  const doc=await archive.downloadOriginal(req.agreementScope,req.params.id);
  res.type('pdf').set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`).send(doc.bytes);
}));
router.post('/:agencyId/uploads/:id/verify',run(async(req,res)=>res.json(withoutBytes(await archive.verifyExternal(req.agreementScope,req.params.id,req.body)))));
router.get('/:agencyId/documents/:id/audit',run(async(req,res)=>res.json(await archive.auditTrail(req.agreementScope,req.params.id))));
export default router;
