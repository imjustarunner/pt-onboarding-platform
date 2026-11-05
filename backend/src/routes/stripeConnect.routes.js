import {requireBillingStaff} from '../services/familyLedger/policy.js';
import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { isIndependentPracticeOwner } from '../utils/independentPracticeOwner.js';
import {
  startConnect,
  getStripeStatus,
  getStripeDashboardLink,
  disconnectStripe
} from '../controllers/stripeConnect.controller.js';

const router = express.Router({ mergeParams: true });

// Merchant details are financial data. Every endpoint checks tenant billing access.
router.use(authenticate, async (req,res,next)=>{try{await requireBillingStaff(req.user,req.params.agencyId);res.set('Cache-Control','no-store');next();}catch(e){next(e);}});
const merchantAdmin=async(req,res,next)=>{try{
  if(['admin','agency_admin','super_admin','backoffice_admin'].includes(req.user.role)
    ||await isIndependentPracticeOwner(req.user.id,req.params.agencyId))return next();
  return res.status(403).json({error:{message:'An organization administrator must manage the payment account'}});
}catch(error){next(error);}};
router.post('/connect', merchantAdmin, startConnect);
router.get('/status',  getStripeStatus);
router.get('/dashboard-link', merchantAdmin, getStripeDashboardLink);
router.delete('/disconnect', merchantAdmin, disconnectStripe);

export default router;
