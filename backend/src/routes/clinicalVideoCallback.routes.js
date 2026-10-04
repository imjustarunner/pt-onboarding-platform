import express from 'express';
import { verifyClinicalCallback, processClinicalCallback } from '../services/clinicalVideo.service.js';
const router=express.Router();
// Mounted before JSON parsing and body logging to verify exact signed bytes.
router.post('/',express.raw({type:'application/json',limit:'64kb'}),async(req,res)=>{
 try {
  const event=verifyClinicalCallback(req.body,req.get('Authorization'));
  await processClinicalCallback(event);
  res.sendStatus(204);
 }catch(error){res.status(error.status||503).json({error:{message:error.status?error.message:'Video event processing is unavailable.'}});}
});
export default router;
