import express from 'express';
import rateLimit from 'express-rate-limit';
import {publicDonations,createDonationCheckout,donorReceipt,makeDonationAnonymous} from '../services/finance/donations.js';

const router = express.Router();
router.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});next();});
const limit = rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false});
const receiptLimit = rateLimit({windowMs:15*60*1000,limit:120,standardHeaders:'draft-7',legacyHeaders:false});
const wrap = fn => async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
router.get('/',wrap(async(req,res)=>res.json(await publicDonations())));
router.post('/checkout',limit,wrap(async(req,res)=>res.json(await createDonationCheckout(req.body))));
router.post('/receipt',receiptLimit,wrap(async(req,res)=>res.json(await donorReceipt(req.body.receiptToken))));
router.post('/anonymous',limit,wrap(async(req,res)=>res.json(await makeDonationAnonymous(req.body.receiptToken))));
export default router;
