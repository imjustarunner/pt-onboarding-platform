import {createHash} from 'node:crypto';
import pool from '../config/database.js';
import {resolveRegisteredSmsSender,getSmsSender} from './smsCompliance.service.js';
import {buildSmsConsentDisclosure} from '../utils/smsConsentDisclosure.js';
import {validateSmsRegistration} from '../utils/smsCompliancePolicy.js';
import {normalizeSmsPhone} from '../utils/smsThreadIdentity.js';
import {validateSmsSignature,createSmsConsentRequest,signSmsConsentRequest} from './smsConsentRequest.service.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export async function hiringCommunicationContext(agencyId,userId=null) {
 const from=await resolveRegisteredSmsSender({agencyId,purpose:'workforce'});
 const sender=from?await getSmsSender(from):null;
 const disclosure=sender && !validateSmsRegistration(sender.registration).length?buildSmsConsentDisclosure(sender.registration,{signerRole:'staff',enrollmentCategory:'hiring'}):null;
 let preference=null;
 if(userId){const [[row]]=await pool.execute('SELECT p.channel,p.phone,p.reviewed_at,p.consent_request_id,r.activation_json FROM hire_communication_preferences p LEFT JOIN sms_consent_requests r ON r.id=p.consent_request_id WHERE p.user_id=? AND p.agency_id=?',[userId,agencyId]);preference=row||null;}
 let activation=preference?.activation_json;try{if(typeof activation==='string')activation=JSON.parse(activation);}catch{activation=null;}
 return {active:preference?.channel==='email_sms' && activation?.workforce?.activated===true && activation?.workforce?.choice==='yes',available:!!disclosure,disclosure,disclosureHash:disclosure?hash(disclosure):null,
   channel:preference?.channel||'email',phone:preference?.phone||'',reviewedAt:preference?.reviewed_at||null};
}
export function validateHiringChoice(input,context) {
 const channel=input?.channel??'email';
 if(!['email','email_sms'].includes(channel))fail('Choose email only or email and text.');
 if(channel==='email')return {channel,phone:null};
 if(!context.available)fail('Text enrollment is not available yet. Choose email only to continue.');
 const phone=normalizeSmsPhone(input.phone);
 const errors=validateSmsSignature({...input,choices:{workforce:'yes'},disclosure:context.disclosure,
   expectedHash:context.disclosureHash,expectedPhone:phone||''});
 if(!phone)errors.push('Enter a valid mobile number.');
 if(errors.length)fail(errors.join(' '));
 return {channel,phone};
}
export async function saveHiringChoice({userId,agencyId,input,source='portal',ip=null,userAgent=null}) {
 const context=await hiringCommunicationContext(agencyId,userId);
 const {channel,phone}=validateHiringChoice(input,context);
 let requestId=null;
 if(channel==='email_sms'){
  const from=await resolveRegisteredSmsSender({agencyId,purpose:'workforce'});
  const sender=await getSmsSender(from);
  const request=await createSmsConsentRequest({agencyId,numberId:sender.id,phone,signerRole:'staff',actorUserId:userId,enrollmentCategory:'hiring'});
  await signSmsConsentRequest({token:request.path.split('#')[1],input:{...input,phone,choices:{workforce:'yes'}},ip,userAgent});
  requestId=request.id;
 }
 await pool.execute(`INSERT INTO hire_communication_preferences (user_id,agency_id,channel,phone,consent_request_id,reviewed_at)
   VALUES (?,?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE channel=VALUES(channel),phone=VALUES(phone),consent_request_id=VALUES(consent_request_id),reviewed_at=VALUES(reviewed_at)`,
   [userId,agencyId,channel,phone,requestId]);
 return {...await hiringCommunicationContext(agencyId,userId),awaitingReview:channel==='email_sms'};
}
