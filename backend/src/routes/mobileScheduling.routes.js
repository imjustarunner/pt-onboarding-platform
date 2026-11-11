import express from 'express';
import {mobileScheduling} from '../services/mobile/scheduling.service.js';
const router=express.Router();
function operation(name){return (req,res,next)=>{res.set('Cache-Control','no-store');req.mobileScheduleOperation=name;return mobileScheduling(req,res,next);};}
router.get('/actions',operation('actions'));
router.get('/options',operation('options'));
router.post('/appointments',operation('create'));
router.get('/appointments/:appointmentId',operation('detail'));
router.patch('/appointments/:appointmentId',operation('update'));
router.post('/appointments/:appointmentId/cancel',operation('cancel'));
export default router;
