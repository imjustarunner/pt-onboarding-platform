import pool from '../config/database.js';
import { DEFAULT_ANNUAL_RULES, annualSchedule, annualEligibility, outstandingAnnualInfo, validateAnnualRules, localDate, addDays } from '../utils/schoolYearUpdatePolicy.js';

export async function canManageAnnualUpdate(user,agencyId,db=pool) {
  if(!user?.id||!agencyId||!['admin','support','super_admin'].includes(user.role))return false;
  if(user.role==='super_admin')return true;
  const [[row]]=await db.execute("SELECT 1 AS allowed FROM user_agencies ua JOIN users u ON u.id=ua.user_id WHERE ua.user_id=? AND ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL AND UPPER(COALESCE(u.status,'')) NOT IN ('TERMINATED','TERMINATED_PENDING','ARCHIVED','INACTIVE_EMPLOYEE') LIMIT 1",[user.id,agencyId]);
  return Boolean(row?.allowed);
}

export async function getAnnualRules(agencyId, db = pool) {
  const [[row]] = await db.execute('SELECT * FROM school_reinit_rules WHERE agency_id=?',[agencyId]);
  return { ...DEFAULT_ANNUAL_RULES,...row };
}
export async function saveAnnualRules(agencyId, input, userId, db = pool) {
  const rules=validateAnnualRules(input);
  await db.execute(`INSERT INTO school_reinit_rules (agency_id,enabled,timezone,opens_md,due_md,followup_md,updated_by_user_id)
    VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),timezone=VALUES(timezone),opens_md=VALUES(opens_md),due_md=VALUES(due_md),followup_md=VALUES(followup_md),updated_by_user_id=VALUES(updated_by_user_id)`,
    [agencyId,rules.enabled,rules.timezone,rules.opens_md,rules.due_md,rules.followup_md,userId||null]);
  return getAnnualRules(agencyId,db);
}
export async function listAnnualSchools(agencyId, db = pool) {
  const [rows]=await db.execute(`SELECT s.id,s.name,s.slug,s.portal_url,s.organization_type,s.is_active,s.is_archived,s.created_at,
    1 AS affiliated, COALESCE(
      (SELECT MIN(f.created_at) FROM organization_affiliations f WHERE f.organization_id=s.id AND f.agency_id=? AND f.is_active=1),
      (SELECT MIN(legacy.created_at) FROM agency_schools legacy WHERE legacy.school_organization_id=s.id AND legacy.agency_id=? AND legacy.is_active=1)) AS first_affiliation_at,
    (SELECT MIN(i.created_at) FROM school_onboarding_invites i WHERE i.agency_id=? AND i.school_organization_id=s.id AND i.status<>'revoked') AS first_onboarding_at,
    (SELECT p.itsco_email FROM school_profiles p WHERE p.school_organization_id=s.id LIMIT 1) AS group_email
    FROM agencies s
    WHERE s.organization_type='school' AND s.is_active=1 AND COALESCE(s.is_archived,0)=0
      AND (EXISTS(SELECT 1 FROM organization_affiliations f WHERE f.organization_id=s.id AND f.agency_id=? AND f.is_active=1)
        OR EXISTS(SELECT 1 FROM agency_schools legacy WHERE legacy.school_organization_id=s.id AND legacy.agency_id=? AND legacy.is_active=1))
    ORDER BY s.name`,[agencyId,agencyId,agencyId,agencyId,agencyId]);
  return rows;
}
export async function getAnnualEligibility(agencyId, schoolOrganizationId, schoolYear, db = pool) {
  const schools=await listAnnualSchools(agencyId,db);
  return annualEligibility(schools.find(s=>Number(s.id)===Number(schoolOrganizationId)),schoolYear);
}
export async function getAnnualAccess({agencyId,schoolOrganizationId,schoolYear,cycle=null,now=new Date()}, db=pool) {
  const rules=await getAnnualRules(agencyId,db);
  const eligibility=await getAnnualEligibility(agencyId,schoolOrganizationId,schoolYear,db);
  const [[campaign]]=await db.execute('SELECT status FROM school_reinit_campaigns WHERE agency_id=? AND school_year=?',[agencyId,schoolYear]);
  const [[followup]]=cycle?.id ? await db.execute('SELECT * FROM school_reinit_followups WHERE cycle_id=?',[cycle.id]) : [[]];
  const extension=followup?.extension_until instanceof Date ? followup.extension_until.toISOString().slice(0,10) : followup?.extension_until;
  const schedule=annualSchedule(schoolYear,rules,now,extension);
  const campaignEnabled=['pushed','enabled'].includes(campaign?.status);
  const canWrite=eligibility.eligible&&campaignEnabled&&['open','followup'].includes(schedule.phase)&&cycle?.status!=='finalized'&&followup?.status!=='waived';
  const reason=!eligibility.eligible?eligibility.reason:cycle?.status==='finalized'?'finalized':!campaignEnabled?'campaign_disabled':followup?.status==='waived'?'followup_waived':schedule.phase==='closed'?'deadline_passed':schedule.phase==='scheduled'?'not_open':null;
  return {...eligibility,...schedule,canWrite,reason,followupStatus:followup?.status||null};
}
export async function assertAnnualWrite(cycle, db=pool) {
  const access=await getAnnualAccess({agencyId:cycle.agency_id,schoolOrganizationId:cycle.school_organization_id,schoolYear:cycle.school_year,cycle},db);
  if(!access.canWrite) {
    const messages={first_year_onboarding:'New schools complete onboarding only; an annual update is not required in their first school year.',deadline_passed:'The annual update window has closed. Your saved information is preserved. Contact Schools for help with outstanding items.',not_open:`The annual update opens ${access.opensOn}.`,finalized:'This update is already finalized.',followup_waived:'Staff have closed this follow-up.'};
    throw Object.assign(new Error(messages[access.reason]||'This annual update is not available for changes.'),{status:409,code:'ANNUAL_UPDATE_CLOSED'});
  }
  return access;
}
export async function annualCohort(agencyId,schoolYear,db=pool) {
  const [schools,[cycles],[sections],[questions],[followups]]=await Promise.all([
    listAnnualSchools(agencyId,db),
    db.execute('SELECT * FROM school_reinit_cycles WHERE agency_id=? AND school_year=?',[agencyId,schoolYear]),
    db.execute('SELECT p.* FROM school_reinit_section_progress p JOIN school_reinit_cycles c ON c.id=p.cycle_id WHERE c.agency_id=? AND c.school_year=?',[agencyId,schoolYear]),
    db.execute('SELECT * FROM school_reinit_question_configs WHERE agency_id=? AND school_year=?',[agencyId,schoolYear]),
    db.execute('SELECT f.* FROM school_reinit_followups f JOIN school_reinit_cycles c ON c.id=f.cycle_id WHERE c.agency_id=? AND c.school_year=?',[agencyId,schoolYear])
  ]);
  return schools.map(school=>{
    const cycle=cycles.find(c=>Number(c.school_organization_id)===Number(school.id));
    const progress=sections.filter(s=>s.cycle_id===cycle?.id);
    return {school,cycle,sections:progress,questions,followup:followups.find(f=>f.cycle_id===cycle?.id),...annualEligibility(school,schoolYear),outstanding:outstandingAnnualInfo(progress,questions,cycle?.status==='finalized')};
  });
}
export async function updateAnnualFollowup({cycle,input,userId},db=pool) {
  const rules=await getAnnualRules(cycle.agency_id,db);const today=localDate(new Date(),rules.timezone);
  const note=String(input.note||'').trim();
  if(!note || note.length>2000) throw Object.assign(new Error('Add a follow-up note (up to 2,000 characters).'),{status:400});
  if(!['extend','waive','reopen'].includes(input.action)) throw Object.assign(new Error('Choose extend, waive, or reopen.'),{status:400});
  if(cycle.status==='finalized') throw Object.assign(new Error('This school has already submitted.'),{status:409});
  const eligibility=await getAnnualEligibility(cycle.agency_id,cycle.school_organization_id,cycle.school_year,db);
  if(!eligibility.eligible) throw Object.assign(new Error('This school is exempt from the annual update.'),{status:409});
  const extension=input.action==='extend'?String(input.extensionUntil||''):null;
  const extensionDate=extension?new Date(`${extension}T12:00:00Z`):null;
  if(extension&&(!/^\d{4}-\d{2}-\d{2}$/.test(extension)||extension<today||extension>addDays(today,30)||Number.isNaN(extensionDate.getTime())||extensionDate.toISOString().slice(0,10)!==extension)) throw Object.assign(new Error('Choose an extension ending within the next 30 days.'),{status:400});
  if(input.action==='extend'&&!extension) throw Object.assign(new Error('Choose an extension end date.'),{status:400});
  const [[existing]]=await db.execute('SELECT cycle_id FROM school_reinit_followups WHERE cycle_id=?',[cycle.id]);
  if(!existing) await db.execute("INSERT IGNORE INTO school_reinit_followups (cycle_id,outstanding_json) VALUES (?,JSON_ARRAY())",[cycle.id]);
  await db.execute(`UPDATE school_reinit_followups SET status=?,extension_until=?,resolution_note=?,updated_by_user_id=?,resolved_at=IF(?='waived',UTC_TIMESTAMP(),NULL) WHERE cycle_id=?`,[input.action==='waive'?'waived':'open',extension,note,userId||null,input.action==='waive'?'waived':'open',cycle.id]);
  return getAnnualAccess({agencyId:cycle.agency_id,schoolOrganizationId:cycle.school_organization_id,schoolYear:cycle.school_year,cycle},db);
}
