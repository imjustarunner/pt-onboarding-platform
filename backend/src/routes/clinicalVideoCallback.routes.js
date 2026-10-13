import express from 'express';
import { verifyClinicalCallback, processClinicalCallback } from '../services/clinicalVideo.service.js';
const router=express.Router();
// Keep the exact previously configured address working while dashboard settings propagate.
// Both paths use raw bytes and the same signed-callback verification, never staff cookies.
export const clinicalVideoCallbackPaths = [
 '/api/clinical-video/events',
 '/api/voice-video/video/webhook/api/clinical-video/events'
];
// Mounted before JSON parsing and body logging to verify exact signed bytes.
router.post('/',express.raw({type:'application/json',limit:'64kb'}),async(req,res)=>{
 try {
  const event=verifyClinicalCallback(req.body,req.get('Authorization'));
  await processClinicalCallback(event);
  res.sendStatus(204);
 }catch(error){
  const message=error.status?error.message:'Video event processing is unavailable.';
  // Operational diagnostics only: never log signatures, raw callbacks, or participant data.
  console.warn(JSON.stringify({severity:'WARNING',component:'clinical_video_callback',status:error.status||503,message}));
  res.status(error.status||503).json({error:{message}});
 }
});
export default router;
