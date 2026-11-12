import express from 'express';
import {authenticate} from '../middleware/auth.middleware.js';
import {childcareContext,listChildcareStaff,saveChildcareGrant,getChildcareStaffRates,listChildcareShifts,getChildcareShift,createChildcareShift,updateChildcareShift,recordChildcareAction,previewChildcarePay} from '../services/childcare.service.js';

const router=express.Router();router.use(authenticate);
const run=work=>async(req,res,next)=>{try{res.json(await work(req));}catch(error){next(error);}};
const actor=req=>({userId:req.user.id,agencyId:req.query.agencyId});
router.get('/context',run(req=>childcareContext(actor(req))));
router.get('/staff',run(req=>listChildcareStaff(actor(req))));
router.get('/staff/:userId/rates',run(req=>getChildcareStaffRates({...actor(req),targetUserId:req.params.userId,asOfDate:req.query.asOfDate})));
router.put('/staff/:userId/grant',run(req=>saveChildcareGrant({...req.body,userId:req.user.id,targetUserId:req.params.userId})));
router.get('/shifts',run(req=>listChildcareShifts(actor(req))));
router.post('/shifts',run(req=>createChildcareShift({...req.body,userId:req.user.id})));
router.get('/shifts/:shiftId',run(req=>getChildcareShift({shiftId:req.params.shiftId,userId:req.user.id})));
router.patch('/shifts/:shiftId',run(req=>updateChildcareShift({...req.body,shiftId:req.params.shiftId,userId:req.user.id})));
router.get('/shifts/:shiftId/pay-preview',run(req=>previewChildcarePay({shiftId:req.params.shiftId,userId:req.user.id,targetUserId:req.query.userId})));
for(const action of ['clock-in','clock-out','attendance'])router.post(`/shifts/:shiftId/${action}`,run(req=>recordChildcareAction({...req.body,shiftId:req.params.shiftId,userId:req.user.id,action,now:new Date()})));
export default router;
