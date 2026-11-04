import express from 'express';
import { verifyDialInWebhook } from '../services/meetingDialInTransport.service.js';
import { answerDialIn,enterDialInPin,chooseDialInHostOption,dialInCallEvent } from '../services/meetingDialIn.service.js';
const router=express.Router();
router.use(express.raw({type:'application/json',limit:'32kb'}));
for(const [path,handler] of Object.entries({answer:answerDialIn,pin:enterDialInPin,'host-option':chooseDialInHostOption,events:dialInCallEvent})) {
  router.post(`/${path}`,async(req,res)=>{
    try{
      const event=verifyDialInWebhook(req.body,req.get('Authorization'));
      const result=await handler(event);
      res.set('Cache-Control','no-store');
      if(path==='events')res.sendStatus(204);else res.json(result);
    }catch(error){
      // Never log raw callbacks, dialed PINs, caller numbers or bearer tokens.
      console.warn('[meeting-dial-in] Callback rejected',error.status||503);
      res.status(error.status||503).json({error:'Telephone joining is unavailable.'});
    }
  });
}
export default router;
