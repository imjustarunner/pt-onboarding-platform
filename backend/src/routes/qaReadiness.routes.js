import express from 'express';
import {authenticate} from '../middleware/auth.middleware.js';
import {positiveId} from '../services/familyBillingPolicy.service.js';
import {configureQaPaymentSimulation,configureQaTutorOffice} from '../services/qaReadiness.service.js';
const router=express.Router();
router.use(authenticate);
router.post('/payment-simulation',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await configureQaPaymentSimulation({user:req.user,agencyId:positiveId(req.body.agencyId),enabled:req.body.enabled}));}catch(error){next(error);}});
router.post('/tutoring-office',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await configureQaTutorOffice({user:req.user,agencyId:positiveId(req.body.agencyId),tutorUserId:positiveId(req.body.tutorUserId)}));}catch(error){next(error);}});
export default router;
