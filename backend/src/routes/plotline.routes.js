import express from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import {authenticate,authenticateOptional} from '../middleware/auth.middleware.js';
import service from '../services/plotlineSelfService.service.js';
import {plotlineCaptchaConfig,protectPlotlineSignup} from '../services/plotlineSignupProtection.service.js';

export function createPlotlineRouter({setup=service,auth=authenticate,optionalAuth=authenticateOptional,protect=protectPlotlineSignup,captcha=plotlineCaptchaConfig}={}) {
 const router=express.Router();
 router.use(rateLimit({windowMs:15*60000,limit:300,standardHeaders:true,legacyHeaders:false}));
 const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(error=>{
  if(error.status&&error.status<500)return res.status(error.status).json({error:{code:error.code,message:error.message}});
  // No body/token, mail URL, database detail or credential in public errors.
  if(error.status===503)return res.status(503).json({error:{code:error.code,message:error.message}});
  next(error);
 });
 router.use(express.json({limit:'64kb'}));
 router.use((req,res,next)=>{
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&(req.get('X-Plotline-Request')!=='1'||req.get('Sec-Fetch-Site')==='cross-site'))return res.status(403).json({error:{code:'REQUEST_CONFIRMATION_REQUIRED',message:'Use Plotline to make this change.'}});
  next();
 });
 const publicLimit=rateLimit({windowMs:15*60000,limit:10,standardHeaders:true,legacyHeaders:false});
 router.get('/availability',optionalAuth,run(async(req,res)=>res.json({...await setup.availability(req.user?.id),captcha:captcha()})));
 router.get('/logos/:slug.webp',run(async(req,res)=>res.type('webp').send(await setup.publicLogo(req.params.slug))));
 router.post('/verification',publicLimit,optionalAuth,run(async(req,res)=>{await setup.assertEnabled(req.user?.id);await protect(req);res.status(202).json(await setup.requestVerification(req.body,req.user?.id,{ip:req.ip}));}));
 router.post('/verify',publicLimit,optionalAuth,run(async(req,res)=>res.json(await setup.verify(req.body,req.user?.id))));
 router.use(auth);
 router.use(rateLimit({windowMs:15*60000,limit:150,standardHeaders:true,legacyHeaders:false}));
 router.param('agencyId',(req,res,next,value)=>/^[1-9]\d*$/.test(value)&&Number.isSafeInteger(Number(value))?next():res.status(400).json({error:{message:'Choose a valid company.'}}));
 router.get('/workspace',run(async(req,res)=>res.json(await setup.workspace(req.user.id))));
 router.post('/drafts',run(async(req,res)=>res.status(201).json(await setup.startDraft(req.user.id,req.body))));
 router.get('/drafts/:draftId',run(async(req,res)=>res.json(await setup.readDraft(req.user.id,req.params.draftId))));
 router.put('/drafts/:draftId',run(async(req,res)=>res.json(await setup.saveDraft(req.user.id,req.params.draftId,req.body))));
 router.post('/drafts/:draftId/logo',multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}}).single('logo'),run(async(req,res)=>res.json(await setup.logo(req.user.id,req.params.draftId,req.file,req.body.revision))));
 router.get('/drafts/:draftId/logo',run(async(req,res)=>res.type('webp').send(await setup.draftLogo(req.user.id,req.params.draftId))));
 router.post('/copy-suggestion',run(async(req,res)=>res.json(setup.copy(req.body))));
 router.post('/companies',run(async(req,res)=>res.status(201).json(await setup.createCompany(req.user.id,req.body))));
 router.get('/companies/:agencyId',run(async(req,res)=>res.json(await setup.company(req.user.id,Number(req.params.agencyId)))));
 router.get('/companies/:agencyId/brand',run(async(req,res)=>res.json(await setup.brandDraft(req.user.id,Number(req.params.agencyId)))));
 router.post('/companies/:agencyId/logo',multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}}).single('logo'),run(async(req,res)=>res.json(await setup.companyLogo(req.user.id,Number(req.params.agencyId),req.file,req.body.revision))));
 router.put('/companies/:agencyId/brand',run(async(req,res)=>res.json(await setup.saveBrand(req.user.id,Number(req.params.agencyId),req.body))));
 router.post('/companies/:agencyId/publication',run(async(req,res)=>res.json(await setup.publish(req.user.id,Number(req.params.agencyId),req.body))));
 router.post('/companies/:agencyId/continuation',run(async(req,res)=>res.json(await setup.continuation(req.user.id,Number(req.params.agencyId)))));
 router.get('/companies/:agencyId/audit',run(async(req,res)=>res.json(await setup.events(req.user.id,Number(req.params.agencyId)))));
 router.use((error,req,res,next)=>{
  if(error instanceof multer.MulterError)return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:{code:'INVALID_LOGO_UPLOAD',message:'Use one PNG, JPEG or WebP logo up to 5 MB. Your saved brand is unchanged.'}});
  next(error);
 });
 return router;
}
export default createPlotlineRouter();
