import pool from '../config/database.js';
import {createHash} from 'node:crypto';
import {getStaffCommunicationChoices} from '../services/staffCommunicationChoices.service.js';
import {getSmsSender} from '../services/smsCompliance.service.js';
import {buildSmsConsentDisclosure} from '../utils/smsConsentDisclosure.js';
import {validateSmsRegistration} from '../utils/smsCompliancePolicy.js';
import {createSmsConsentRequest,signSmsConsentRequest,validateSmsSignature} from '../services/smsConsentRequest.service.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function portalStaffEnrollments(req,res,next){
 try {
  if(req.portalUser.status!=='ONBOARDING')throw Object.assign(new Error('Staff enrollment is available during onboarding.'),{status:403});
  const [[agency]]=await pool.execute('SELECT agency_id FROM user_agencies WHERE user_id=? LIMIT 1',[req.portalUser.id]);
  const agencyId=agency?.agency_id;
  const choices=await getStaffCommunicationChoices({userId:req.portalUser.id,agencyId});
  const [numbers]=await pool.execute(`SELECT n.id,n.phone_number FROM twilio_numbers n JOIN sms_sender_registrations s ON s.number_id=n.id
    WHERE n.agency_id=? AND n.is_active=TRUE AND n.status <> 'released' ORDER BY n.id`,[agencyId]);
  const programs=[];const campaigns=new Set();
  for(const number of numbers){
   const sender=await getSmsSender(number.phone_number);
   if(validateSmsRegistration(sender.registration).length||campaigns.has(sender.campaign_id)||!sender.registration.purposes.some(p=>['workforce','polling'].includes(p)))continue;
   campaigns.add(sender.campaign_id);
   const disclosure=buildSmsConsentDisclosure(sender.registration,{signerRole:'staff'});
   const [[signed]]=await pool.execute(`SELECT id,activation_json FROM sms_consent_requests WHERE agency_id=? AND number_id=? AND phone=? AND signer_role='staff'
     AND signed_at IS NOT NULL AND disclosure_hash=? AND JSON_EXTRACT(disclosure_json,'$.enrollmentCategory') IS NULL ORDER BY signed_at DESC,id DESC LIMIT 1`,[agencyId,number.id,choices.phone,hash(disclosure)]);
   programs.push({numberId:number.id,disclosure,disclosureHash:hash(disclosure),phoneLastFour:choices.phone.slice(-4),signed:!!signed});
  }
  if(req.method==='GET')return res.json({programs,phone:choices.phone});
  const program=programs.find(p=>p.numberId===Number(req.body?.numberId));
  if(!program)throw Object.assign(new Error('This text program is unavailable.'),{status:400});
  const problems=validateSmsSignature({...req.body,disclosure:program.disclosure,expectedHash:program.disclosureHash,expectedPhone:choices.phone});
  if(problems.length)throw Object.assign(new Error(problems.join(' ')),{status:400});
  const request=await createSmsConsentRequest({agencyId,numberId:program.numberId,phone:choices.phone,signerRole:'staff',actorUserId:req.portalUser.id});
  res.json(await signSmsConsentRequest({token:request.path.split('#')[1],input:req.body,ip:req.ip,userAgent:req.get('user-agent')}));
 }catch(error){next(error);}
}
