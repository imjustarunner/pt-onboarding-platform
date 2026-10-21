import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { requireBillingLink, positiveId, billingError } from '../services/familyBillingPolicy.service.js';
import { validCardFile } from '../services/insuranceCards/policy.js';
import { extractInsuranceCardFieldsBestEffort } from '../services/insuranceCardReading.service.js';
import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import {
  listGuardianPaymentCards,
  removeGuardianPaymentCard,
  listGuardianInsurance,
  getBillingOverview, acceptBillingResponsibility, assignBillingCard, revokeBillingRecurring, saveBillingInsurance, createPortalCardSetup, completePortalCardSetup,
  getDependentsSummary
} from '../controllers/guardianBilling.controller.js';

const router = express.Router();

router.use(authenticate, requireActiveStatus, (req,res,next)=>{res.set('Cache-Control','no-store');next();});

// Read into a draft only. The existing reviewed coverage endpoint performs
// every persistence/claim update; the photo is saved separately after review.
router.post('/insurance/read-card',rateLimit({windowMs:60000,max:12}),multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:2}}).single('file'),async(req,res,next)=>{
  try {
    const agencyId=positiveId(req.body.agencyId),clientId=positiveId(req.body.clientId);
    await requireBillingLink(req.user.id,clientId,agencyId);
    if(!validCardFile(req.file))throw billingError(400,'Choose a JPEG, PNG or PDF up to 10 MB.');
    const fields=await extractInsuranceCardFieldsBestEffort(req.file);
    res.json({fields:fields||{},needsReview:true,readable:!!fields&&Object.values(fields).some(Boolean)});
  }catch(error){next(error);}
});
router.get('/overview', getBillingOverview);
router.post('/clients/:clientId/responsibility', acceptBillingResponsibility);
router.post('/clients/:clientId/payment-method', assignBillingCard);
router.delete('/clients/:clientId/recurring', revokeBillingRecurring);
router.post('/insurance', saveBillingInsurance);
router.post('/card-setup', createPortalCardSetup);
router.post('/card-setup/complete', completePortalCardSetup);

router.get('/payment-cards', listGuardianPaymentCards);
router.delete('/payment-cards/:cardId', removeGuardianPaymentCard);
router.get('/insurance', listGuardianInsurance);
router.get('/dependents-summary', getDependentsSummary);

export default router;
