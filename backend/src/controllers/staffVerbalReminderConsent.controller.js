import {staffReminderConsentContext,recordStaffVerbalReminderConsent} from '../services/staffVerbalReminderConsent.service.js';
import Sms from '../services/vonage.service.js';
import {logClientAccess} from '../services/clientAccessLog.service.js';
export async function getStaffReminderConsent(req,res,next){
 try{const result=await staffReminderConsentContext(req.user,req.params.id);await logClientAccess(req,Number(req.params.id),'view_reminder_text_consent');res.set('Cache-Control','no-store').json(result);}catch(error){next(error);}
}
export async function saveStaffReminderConsent(req,res,next){
 try{const result=await recordStaffVerbalReminderConsent({user:req.user,clientId:req.params.id,input:req.body||{},sendConfirmation:message=>Sms.sendSms(message)});res.set('Cache-Control','no-store').json(result);}catch(error){next(error);}
}
