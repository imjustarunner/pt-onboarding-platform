import crypto from 'node:crypto';
import express from 'express';
import {runJobs} from '../controllers/narrivaComplianceReports.controller.js';

// Only this secret-authenticated POST bypasses the later staff JWT routers.
const router=express.Router({caseSensitive:true,strict:true});
router.post('/run-narriva-compliance',(req,res,next)=>{
 const expected=process.env.NARRIVA_REPORT_JOB_SECRET || process.env.BILLING_JOB_SECRET;
 const provided=req.get('x-billing-job-secret');
 if(!expected || typeof provided!=='string' || Buffer.byteLength(expected)!==Buffer.byteLength(provided) || !crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))return res.status(401).json({error:{message:'Unauthorized'}});
 next();
},runJobs);
export default router;
