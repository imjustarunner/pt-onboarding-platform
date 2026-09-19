import {resolveChatReferral} from '../services/websiteChatReferral.service.js';
import {PUBLIC_SUPPORT_CATEGORIES} from '../services/publicAgencySupport.service.js';
import express from 'express';
import {
  getPublicAgencySupport,
  postPublicAgencySupportTicket,
  postItscoInternshipInquiry,
  patchPublicAgencySupportSettings
} from '../controllers/publicAgencySupport.controller.js';
import { publicAgencySupportTicketLimiter } from '../middleware/rateLimiter.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/:agencySlug/chat-referral/:token', async (req,res,next)=>{try{res.set('Cache-Control','no-store');const referral=await resolveChatReferral(req.params.agencySlug,req.params.token,{clicked:true});if(!referral)return res.status(404).json({error:{message:'This Live Chat referral has expired. You can still submit a ticket.'}});res.json({category:referral.category,categoryLabel:PUBLIC_SUPPORT_CATEGORIES.find(c=>c.id===referral.category)?.label,fromLiveChat:true});}catch(e){next(e);}});
router.get('/:agencySlug', getPublicAgencySupport);
router.patch('/:agencySlug/settings', authenticate, patchPublicAgencySupportSettings);
router.post('/itsco/internship-inquiries', publicAgencySupportTicketLimiter, postItscoInternshipInquiry);
router.post('/:agencySlug/tickets', publicAgencySupportTicketLimiter, postPublicAgencySupportTicket);

export default router;
