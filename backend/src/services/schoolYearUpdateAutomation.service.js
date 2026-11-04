import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { getEmailSendingMode, isEmailNotificationsEnabled } from './emailSettings.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { schoolEmailPortalUrl, schoolEmailAdminOverviewUrl } from './schoolEmailPortal.service.js';
import { annualSchedule, annualSchoolYear, dueAnnualReminder } from '../utils/schoolYearUpdatePolicy.js';
import { annualSchoolEmail, annualCompletionEmail, annualDeadlineEmail } from '../utils/schoolYearUpdateEmail.js';
import { getAnnualAccess, annualCohort } from './schoolYearUpdateAccess.service.js';

const normalized=value=>String(value||'').trim().toLowerCase();
const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value||'');
export const ANNUAL_TEMPLATES={invitation:'school_annual_update_invitation',reminder:'school_annual_update_reminder',followup:'school_annual_update_followup',receipt:'school_annual_update_receipt',report:'school_annual_update_report'};
// Existing schedule rows are historical configuration, not approval to resume
// deliveries when this recovered runtime is deployed.
export const annualAutomationEnabled=(env=process.env)=>env.SCHOOL_YEAR_UPDATE_AUTOMATION_ENABLED==='true';
const held=()=>({held:true,reason:'annual_automation_disabled'});

export async function annualMailContext(agencyId, {db=pool,AgencyModel=Agency,Identity=EmailSenderIdentity}={}) {
  const [agency,identity,support]=await Promise.all([AgencyModel.findById(agencyId),Identity.findByAgencyAndIdentityKey(agencyId,'schools'),Identity.findByAgencyAndIdentityKey(agencyId,'support')]);
  if(!identity?.id||Number(identity.is_active)!==1||normalized(identity.from_email).split('@')[0]!=='schools') throw new Error('Configure an active Schools sender for this agency.');
  const supportEmail=normalized(Number(support?.is_active)===1?support.from_email:agency?.support_team_email);
  const [admins]=await db.execute(`SELECT DISTINCT u.email FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    WHERE ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0 AND u.role='admin'`,[agencyId]);
  const adminEmails=[...new Set(admins.map(u=>normalized(u.email)).filter(validEmail))];
  return {agency,identity,schoolsEmail:normalized(identity.from_email),supportEmail,adminEmails};
}

/** Shared database claim plus receipt reconciliation: an uncertain send is never automatically retried. */
export async function deliverAnnualEmail({agencyId,schoolYear,schoolId=0,cycleId=null,key,kind,context,to,content},{db=pool,send=sendEmailFromIdentity}={}) {
  if(!annualAutomationEnabled())return held();
  if(!validEmail(context.schoolsEmail)||!to.length||to.some(address=>!validEmail(address))) throw new Error('Annual-update recipients are not configured.');
  const hash=createHash('sha256').update(`${agencyId}:${schoolYear}:${schoolId}:${key}`).digest('hex').slice(0,36);
  const messageId=`<school-annual-${hash}@${context.schoolsEmail.split('@')[1]}>`;
  await db.execute(`INSERT IGNORE INTO school_reinit_deliveries (agency_id,school_year,school_organization_id,cycle_id,delivery_key,kind,message_id)
    VALUES (?,?,?,?,?,?,?)`,[agencyId,schoolYear,schoolId,cycleId,key,kind,messageId]);
  const [[job]]=await db.execute('SELECT * FROM school_reinit_deliveries WHERE agency_id=? AND school_year=? AND school_organization_id=? AND delivery_key=?',[agencyId,schoolYear,schoolId,key]);
  if(job.status!=='pending')return {status:job.status};
  const [claim]=await db.execute("UPDATE school_reinit_deliveries SET status='sending',recipient_email=?,message_id=?,last_error=NULL WHERE id=? AND status='pending'",[to.join(','),messageId,job.id]);
  if(!claim.affectedRows)return {status:'claimed'};
  try {
    const result=await send({senderIdentityId:context.identity.id,to:to.join(','),cc:to.includes(context.schoolsEmail)?null:context.schoolsEmail,
      replyToOverride:context.schoolsEmail,source:'auto',templateType:ANNUAL_TEMPLATES[kind],schoolOrganizationId:schoolId||null,
      internetMessageIdOverride:messageId,...content});
    const status=result.id&&!result.redirected?'sent':result.skipped?'skipped':'held';
    await db.execute(`UPDATE school_reinit_deliveries SET status=?,communication_id=?,sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL),last_error=? WHERE id=?`,[status,result.communicationId||null,status,result.reason||(status==='held'?'Delivery requires review':null),job.id]);
    return {status};
  } catch(error) {
    await db.execute("UPDATE school_reinit_deliveries SET status='held',last_error=? WHERE id=?",[String(error.message||error).slice(0,500),job.id]);
    return {status:'held'};
  }
}
export async function reconcileAnnualDeliveries(db=pool) {
  if(!annualAutomationEnabled())return held();
  const [jobs]=await db.execute("SELECT * FROM school_reinit_deliveries WHERE status IN ('sending','held') AND updated_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE) LIMIT 100");
  for(const job of jobs) {
    const [[receipt]]=await db.execute(`SELECT id,delivery_status,external_message_id FROM user_communications WHERE agency_id=?
      AND (id=? OR JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.internetMessageIdOverride'))=? OR JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.internetMessageId'))=?) ORDER BY id DESC LIMIT 1`,[job.agency_id,job.communication_id||0,job.message_id,job.message_id]);
    if(receipt?.delivery_status==='sent'&&receipt.external_message_id)await db.execute("UPDATE school_reinit_deliveries SET status='sent',communication_id=?,sent_at=COALESCE(sent_at,UTC_TIMESTAMP()),last_error=NULL WHERE id=?",[receipt.id,job.id]);
    else if(job.status==='sending')await db.execute("UPDATE school_reinit_deliveries SET status='held',last_error='Uncertain delivery; review communication receipt before retrying' WHERE id=?",[job.id]);
  }
}
export async function queueAnnualCompletionReceipt(cycle,db=pool) {
  if(!annualAutomationEnabled())return held();
  await db.execute(`INSERT IGNORE INTO school_reinit_deliveries (agency_id,school_year,school_organization_id,cycle_id,delivery_key,kind)
    VALUES (?,?,?,?,?,'receipt')`,[cycle.agency_id,cycle.school_year,cycle.school_organization_id,cycle.id,`receipt:${cycle.id}`]);
  await db.execute("UPDATE school_reinit_followups SET status='resolved',resolved_at=UTC_TIMESTAMP() WHERE cycle_id=? AND status='open'",[cycle.id]);
}
async function persistOutstanding(cohort,db) {
  for(const row of cohort.filter(r=>r.eligible&&r.cycle&&r.cycle.status!=='finalized'))await db.execute(`INSERT INTO school_reinit_followups (cycle_id,outstanding_json) VALUES (?,?)
    ON DUPLICATE KEY UPDATE outstanding_json=VALUES(outstanding_json)`,[row.cycle.id,JSON.stringify(row.outstanding)]);
}
export async function runSchoolYearUpdateAutomation({now=new Date(),db=pool,send=sendEmailFromIdentity,onlyAgencyId=null}={}) {
  if(!annualAutomationEnabled())return held();
  await reconcileAnnualDeliveries(db);
  if(await getEmailSendingMode()!=='all')return;
  const [rulesRows]=await db.execute(`SELECT * FROM school_reinit_rules WHERE enabled=1${onlyAgencyId?' AND agency_id=?':''}`,onlyAgencyId?[onlyAgencyId]:[]);
  for(const rules of rulesRows) {
    try {
      const agencyId=rules.agency_id,schoolYear=annualSchoolYear(now,rules.timezone),schedule=annualSchedule(schoolYear,rules,now);
      if(!await isEmailNotificationsEnabled({agencyId}))continue;
      // Do not send schools messages overnight. Receipts and staff reports can be processed at any time.
      const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:rules.timezone,hour:'2-digit',hourCycle:'h23'}).format(now));
      const weekday=new Intl.DateTimeFormat('en-US',{timeZone:rules.timezone,weekday:'short'}).format(now);
      const schoolSendHours=hour>=9&&hour<17&&!['Sat','Sun'].includes(weekday);
      let [[campaign]]=await db.execute('SELECT * FROM school_reinit_campaigns WHERE agency_id=? AND school_year=?',[agencyId,schoolYear]);
      if(schedule.phase==='open'&&(!campaign||campaign.status==='draft')) {
        const S=await import('./schoolReinit.service.js');await S.ensureDefaultQuestions(agencyId,schoolYear);
        await db.execute(`INSERT INTO school_reinit_campaigns (agency_id,school_year,status,enabled_at,pushed_at) VALUES (?,?,'pushed',UTC_TIMESTAMP(),UTC_TIMESTAMP())
          ON DUPLICATE KEY UPDATE status=IF(status='draft','pushed',status),enabled_at=COALESCE(enabled_at,UTC_TIMESTAMP()),pushed_at=COALESCE(pushed_at,UTC_TIMESTAMP())`,[agencyId,schoolYear]);
        [[campaign]]=await db.execute('SELECT * FROM school_reinit_campaigns WHERE agency_id=? AND school_year=?',[agencyId,schoolYear]);
      }
      if(!campaign)continue;
      let cohort=await annualCohort(agencyId,schoolYear,db);
      if(schedule.phase!=='scheduled') {
        for(const row of cohort.filter(r=>r.eligible&&!r.cycle))await db.execute("INSERT IGNORE INTO school_reinit_cycles (agency_id,school_organization_id,school_year,status) VALUES (?,?,?,'not_started')",[agencyId,row.school.id,schoolYear]);
        cohort=await annualCohort(agencyId,schoolYear,db);
      }
      if(['followup','closed'].includes(schedule.phase))await persistOutstanding(cohort,db);
      const context=await annualMailContext(agencyId,{db});
      // Recover a finalized cycle if the request ended before its receipt was queued. No historical replay.
      for(const row of cohort.filter(r=>r.eligible&&r.cycle?.status==='finalized'&&new Date(r.cycle.finalized_at)>=new Date(rules.activated_at)))await queueAnnualCompletionReceipt(row.cycle,db);
      const [pendingReceipts]=await db.execute("SELECT cycle_id FROM school_reinit_deliveries WHERE agency_id=? AND kind='receipt' AND status='pending'",[agencyId]);
      for(const receipt of pendingReceipts) {
        const row=cohort.find(r=>r.cycle?.id===receipt.cycle_id);if(!row||!row.eligible||row.cycle.status!=='finalized')continue;
        const portalUrl=await schoolEmailPortalUrl({agencyId,schoolOrganizationId:row.school.id});
        const content=annualCompletionEmail({...row,agency:context.agency,schoolYear,portalUrl});
        const to=validEmail(row.school.group_email)?[normalized(row.school.group_email)]:[context.schoolsEmail];
        await deliverAnnualEmail({agencyId,schoolYear,schoolId:row.school.id,cycleId:row.cycle.id,key:`receipt:${row.cycle.id}`,kind:'receipt',context,to,content},{db,send});
      }
      if(schoolSendHours&&['pushed','enabled'].includes(campaign.status))for(const row of cohort.filter(r=>r.eligible&&r.cycle?.status!=='finalized'&&r.followup?.status!=='waived')) {
        const extension=row.followup?.extension_until instanceof Date?row.followup.extension_until.toISOString().slice(0,10):row.followup?.extension_until;
        const schoolSchedule=annualSchedule(schoolYear,rules,now,extension);
        const stage=extension && schoolSchedule.phase==='followup' && extension>schedule.followupEndsOn
          ? {key:`extension:${extension}:${schoolSchedule.today>=new Date(Date.parse(`${extension}T12:00:00Z`)-3*86400000).toISOString().slice(0,10)?'closing':'opened'}`,kind:'followup'}
          : dueAnnualReminder(schoolSchedule);
        if(!stage||!validEmail(row.school.group_email))continue;
        // A later stage must not create several reminders in adjacent worker ticks.
        const [[recent]]=await db.execute("SELECT id FROM school_reinit_deliveries WHERE agency_id=? AND school_year=? AND school_organization_id=? AND kind IN ('invitation','reminder','followup') AND status IN ('sent','sending','held') AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 48 HOUR) LIMIT 1",[agencyId,schoolYear,row.school.id]);
        if(recent)continue;
        const [[currentCycle]]=await db.execute('SELECT * FROM school_reinit_cycles WHERE id=?',[row.cycle.id]);
        if(!currentCycle || !(await getAnnualAccess({agencyId,schoolOrganizationId:row.school.id,schoolYear,cycle:currentCycle,now},db)).canWrite)continue;
        const portalUrl=await schoolEmailPortalUrl({agencyId,schoolOrganizationId:row.school.id});
        await deliverAnnualEmail({agencyId,schoolYear,schoolId:row.school.id,cycleId:row.cycle.id,key:stage.key,kind:stage.kind,context,to:[normalized(row.school.group_email)],content:annualSchoolEmail({kind:stage.kind,school:row.school,agency:context.agency,schoolYear,schedule:schoolSchedule,outstanding:row.outstanding,portalUrl})},{db,send});
      }
      if(['followup','closed'].includes(schedule.phase)) {
        if(!validEmail(context.supportEmail)||!context.adminEmails.length)throw new Error('Configure Support and active agency administrator email recipients for annual reports.');
        const final=schedule.phase==='closed';
        const adminUrl=schoolEmailAdminOverviewUrl(context.agency);
        await deliverAnnualEmail({agencyId,schoolYear,key:final?'report:closeout':'report:deadline',kind:'report',context,to:[...new Set([...context.adminEmails,context.supportEmail])],content:annualDeadlineEmail({agency:context.agency,schoolYear,schedule,cohort,final,adminUrl})},{db,send});
      }
    } catch(error) { console.warn('[school-annual-update]',rules.agency_id,error.message); }
  }
}
