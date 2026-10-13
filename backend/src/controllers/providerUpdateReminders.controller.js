import {assertAgencyAdmin} from '../services/providerUpdate.service.js';
import {providerUpdateReminders} from '../services/providerUpdateReminders.service.js';

export async function reminderSettings(req,res,next) {
  try {
    const agencyId=await assertAgencyAdmin(req.user,req.method==='GET'?req.query.agencyId:req.body.agencyId);
    const pushId=Number(req.params.pushId);
    if(!Number.isSafeInteger(pushId)||pushId<=0)return res.status(400).json({error:{message:'Choose a valid Provider Update.'}});
    const result=req.method==='GET'?await providerUpdateReminders.getSettings(pushId,agencyId):await providerUpdateReminders.saveSettings({pushId,agencyId,enabled:req.body.enabled,smsEnabled:req.body.smsEnabled,actorUserId:req.user.id});
    res.json(result);
  }catch(error){next(error);}
}
