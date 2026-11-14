import express from 'express';
import {authenticate} from '../middleware/auth.middleware.js';
import {getFamilyBillingSummary} from '../services/familyBilling.service.js';
import {assertQaSimulationScope,confirmQaPaymentIntent,createQaTestCard,qaPaymentSimulationConfig,listOwnQaPayments,getQaPaymentIntent,qaSimulationAccount} from '../services/qaPaymentSimulator.service.js';
import {positiveId,billingError} from '../services/familyBillingPolicy.service.js';

const router=express.Router();
router.use(authenticate);
const context=req=>({agencyId:positiveId(req.body?.agencyId||req.query?.agencyId),userId:positiveId(req.user?.id)});
router.get('/config',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json({feature:'qa_payment_simulator_v1',...await qaPaymentSimulationConfig(context(req).agencyId)});}catch(error){next(error);}});
router.post('/intents/:id/confirm',async(req,res,next)=>{
 try{
  const c=context(req);
  const intent=await confirmQaPaymentIntent({...c,id:req.params.id,testCard:req.body?.testCard,scenario:req.body?.scenario});
  if(intent.status==='succeeded'){
   const saved=await getQaPaymentIntent(intent.id,c.agencyId);
   if(saved.sourceKind==='family_ledger'){
    const {reconcileSavedPayment}=await import('../services/familyLedger/payments.js');
    await reconcileSavedPayment({agencyId:c.agencyId,paymentId:Number(saved.sourceId)});
   }else if(saved.sourceKind==='family_charge'){
    const {reconcileFamilyPayment}=await import('../services/familyBillingPayment.service.js');
    await reconcileFamilyPayment(saved,qaSimulationAccount(c.agencyId),{simulated:true});
   }
  }
  res.set('Cache-Control','no-store').json({paymentIntent:intent});
 }catch(error){next(error);}
});
router.get('/intents',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json({payments:await listOwnQaPayments(context(req))});}catch(error){next(error);}});
router.post('/cards',async(req,res,next)=>{
 try{
  const c=context(req);await assertQaSimulationScope(c);
  const summary=await getFamilyBillingSummary(c.userId,c.agencyId);
  if(!summary.clients.some(client=>client.canManageBilling&&!client.medicaid))throw billingError(403,'Accept financial responsibility for an eligible non-Medicaid client first.');
  const result=await createQaTestCard({...c,testCard:req.body?.testCard,scenario:req.body?.scenario,requestKey:req.body?.requestKey,name:req.body?.name,consent:req.body?.consent,ip:req.ip,userAgent:req.get('user-agent')});
  res.set('Cache-Control','no-store').json(result);
 }catch(error){next(error);}
});
export default router;
