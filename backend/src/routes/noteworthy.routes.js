import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate,authenticateOptional } from '../middleware/auth.middleware.js';
import { signupLimiter,recoveryLimiter } from '../middleware/rateLimiter.middleware.js';
import service from '../services/noteworthyPayroll.service.js';
import readiness from '../services/noteworthyReadiness.service.js';

export function createNoteworthyRouter({payroll=service,dataReadiness=readiness,auth=authenticate,optionalAuth=authenticateOptional}={}) {
  const router=express.Router();
  for(const param of ['agencyId','userId','periodId'])router.param(param,(req,res,next,value)=>/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))?next():res.status(400).json({error:{code:'INVALID_IDENTIFIER',message:'Choose a valid payroll record.'}}));
  router.use(express.json({limit:'128kb'}));
  router.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
    if(!['GET','HEAD','OPTIONS'].includes(req.method) && (req.get('X-Noteworthy-Request')!=='1' || req.get('Sec-Fetch-Site')==='cross-site')) return res.status(403).json({error:{code:'REQUEST_CONFIRMATION_REQUIRED',message:'Use the NoteWorthy Payroll workspace to make changes.'}});
    next();
  });
  const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(error=>{
    if(error.status && error.status<500)return res.status(error.status).json({error:{code:error.code,message:error.message},...(error.activation?{activation:error.activation}:{}),...(error.readiness?{readiness:error.readiness}:{})});
    next(error);
  });
  router.post('/signup',signupLimiter,run(async(req,res)=>res.status(201).json(await payroll.signup(req.body))));
  router.post('/verify',recoveryLimiter,run(async(req,res)=>res.json(await payroll.verify(req.body?.token))));
  router.post('/resend-verification',recoveryLimiter,run(async(req,res)=>res.json(await payroll.resend(req.body?.email))));
  router.post('/accept-invite',recoveryLimiter,optionalAuth,run(async(req,res)=>res.json(await payroll.acceptInvite(req.body,req.user?.id))));
  router.use(auth);
  router.use(rateLimit({windowMs:15*60000,limit:150,standardHeaders:true,legacyHeaders:false}));
  router.post('/request-account-verification',recoveryLimiter,run(async(req,res)=>res.json(await payroll.requestAccountVerification(req.user.id))));
  router.get('/workspace',run(async(req,res)=>{
    const result=await payroll.workspace(req.user.id);
    result.practices=await Promise.all(result.practices.map(async p=>({...p,...(p.role==='owner'?{activation:await dataReadiness.activation(p.agencyId)}:{})})));
    res.json(result);
  }));
  router.post('/practices',run(async(req,res)=>res.status(201).json(await payroll.createPractice(req.user.id,req.body))));
  router.get('/practices/:agencyId/me/paystubs',run(async(req,res)=>res.json(await payroll.paystubs(req.user.id,Number(req.params.agencyId)))));
  router.post('/practices/:agencyId/activation',run(async(req,res)=>res.json(await dataReadiness.activate(req.user.id,Number(req.params.agencyId),req.body))));
  // Explicit route-level owner checks below keep injected/service tests and Express
  // parameter scopes identical; no employee identifiers are accepted from auth input.
  router.get('/practices/:agencyId/activation',run(async(req,res)=>{await payroll.owner(req.user.id,Number(req.params.agencyId));res.json(await dataReadiness.activation(Number(req.params.agencyId)));}));
  router.post('/practices/:agencyId/activation-request',run(async(req,res)=>{await payroll.owner(req.user.id,Number(req.params.agencyId));res.json(await dataReadiness.requestActivation(Number(req.params.agencyId),req.body));}));
  router.get('/practices/:agencyId/periods/:periodId/readiness',run(async(req,res)=>{await payroll.owner(req.user.id,Number(req.params.agencyId));res.json(await dataReadiness.payrollReadiness(Number(req.params.agencyId),Number(req.params.periodId)));}));
  router.get('/practices/:agencyId/roster',run(async(req,res)=>res.json(await payroll.roster(req.user.id,Number(req.params.agencyId)))));
  router.patch('/practices/:agencyId/roster/:userId',run(async(req,res)=>res.json(await payroll.updateRoster(req.user.id,Number(req.params.agencyId),Number(req.params.userId),req.body))));
  router.post('/practices/:agencyId/roster/:userId/invite',run(async(req,res)=>res.json(await payroll.invite(req.user.id,Number(req.params.agencyId),Number(req.params.userId),req.body))));
  router.get('/practices/:agencyId/rate-defaults',run(async(req,res)=>res.json(await payroll.rateDefaults(req.user.id,Number(req.params.agencyId)))));
  router.put('/practices/:agencyId/rate-defaults',run(async(req,res)=>res.json(await payroll.rateDefaults(req.user.id,Number(req.params.agencyId),req.body))));
  router.post('/practices/:agencyId/periods',run(async(req,res)=>res.status(201).json(await payroll.createPeriod(req.user.id,Number(req.params.agencyId),req.body))));
  return router;
}
export default createNoteworthyRouter();
