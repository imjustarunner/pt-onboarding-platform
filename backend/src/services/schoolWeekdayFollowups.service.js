import pool from '../config/database.js';
import { readSchoolWeekdays } from './schoolWeekdayAvailability.service.js';
import { schoolWeekdayCompletion, schoolWeekdayProgress, schoolWeekdayEmail, schoolWeekdayUrl, schoolWeekdaySmsDue, schoolWeekdayEmailRecipient } from '../utils/schoolWeekdayFollowups.js';

const mysql = value => new Date(value).toISOString().replace('T',' ').slice(0,23);
const validEmail = value => /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(String(value || ''));

export function createSchoolWeekdayFollowups({ database = pool, readContext = readSchoolWeekdays, emailTransport, smsTransport, createCommunication, notificationGate } = {}) {
  async function settings(agencyId = null) {
    const [rows] = await database.execute(`SELECT s.*,COALESCE(NULLIF(u.work_email,''),u.email) AS owner_email,u.first_name AS owner_name,
      i.from_email,i.identity_key,a.name AS agency_name,a.slug,a.portal_url,a.custom_domain,a.feature_flags
      FROM school_weekday_followup_settings s JOIN agencies a ON a.id=s.agency_id
      JOIN users u ON u.id=s.owner_user_id AND u.is_active=1 AND COALESCE(u.is_demo,0)=0
      JOIN email_sender_identities i ON i.id=s.sender_identity_id AND i.agency_id=s.agency_id AND i.is_active=1
      WHERE s.enabled=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
      AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=s.agency_id AND COALESCE(ua.is_active,1)=1)
      ${agencyId ? 'AND s.agency_id=?' : ''}`,agencyId ? [agencyId] : []);
    return rows.filter(row => validEmail(row.owner_email) && ['notifications','default_notifications'].includes(row.identity_key));
  }
  async function participants(agencyId) {
    const [rows] = await database.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.email,u.work_email,u.personal_email,u.personal_phone,u.work_phone,u.phone_number
      FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
      WHERE COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
      AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')
      AND (u.role IN ('provider','provider_plus','supervisor') OR u.has_provider_access=1 OR u.sees_clients=1)`,[agencyId]);
    return rows;
  }
  async function seed(config, people, now, dryRun) {
    const plan = [];
    for (const person of people) {
      const context = await readContext(person.id,config.agency_id,database);
      if (!context.eligible || !context.needsResponse || !context.requestedAt) continue;
      const to = schoolWeekdayEmailRecipient(person,config.from_email);
      // A work update never falls back to a separately recorded personal email.
      if (!to) continue;
      plan.push({ providerId:Number(person.id),agencyId:Number(config.agency_id),to,cc:config.owner_email });
      if (dryRun) continue;
      // Repeated in-app reminders may update requestedAt. Reuse the outstanding
      // outreach rather than issuing another email/text for the same unanswered form.
      const [[existing]]=await database.execute('SELECT id FROM school_weekday_followups WHERE agency_id=? AND provider_id=? AND completed_at IS NULL AND cancelled_at IS NULL LIMIT 1',[config.agency_id,person.id]);
      if(existing)continue;
      await database.execute(`INSERT IGNORE INTO school_weekday_followups (agency_id,provider_id,request_key,requested_at,opened_at)
        VALUES (?,?,?,?,?)`,[config.agency_id,person.id,context.requestedAt,mysql(context.requestedAt),context.openedAt ? mysql(context.openedAt) : null]);
    }
    return plan;
  }
  async function deliverEmail(row, config, person, kind, now) {
    const column = kind === 'thankyou' ? 'thankyou' : 'invitation';
    const initial = kind === 'thankyou' ? 'waiting' : 'pending';
    const [claim] = await database.execute(`UPDATE school_weekday_followups SET ${column}_status='sending' WHERE id=? AND ${column}_status=?`,[row.id,initial]);
    if (!claim.affectedRows) return {status:'already_claimed'};
    let communicationId;
    try {
      const fresh=await readContext(person.id,config.agency_id,database);
      if(kind==='invitation' && (!fresh.needsResponse || schoolWeekdayCompletion(fresh).complete)) {
        await database.execute("UPDATE school_weekday_followups SET invitation_status='cancelled' WHERE id=?",[row.id]);
        return {status:'cancelled'};
      }
      const content = schoolWeekdayEmail({person,agency:{...config,id:config.agency_id,name:config.agency_name},owner:{first_name:config.owner_name},kind});
      const to = schoolWeekdayEmailRecipient(person,config.from_email);
      if (!to) throw new Error('A valid work email is required.');
      const create = createCommunication || (async input => (await import('../models/UserCommunication.model.js')).default.create(input));
      const communication = await create({agencyId:config.agency_id,userId:person.id,templateType:`school_weekday_${kind}`,templateId:row.id,
        subject:content.subject,body:content.text,recipientAddress:to,deliveryStatus:'pending',generatedByUserId:config.owner_user_id,
        metadata:{schoolWeekdayFollowupId:row.id,kind,senderIdentityId:config.sender_identity_id,fromEmail:config.from_email,source:'auto',cc:config.owner_email,replyTo:config.owner_email}});
      communicationId = communication.id;
      await database.execute(`UPDATE school_weekday_followups SET ${column}_communication_id=? WHERE id=?`,[communicationId,row.id]);
      const send = emailTransport || (await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity;
      const result = await send({senderIdentityId:config.sender_identity_id,to,cc:config.owner_email,replyToOverride:config.owner_email,
        ...content,source:'auto',templateType:`school_weekday_${kind}`,templateId:row.id,userId:person.id,generatedByUserId:config.owner_user_id,
        existingCommunicationId:communicationId,preloggedReceipt:true,
        internetMessageIdOverride:`<school-weekday-${row.id}-${kind}@${String(config.from_email).split('@')[1]}>`});
      const sent = !!result.id && !result.queued && !result.skipped && !result.redirected && !result.pendingApproval;
      const status = sent ? 'sent' : result.skipped ? 'skipped' : 'review';
      await database.execute(`UPDATE school_weekday_followups SET ${column}_status=?,${column}_sent_at=?,last_error=?${kind==='invitation' ? ',sms_due_at=?' : ''} WHERE id=?`,
        [status,sent ? mysql(now) : null,sent ? null : String(result.reason || 'Delivery requires review').slice(0,500),
          ...(kind==='invitation' ? [sent ? mysql(new Date(now.getTime()+Number(config.sms_delay_hours)*3600000)) : null] : []),row.id]);
      return {status,communicationId};
    } catch(error) {
      // Ambiguous transport failures are held for review, never blindly retried.
      await database.execute(`UPDATE school_weekday_followups SET ${column}_status='review',last_error=? WHERE id=?`,[String(error.message).slice(0,500),row.id]);
      return {status:'review',communicationId};
    }
  }
  async function deliverSms(row, config, person, now) {
    const [claim] = await database.execute("UPDATE school_weekday_followups SET sms_status='sending' WHERE id=? AND sms_status='waiting' AND completed_at IS NULL",[row.id]);
    if (!claim.affectedRows) return {status:'already_claimed'};
    try {
      // Recheck after claiming: someone may have completed the form since the
      // worker loaded this row. Completion always wins over a reminder.
      const context = await readContext(person.id,config.agency_id,database);
      if (!context.needsResponse || schoolWeekdayCompletion(context).complete) {
        await database.execute("UPDATE school_weekday_followups SET sms_status='cancelled' WHERE id=?",[row.id]);
        return {status:'cancelled'};
      }
      const gate=notificationGate || (input=>(import('./notificationGatekeeper.service.js').then(module=>module.default.decideChannels(input))));
      const decision=await gate({userId:person.id,context:{severity:'info'}});
      if(!decision?.sms) {
        await database.execute("UPDATE school_weekday_followups SET sms_status=?,sms_reason=? WHERE id=?",['suppressed','gatekeeper_sms_false',row.id]);
        return {status:'suppressed',reason:'gatekeeper_sms_false'};
      }
      const {resolveRegisteredSmsSender} = await import('./smsCompliance.service.js');
      const from = await resolveRegisteredSmsSender({agencyId:config.agency_id,purpose:'workforce',requiredPurpose:'polling'});
      const {default:User} = await import('../models/User.model.js');
      const to = User.normalizePhone(person.personal_phone || person.work_phone || person.phone_number);
      if (!to || !from) throw Object.assign(new Error(!to ? 'No staff phone' : 'No approved staff SMS sender'),{code:!to?'sms_no_phone':'sms_sender_missing'});
      const send = smsTransport || (await import('./vonage.service.js')).default.sendSms.bind((await import('./vonage.service.js')).default);
      const body = `Please finish your school availability: ${schoolWeekdayUrl({...config,id:config.agency_id})} Mark each unassigned weekday Available or Not available, then Save. Reply STOP to opt out.`;
      // The shared transport enforces signed staff choices, campaign consent,
      // STOP suppression and inactive-account rules immediately before delivery.
      const result = await send({agencyId:config.agency_id,purpose:'workforce',staffNotificationKind:'notifications',to,from,body});
      await database.execute("UPDATE school_weekday_followups SET sms_status='sent',sms_message_id=?,sms_sent_at=?,sms_reason=NULL WHERE id=?",[result.sid || result.id || null,mysql(now),row.id]);
      return {status:'sent'};
    } catch(error) {
      const status = String(error.code || '').startsWith('sms_') || Number(error.status)===403 ? 'suppressed' : 'review';
      await database.execute('UPDATE school_weekday_followups SET sms_status=?,sms_reason=? WHERE id=?',[status,String(error.code || error.message).slice(0,255),row.id]);
      return {status,reason:error.code};
    }
  }
  async function process({agencyId=null,dryRun=false,now=new Date()}={}) {
    let connection,locked=false;
    const results=[];
    try {
      if (!dryRun) {
        connection=await database.getConnection();
        const [[lock]]=await connection.execute("SELECT GET_LOCK('school-weekday-followups:worker',0) AS acquired");
        locked=Number(lock.acquired)===1;
        if(!locked)return {busy:true,results:[]};
      }
      for(const config of await settings(agencyId)) {
        const people=await participants(config.agency_id);
        const plan=await seed(config,people,now,dryRun);
        if(dryRun){results.push(...plan);continue;}
        const [rows]=await database.execute(`SELECT * FROM school_weekday_followups WHERE agency_id=? AND cancelled_at IS NULL
          AND (completed_at IS NULL OR thankyou_status='waiting') ORDER BY id`,[config.agency_id]);
        for(const row of rows) {
          const person=people.find(p=>Number(p.id)===Number(row.provider_id));
          const context=person ? await readContext(person.id,config.agency_id,database) : null;
          if(!context?.eligible || (!context.needsResponse && !schoolWeekdayCompletion(context).complete)) {
            await database.execute("UPDATE school_weekday_followups SET cancelled_at=?,sms_status='cancelled',invitation_status=IF(invitation_status='pending','cancelled',invitation_status) WHERE id=?",[mysql(now),row.id]);
            continue;
          }
          if(context.openedAt)await database.execute('UPDATE school_weekday_followups SET opened_at=COALESCE(opened_at,?) WHERE id=?',[mysql(context.openedAt),row.id]);
          if(schoolWeekdayCompletion(context).complete) {
            await database.execute("UPDATE school_weekday_followups SET completed_at=COALESCE(completed_at,?),sms_status=IF(sms_status IN ('waiting','sending'),'cancelled',sms_status),invitation_status=IF(invitation_status='pending','cancelled',invitation_status) WHERE id=?",[mysql(context.completedAt || context.updatedAt || now),row.id]);
            if(row.thankyou_status==='waiting')results.push({id:row.id,kind:'thankyou',...await deliverEmail(row,config,person,'thankyou',now)});
          } else if(row.invitation_status==='pending') {
            results.push({id:row.id,kind:'invitation',...await deliverEmail(row,config,person,'invitation',now)});
          } else if(schoolWeekdaySmsDue(row,now)) {
            results.push({id:row.id,kind:'sms',...await deliverSms(row,config,person,now)});
          }
        }
      }
      return {dryRun,results};
    } finally {if(locked)await connection.execute("SELECT RELEASE_LOCK('school-weekday-followups:worker')");connection?.release();}
  }
  async function progress(agencyId) {
    const people=await participants(agencyId);
    const [rows]=await database.execute('SELECT * FROM school_weekday_followups WHERE agency_id=? ORDER BY id DESC',[agencyId]);
    const result=[];
    for(const person of people) {
      const context=await readContext(person.id,agencyId,database);
      if(!context.eligible || (!context.requestedAt && !context.days.some(day=>day.status==='assigned')))continue;
      const tracking=rows.find(row=>Number(row.provider_id)===Number(person.id)) || {};
      result.push({providerId:person.id,name:[person.first_name,person.last_name].filter(Boolean).join(' '),...schoolWeekdayProgress(context,tracking)});
    }
    return {providers:result,counts:{pending:result.filter(p=>p.status==='pending').length,opened:result.filter(p=>p.status==='opened').length,completed:result.filter(p=>p.status==='completed').length}};
  }
  return {process,progress};
}
const service=createSchoolWeekdayFollowups();
export const processSchoolWeekdayFollowups=service.process;
export const readSchoolWeekdayProgress=service.progress;
