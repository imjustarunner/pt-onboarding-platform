import {getCallBillingReview,listCallBillingReviews,saveCallBillingReview} from '../services/callBillingReview.service.js';
const actor=req=>req.auricwellPreview?{...req.user,auricwellPreviewAgencyId:req.auricwellPreview.agencyId}:req.user;
export async function getCallBilling(req,res,next){try{res.set('Cache-Control','no-store');res.json(await getCallBillingReview(actor(req),Number(req.params.callLogId)));}catch(e){next(e);}}
export async function listCallBilling(req,res,next){try{res.set('Cache-Control','no-store');res.json(await listCallBillingReviews(actor(req),Number(req.query.agencyId)));}catch(e){next(e);}}
export async function putCallBilling(req,res,next){try{if(req.auricwellPreview)return res.status(403).json({error:{message:'Preview is read-only.'}});res.set('Cache-Control','no-store');res.json(await saveCallBillingReview(req.user,Number(req.params.callLogId),req.body));}catch(e){next(e);}}
