import crypto from 'node:crypto';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { attendanceLetterText } from '../../../frontend/src/navigation/attendanceLetter.js';
const fail = (status,message) => Object.assign(new Error(message),{status});
// Leave clinical-pool connections available to the existing signing/share transactions.
function createDeliverySlots() {
 let active=0;const waiters=[];
 const release=()=>{const next=waiters.shift();if(next){clearTimeout(next.timer);next.resolve(release);}else active--;};
 return ()=>active<2?(active++,Promise.resolve(release)):new Promise((resolve,reject)=>{
  const waiter={resolve,timer:setTimeout(()=>{const index=waiters.indexOf(waiter);if(index>=0)waiters.splice(index,1);reject(fail(503,'Letter delivery is busy. Please try again shortly.'));},10000)};waiters.push(waiter);
 });
}
const actionPrefix = (recipientKey,channel) => `attendance_delivery:${channel}:${recipientKey.replace(':','_')}:`;
function receiptsFromEvents(events) {
 const seen=new Set(),receipts=[];
 for(const event of events){const match=/^attendance_delivery:(email|portal|sms):(user|client)_(\d+):(sending|sent|queued|failed|review)$/.exec(event.action||'');if(!match)continue;
  const [,channel,kind,id,recorded]=match,recipientKey=`${kind}:${id}`,key=`${channel}:${recipientKey}`;if(seen.has(key))continue;seen.add(key);
  const instant=event.created_at instanceof Date?event.created_at:new Date(utcMysqlToIso(event.created_at)||event.created_at);
  const status=recorded==='sending'&&Date.now()-Number(instant)>5*60000?'review':recorded;
  receipts.push({id:event.id,recipientKey,channel,status,updatedAt:event.created_at,error:status==='review'?'Delivery could not be confirmed. Check Communications before trying again.':status==='failed'?'This copy was not sent. Review the delivery settings before retrying.':null});
 }
 return receipts;
}
const deps = {
 read: async (...args) => (await import('./safetyPlans/records.js')).readPlan(...args),
 client: async (...args) => (await import('./safetyPlans/access.js')).clientAccess(...args),
 recipient: async (...args) => (await import('./safetyPlans/access.js')).recipientAccess(...args),
 share: async (...args) => (await import('./safetyPlans/records.js')).addSigner(...args),
 appointment: async (...args) => (await import('./safetyPlans/appointment.js')).appointmentPrefill(...args),
 gate: async args => (await import('./familyNotificationChoices.service.js')).familyNotificationDeliveryGate(args),
 pdf: async plan => (await import('./attendanceLetterPdf.service.js')).attendanceLetterPdf(plan),
 email: async args => (await import('./clientPortalEmail.service.js')).sendClientPortalEmail(args),
 sms: async args => (await import('./clinicalSmsSend.service.js')).sendClinicalSms(args),
 providerNumber: async (user,plan) => {
  const [{default:Assignment},{resolveRegisteredSmsSender},{default:User},{assertClinicalSmsRecipient}] = await Promise.all([
   import('../models/PhoneNumberAssignment.model.js'),import('./smsCompliance.service.js'),import('../models/User.model.js'),import('./clinicalSmsAccess.service.js')]);
  const actor=await User.findById(user.id),client=await deps.client(user,plan.clientId,{write:true});
  await assertClinicalSmsRecipient({user:actor,client});
  for(const row of await Assignment.listByUserId(user.id))if(Number(row.agency_id)===Number(plan.agencyId)){
   const from=await resolveRegisteredSmsSender({agencyId:plan.agencyId,purpose:'care',numberId:Number(row.number_id)});
   if(from)return {numberId:Number(row.number_id),from,firstName:actor.first_name};
  }
  return null;
 },
 smsPermission: async ({user,plan,recipient,sender,body}) => {
  if(recipient.userId){const [{resolveRelayFamily},{default:Client}]=await Promise.all([import('./providerSmsRelayIdentity.service.js'),import('../models/Client.model.js')]);
   const family=await resolveRelayFamily(await Client.findById(plan.clientId,{includeSensitive:true}),recipient.phone);
   if(!family||family.guardianUserId!==recipient.userId)throw fail(403,'This account cannot receive a text copy at that phone number.');}
  const {familyNotificationDeliveryGate}=await import('./familyNotificationChoices.service.js');
  const choice=await familyNotificationDeliveryGate({agencyId:plan.agencyId,clientId:plan.clientId,to:recipient.phone,channel:'sms',notificationCategory:'documents'});
  if(!choice.allowed)throw fail(403,'Text document delivery is turned off for this recipient.');
  return (await import('./clinicalSmsSend.service.js')).sendClinicalSms({userId:user.id,clientId:plan.clientId,numberId:sender.numberId,body,preview:true,...(recipient.userId?{relayRecipient:{guardianUserId:recipient.userId,phone:recipient.phone}}:{})});
 },
 log: async ({plan,user,channel,status}) => {
  if(!plan.appointment)return;
  const column=plan.appointment.eventType==='office'?'office_event_id':'provider_schedule_event_id';
  const appointmentId=Number(plan.appointment.appointmentId)||0;
  const [[appointment]]=await pool.execute(`SELECT id FROM appointments WHERE ${column}=? AND agency_id=? AND client_id=? AND (?=0 OR id=?) LIMIT 1`,[plan.appointment.eventId,plan.agencyId,plan.clientId,appointmentId,appointmentId]);
  if(appointment)await(await import('./appointmentReminder.service.js')).logCommunication({appointmentId:appointment.id,agencyId:plan.agencyId,channel:channel==='portal'?'in_app':channel,kind:'attendance_letter',direction:'outbound',createdByUserId:user.id,bodyPreview:'Signed appointment letter copy.',metadata:{deliveryStatus:status,letterId:plan.id,version:plan.version}});
 }
};
export function createAttendanceLetterDelivery({db=clinicalPool,directory=pool,...overrides}={}) {
 const d={...deps,...overrides};
 const acquireSlot=createDeliverySlots();
 async function context(user,id,version) {
  const plan=await d.read(user,id);
  if(plan.documentKey!=='attendance-verification'||!plan.clientId)throw fail(400,'Select a client-linked appointment letter.');
  if(Number(plan.version)!==Number(plan.currentVersion)||(version!=null&&Number(version)!==Number(plan.version)))throw fail(409,'Reload the current letter before sending it.');
  const client=await d.client(user,plan.clientId,{write:true});
  const content=attendanceLetterText(plan);
  if(!content.signer||plan.revocation)throw fail(400,'Digitally sign the current letter before choosing delivery.');
  if(plan.appointment&&plan.data.letterType==='Scheduled appointment'){
   const current=await d.appointment(user,{...plan.appointment,agencyId:plan.agencyId,clientId:plan.clientId});
   if(['appointmentDate','startTime','endTime','timezone'].some(key=>current.data[key]!==plan.data[key]))throw fail(409,'The appointment changed after this letter was signed. Revise and sign a current version before sending it.');
  }
  const recipients=[];
  for(const option of plan.recipients||[]){
   await d.recipient({client_id:plan.clientId,agency_id:plan.agencyId,document_key:plan.documentKey},option.id,option.kind);
   const [[account]]=await directory.execute('SELECT id,email,COALESCE(NULLIF(phone_number,\'\'),NULLIF(personal_phone,\'\'),NULLIF(work_phone,\'\')) AS phone FROM users WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0',[option.id]);
   if(account)recipients.push({key:`user:${option.id}`,userId:Number(option.id),name:option.name,kind:option.kind,email:account.email||null,phone:account.phone||null});
  }
  const [[{count}]]=await directory.execute('SELECT COUNT(*) AS count FROM client_guardians WHERE client_id=?',[plan.clientId]);
  // Never route around an existing or former guardian's clinical-document restrictions.
  if(!Number(count)&&(client.email||client.contact_phone))recipients.push({key:`client:${plan.clientId}`,userId:null,name:'Client contact on file',kind:'client',email:client.email||null,phone:client.contact_phone||null});
  let sender=null;
  try{sender=await d.providerNumber(user,plan);}catch{/* The other delivery choices remain available. */}
  const choices=await Promise.all(recipients.map(async recipient=>{
   const emailGate=recipient.email?await d.gate({agencyId:plan.agencyId,clientId:plan.clientId,to:recipient.email,channel:'email',templateType:'clinical_portal_documents',notificationCategory:'documents'}):{allowed:false};
   let sms=false,smsReason=!sender?'No eligible texting number is assigned to you.':!recipient.phone?'No phone number is recorded for this recipient.':'';
   if(sender&&recipient.phone){try{if(content.text.length>1200)throw fail(400,'This letter is too long for a complete text copy. Choose email or portal.');await d.smsPermission({user,plan,recipient,sender,body:content.text});sms=true;}catch(error){smsReason=error.status&&error.status<500?error.message:'Texting requires current care-message consent and an enabled provider number.';}}
   return {...recipient,channels:{portal:!!recipient.userId,email:!!emailGate.allowed,sms},reasons:{portal:recipient.userId?'':'No linked portal account exists.',email:recipient.email?'Email document delivery is turned off for this recipient.':'No email address is recorded.',sms:smsReason}};
  }));
  const [events]=await db.execute("SELECT id,action,created_at FROM clinical_form_events WHERE plan_id=? AND version=? AND action LIKE 'attendance_delivery:%' ORDER BY id DESC LIMIT 100",[plan.id,plan.version]);
  const deliveries=receiptsFromEvents(events);
  return {plan,client,content,sender,recipients:choices,deliveries};
 }
 async function options(user,id){const result=await context(user,id);return {recipients:result.recipients,deliveries:result.deliveries,sender:result.sender?{from:result.sender.from}:null};}
 async function deliver(user,id,input) {
  if(!Array.isArray(input.channels))throw fail(400,'Choose email, portal, text, or a combination.');
  const channels=[...new Set(input.channels||[])];
  if(!Array.isArray(input.channels)||!channels.length||channels.some(channel=>!['email','portal','sms'].includes(channel)))throw fail(400,'Choose email, portal, text, or a combination.');
  const current=await context(user,id,input.version),{plan,content,sender}=current;
  const recipient=current.recipients.find(item=>item.key===input.recipientKey);
  if(!recipient)throw fail(403,'Choose a currently authorized recipient.');
  if(recipient.kind==='guardian'&&input.authorityConfirmed!==true)throw fail(400,'Confirm the guardian is authorized to receive this letter.');
  for(const channel of channels)if(!recipient.channels[channel])throw fail(409,recipient.reasons[channel]||'This delivery channel is no longer available.');
  const releaseSlot=await acquireSlot();
  try {
  const results=[];
  for(const channel of channels){
   const key=crypto.createHash('sha256').update(`${plan.id}:${plan.version}:${recipient.key}:${channel}`).digest('hex').slice(0,44),conn=await db.getConnection();let acquired=false;
   try{
    const [[lock]]=await conn.execute('SELECT GET_LOCK(?,0) AS acquired',[`attendance:${key}`]);acquired=Number(lock?.acquired)===1;
    if(!acquired){results.push({recipientKey:recipient.key,channel,status:'sending'});continue;}
    const prefix=actionPrefix(recipient.key,channel);
    const states=['sending','sent','queued','failed','review'].map(status=>`${prefix}${status}`);
    const [history]=await conn.execute('SELECT id,action,created_at FROM clinical_form_events WHERE plan_id=? AND version=? AND action IN (?,?,?,?,?) ORDER BY id DESC LIMIT 1',[plan.id,plan.version,...states]);
    const previous=receiptsFromEvents(history)[0];
    if(previous&&previous.status!=='failed'){results.push(previous);continue;}
    const recordState=status=>conn.execute('INSERT INTO clinical_form_events (plan_id,version,actor_user_id,action) VALUES (?,?,?,?)',[plan.id,plan.version,user.id,`${prefix}${status}`]);
    await recordState('sending');
    let accepted=false;
    try{
     let result;
     if(channel==='portal'){
      const existing=plan.signers.some(s=>s.userId===recipient.userId&&s.sharedAt&&!s.revokedAt&&s.copyOnly);
      if(!existing)await d.share(user,plan.id,{version:plan.version,kind:recipient.kind,userId:recipient.userId,copyOnly:true,authorityConfirmed:input.authorityConfirmed===true},{notify:false});
      result={id:'portal-copy'};
     }else if(channel==='email')result=await d.email({agencyId:plan.agencyId,clientId:plan.clientId,userId:recipient.userId,to:recipient.email,source:'manual',templateType:'clinical_portal_documents',subject:`${plan.branding?.name||'Care team'}: ${content.title}`,text:'Your signed appointment letter is attached.',html:'<p>Your signed appointment letter is attached.</p>',attachments:[{filename:'appointment-letter.pdf',contentType:'application/pdf',contentBase64:(await d.pdf(plan)).toString('base64')}]});
     else result=await d.sms({userId:user.id,clientId:plan.clientId,numberId:sender.numberId,body:content.text,...(recipient.userId?{relayRecipient:{guardianUserId:recipient.userId,phone:recipient.phone}}:{})});
     const reference=result?.messageLog?.id||result?.internetMessageId||result?.id;
     const status=result?.skipped||result?.blocked?'failed':result?.redirected?'review':result?.queued?'queued':reference?'sent':'review';
     const error=status==='failed'?'The delivery service did not send this copy.':status==='review'?'Delivery could not be confirmed. Check Communications before trying again.':null;
     accepted=['sent','queued','review'].includes(status);
     await recordState(status);
     results.push({recipientKey:recipient.key,channel,status,error});
     try{await d.log({plan,user,channel,status});}catch{/* The accepted delivery remains authoritative. */}
    }catch(error){
     const status=!accepted&&error.status&&error.status<500?'failed':'review';
     const message=status==='failed'?String(error.message).slice(0,500):'Delivery could not be confirmed. Check Communications before trying again.';
     await recordState(status);results.push({recipientKey:recipient.key,channel,status,error:message});
     try{await d.log({plan,user,channel,status});}catch{/* Receipt and audit history remain available. */}
    }
   }finally{try{if(acquired)await conn.execute('SELECT RELEASE_LOCK(?)',[`attendance:${key}`]);}finally{conn.release();}}
  }
  return {deliveries:results};
  } finally { releaseSlot(); }
 }
 return {options,deliver};
}
export const attendanceLetterDelivery=createAttendanceLetterDelivery();
