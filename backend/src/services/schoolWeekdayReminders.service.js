import { schoolWeekdayCompletion,schoolWeekdayEmail,schoolWeekdayEmailRecipient } from '../utils/schoolWeekdayFollowups.js';

const stamp=value=>new Date(value).toISOString().replace('T',' ').slice(0,23);
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const date=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?$/.test(value)?new Date(value.replace(' ','T')+'Z'):new Date(value);
export function schoolWeekdayReminderReceipt(row,now=new Date()) {
  if(!row)return null;
  const nextAllowedAt=new Date(date(row.requested_at).getTime()+86400000).toISOString();
  return {id:Number(row.id),mode:row.mode,status:row.status,requestedAt:row.requested_at,sentAt:row.sent_at||null,
    nextAllowedAt,canSendAgain:!['pending','sending','review'].includes(row.status)&&new Date(nextAllowedAt)<=now,error:row.last_error||null};
}

// The HTTP caller is an authenticated manager; the queue records that human
// request separately from the Notifications automation that performs transport.
export function createSchoolWeekdayReminders({database,readContext,loadSettings,loadParticipants,emailTransport,createCommunication}) {
  async function enqueue({agencyId,providerId,actorId,requestKey,mode='reminder',now=new Date()}) {
    if(!/^[A-Za-z0-9_-]{16,80}$/.test(String(requestKey||''))||!['reminder','reconfirm'].includes(mode))throw fail('A valid reminder request key and mode are required.',400);
    const [config]=await loadSettings(agencyId);
    if(!config)throw fail('Notifications email follow-ups are not configured for this agency.');
    const person=(await loadParticipants(agencyId)).find(p=>Number(p.id)===Number(providerId));
    if(!person)throw fail('Active school provider not found in this agency.',404);
    if(!schoolWeekdayEmailRecipient(person,config.from_email))throw fail('A valid work email is required before sending a reminder.');
    const db=await database.getConnection();
    let row;
    try {
      await db.beginTransaction();
      await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[providerId]);
      const [[previous]]=await db.execute(`SELECT * FROM school_weekday_email_reminders WHERE agency_id=? AND provider_id=?
        AND (request_key=? OR status IN ('pending','sending','review') OR requested_at>DATE_SUB(?,INTERVAL 24 HOUR)) ORDER BY id DESC LIMIT 1`,[agencyId,providerId,requestKey,stamp(now)]);
      if(previous){await db.rollback();return {reminder:schoolWeekdayReminderReceipt(previous,now),deduplicated:true};}
      const context=await readContext(providerId,agencyId,db);
      if(!context.eligible || !context.days.some(day=>day.status==='assigned'))throw fail('School availability reminders require an eligible provider with assigned school days.');
      if(mode==='reminder') {
        if(!context.needsResponse || schoolWeekdayCompletion(context).complete)throw fail('All five weekdays are already accounted for. Use Request re-confirmation if the saved answers are disputed.');
        const [[invitation]]=await db.execute("SELECT id FROM school_weekday_followups WHERE agency_id=? AND provider_id=? AND invitation_status='sent' ORDER BY id DESC LIMIT 1",[agencyId,providerId]);
        if(!invitation)throw fail('The initial invitation has not been sent yet. Check its delivery status first.');
      } else {
        if(context.needsResponse && !context.reconfirmationPending)throw fail('This form is unfinished. Use Send email reminder.');
        // Preserve existing answers and attribution while asking for a fresh,
        // explicit review. Persist its follow-up before the worker can seed an
        // initial invitation, so this click sends exactly one requested email.
        await db.execute(`INSERT IGNORE INTO school_weekday_followups (agency_id,provider_id,request_key,requested_at,invitation_status,sms_status)
          VALUES (?,?,?,?,'not_sent','cancelled')`,[agencyId,providerId,'reconfirm:'+requestKey.slice(0,50),stamp(now)]);
        await db.execute(`INSERT INTO provider_public_profiles (user_id,public_details_json) VALUES (?,?)
          ON DUPLICATE KEY UPDATE public_details_json=JSON_MERGE_PATCH(COALESCE(public_details_json,JSON_OBJECT()),VALUES(public_details_json)),updated_at=CURRENT_TIMESTAMP`,
          [providerId,JSON.stringify({schoolWeekdaysByAgency:{[agencyId]:{requestedAt:now.toISOString(),requestedBy:actorId,reconfirmationRequestedAt:now.toISOString()}}})]);
        await db.execute(`INSERT INTO notifications (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_user_id,actor_source)
          VALUES ('school_weekday_availability_requested','info',?,?,?,?,?,?,?,?)`,
          ['Review your school availability','Please review and explicitly confirm every unassigned weekday. Your previously saved answers remain on record until you save changes.',providerId,agencyId,'school_weekday_availability',providerId,actorId,'school_weekday_reconfirmation']);
      }
      const [insert]=await db.execute(`INSERT INTO school_weekday_email_reminders (agency_id,provider_id,requested_by_user_id,request_key,mode,requested_at) VALUES (?,?,?,?,?,?)`,[agencyId,providerId,actorId,requestKey,mode,stamp(now)]);
      row={id:insert.insertId,mode,status:'pending',requested_at:now,sent_at:null};
      await db.commit();
    }catch(error){await db.rollback();throw error;}finally{db.release();}
    return {reminder:schoolWeekdayReminderReceipt(row,now),deduplicated:false};
  }
  async function process({agencyId,now=new Date()}) {
    const [config]=await loadSettings(agencyId);if(!config)return [];
    const people=await loadParticipants(agencyId);
    // An uncertain interrupted transport must be reviewed rather than resent.
    await database.execute("UPDATE school_weekday_email_reminders SET status='review',last_error='Delivery outcome requires review; no automatic retry.' WHERE agency_id=? AND status='sending' AND updated_at<DATE_SUB(?,INTERVAL 10 MINUTE)",[agencyId,stamp(now)]);
    const [rows]=await database.execute("SELECT * FROM school_weekday_email_reminders WHERE agency_id=? AND status='pending' ORDER BY id",[agencyId]);
    const results=[];
    for(const row of rows) {
      const [claim]=await database.execute("UPDATE school_weekday_email_reminders SET status='sending' WHERE id=? AND agency_id=? AND status='pending'",[row.id,agencyId]);
      if(!claim.affectedRows)continue;
      try {
        const person=people.find(p=>Number(p.id)===Number(row.provider_id));
        const context=person?await readContext(person.id,agencyId,database):null;
        if(!context?.eligible || !context.needsResponse || schoolWeekdayCompletion(context).complete) {
          await database.execute("UPDATE school_weekday_email_reminders SET status='cancelled',last_error=NULL WHERE id=? AND agency_id=?",[row.id,agencyId]);
          results.push({id:row.id,status:'cancelled'});continue;
        }
        const to=schoolWeekdayEmailRecipient(person,config.from_email);
        if(!to)throw new Error('A valid work email is required.');
        const content=schoolWeekdayEmail({person,agency:{...config,id:agencyId,name:config.agency_name},owner:{first_name:config.owner_name},kind:row.mode});
        const metadata={actorType:'automation',actorKey:'school_weekday_email_reminders',requestedByUserId:row.requested_by_user_id,reminderId:row.id,mode:row.mode,senderIdentityId:config.sender_identity_id,fromEmail:config.from_email,cc:config.owner_email,replyTo:config.owner_email,source:'auto'};
        const create=createCommunication||(async input=>(await import('../models/UserCommunication.model.js')).default.create(input));
        const comm=await create({agencyId,userId:person.id,templateType:'school_weekday_reminder',templateId:row.id,subject:content.subject,body:content.text,recipientAddress:to,deliveryStatus:'pending',generatedByUserId:null,metadata});
        await database.execute('UPDATE school_weekday_email_reminders SET communication_id=? WHERE id=? AND agency_id=?',[comm.id,row.id,agencyId]);
        const send=emailTransport||(await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity;
        const result=await send({...content,senderIdentityId:config.sender_identity_id,to,cc:config.owner_email,replyToOverride:config.owner_email,source:'auto',templateType:'school_weekday_reminder',templateId:row.id,userId:person.id,generatedByUserId:null,existingCommunicationId:comm.id,preloggedReceipt:true,internetMessageIdOverride:`<school-weekday-reminder-${row.id}@${config.from_email.split('@')[1]}>`});
        const sent=!!result.id&&!result.queued&&!result.skipped&&!result.redirected&&!result.pendingApproval;
        const status=sent?'sent':result.skipped?'skipped':'review';
        await database.execute('UPDATE school_weekday_email_reminders SET status=?,sent_at=?,last_error=? WHERE id=? AND agency_id=?',[status,sent?stamp(now):null,sent?null:String(result.reason||'Delivery requires review').slice(0,500),row.id,agencyId]);
        // Keep the transport receipt and append the explicit automation/request
        // attribution after the shared sender writes its delivery metadata.
        await database.execute('UPDATE user_communications SET metadata=JSON_MERGE_PATCH(COALESCE(metadata,JSON_OBJECT()),CAST(? AS JSON)) WHERE id=? AND agency_id=?',[JSON.stringify(metadata),comm.id,agencyId]).catch(()=>{});
        results.push({id:row.id,status});
      }catch(error){await database.execute("UPDATE school_weekday_email_reminders SET status='review',last_error=? WHERE id=? AND agency_id=?",[String(error.message).slice(0,500),row.id,agencyId]);results.push({id:row.id,status:'review'});}
    }
    return results;
  }
  return {enqueue,process};
}
