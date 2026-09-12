import express from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { createBusinessOnboardingService, BusinessOnboardingError, businessInvitationDeliveryStatus } from '../services/businessOnboarding.service.js';
import EmailService from '../services/email.service.js';
import { publicAppBaseUrl } from '../services/contactReminderToken.service.js';
const service=createBusinessOnboardingService({pool,resolveActiveStatus:()=>User._resolveUserStatus('active')});
export const publicBusinessOnboardingRouter=express.Router();
export const adminBusinessOnboardingRouter=express.Router();
const limit=rateLimit({windowMs:15*60*1000,max:15,standardHeaders:true,legacyHeaders:false,message:{error:{message:'Too many requests. Please try again later.'}}});
const run=fn=>async(req,res)=>{
  res.set('Cache-Control','no-store');
  try { await fn(req,res); } catch(error) {
    const expected=error instanceof BusinessOnboardingError;
    // Never forward driver errors, SQL parameters, passwords, or encrypted envelopes.
    res.status(expected?error.status:503).json({error:{message:expected?error.message:'This service is temporarily unavailable. Your request has not been confirmed; please try again.'}});
  }
};
publicBusinessOnboardingRouter.use(limit);
publicBusinessOnboardingRouter.post('/requests',run(async(req,res)=>{
  const [[page]]=await pool.execute("SELECT is_active FROM public_marketing_pages WHERE slug='ptco' LIMIT 1");
  if(!page?.is_active) return res.status(404).json({error:{message:'Business intake is not available.'}});
  res.status(201).json(await service.submit(req.body,req.get('Idempotency-Key')));
}));
publicBusinessOnboardingRouter.post('/invitation',run(async(req,res)=>res.json(await service.inspect(req.body.token))));
publicBusinessOnboardingRouter.post('/activate',run(async(req,res)=>res.status(201).json(await service.activate(req.body.token,req.body.password,req.body.authorized))));
adminBusinessOnboardingRouter.use(authenticate,requireSuperAdmin);
adminBusinessOnboardingRouter.get('/',run(async(req,res)=>res.json({requests:await service.list()})));
adminBusinessOnboardingRouter.post('/:id/decline',run(async(req,res)=>res.json(await service.decline(req.params.id,req.user.id))));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
adminBusinessOnboardingRouter.post('/:id/approve',run(async(req,res)=>{
  const invite=await service.approve(req.params.id,req.body.slug,req.user.id);
  const base=publicAppBaseUrl();
  const activationUrl=`${base}/p/ptco/start#invite=${invite.token}`;
  let emailStatus='not_requested';
  if(req.body.sendEmail===true) {
    try {
      const result=await EmailService.sendEmail({to:invite.email,subject:'Your Plot Twist HQ workspace invitation',fromName:'Plot Twist Co.',source:'manual',generatedByUserId:req.user.id,
        text:`Your workspace for ${invite.businessName} is approved. Set up your account within 7 days: ${activationUrl}\nIf you did not request this, do not activate the account.`,
        html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#171b2b"><img src="${escape(base)}/assets/ptco/logo-flat.png" width="64" height="64" alt="Plot Twist Co."><h1>Your next chapter starts here.</h1><p>Your workspace for <strong>${escape(invite.businessName)}</strong> is approved.</p><p>Create your account, then sign in to set up your company. This invitation expires in 7 days.</p><p><a style="display:inline-block;background:#8c1020;color:white;padding:14px 24px;border-radius:8px;text-decoration:none" href="${escape(activationUrl)}">Set up my workspace →</a></p><p>If you did not request this, do not activate the account.</p></div>`});
      emailStatus=businessInvitationDeliveryStatus(result);
    } catch { emailStatus='failed'; }
  }
  res.json({activationUrl,emailStatus,expiresInDays:7});
}));
