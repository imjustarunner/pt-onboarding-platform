import pool from '../config/database.js';
import {listAffiliatedSchools} from './schoolCoverageMetrics.service.js';

const weekdays=new Set(['Monday','Tuesday','Wednesday','Thursday','Friday']);
const parseDays=value=>{try{const list=typeof value==='string'?JSON.parse(value):value;return Array.isArray(list)?[...new Set(list.filter(day=>weekdays.has(day)))]:[];}catch{return [];}};

/** Aggregate school demand only: no client IDs, names, contacts, or clinical narratives. */
export async function getSchoolStaffingWaitlists({agencyId,schoolYear,database=pool,listSchools=listAffiliatedSchools}) {
 const schools=(await listSchools(agencyId,{orgType:'school'})).filter(s=>![false,0,'0'].includes(s.is_active)&&!Number(s.is_archived));
 const ids=schools.map(s=>Number(s.id)).filter(id=>Number.isSafeInteger(id)&&id>0);
 if(!ids.length)return {agencyId,schoolYear,schools:[],summary:{schoolsWithWaitlists:0,waitlistEntries:0,openPostings:0}};
 const marks=ids.map(()=>'?').join(',');
 const [[insuranceRows],[needs]]=await Promise.all([
  database.execute(`SELECT membership.school_id,
    COALESCE(NULLIF(TRIM(c.primary_insurer_name),''),CASE WHEN i.insurance_key NOT IN ('unknown','unlisted') THEN NULLIF(TRIM(i.label),'') END,'Not recorded') AS insurance_name,
    COUNT(DISTINCT c.id) AS client_count
   FROM (SELECT coa.client_id,coa.organization_id AS school_id FROM client_organization_assignments coa
      WHERE coa.is_active=1 AND coa.organization_id IN (${marks})
     UNION SELECT primary_client.id,primary_client.organization_id FROM clients primary_client
      WHERE primary_client.agency_id=? AND primary_client.organization_id IN (${marks})) membership
   JOIN clients c ON c.id=membership.client_id AND c.agency_id=?
   LEFT JOIN client_statuses status ON status.id=c.client_status_id
   LEFT JOIN insurance_types i ON i.id=c.insurance_type_id AND i.agency_id=c.agency_id
   WHERE UPPER(COALESCE(c.status,'')) NOT IN ('ARCHIVED','DECLINED')
    AND (LOWER(COALESCE(status.status_key,''))='waitlist' OR (status.id IS NULL AND UPPER(COALESCE(c.status,''))='WAITLIST'))
   GROUP BY membership.school_id,insurance_name ORDER BY membership.school_id,insurance_name`,[...ids,agencyId,...ids,agencyId]),
  database.execute(`SELECT id,school_organization_id,title,body,days_json,slots_needed FROM provider_year_update_school_needs
   WHERE agency_id=? AND school_year=? AND status='open' AND school_organization_id IN (${marks}) ORDER BY created_at DESC,id DESC`,[agencyId,schoolYear,...ids])
 ]);
 const rows=schools.map(s=>{
  const insuranceMix=insuranceRows.filter(row=>Number(row.school_id)===Number(s.id)).map(row=>({name:row.insurance_name,count:Number(row.client_count)||0}));
  const staffingNeeds=needs.filter(row=>Number(row.school_organization_id)===Number(s.id)).map(row=>({id:Number(row.id),title:row.title||'',notes:row.body||'',days:parseDays(row.days_json),slotsNeeded:Number(row.slots_needed)||1}));
  return {schoolId:Number(s.id),schoolName:s.name,schoolSlug:s.slug||s.portal_url||'',waitlistCount:insuranceMix.reduce((sum,row)=>sum+row.count,0),insuranceMix,staffingNeeds};
 }).filter(s=>s.waitlistCount>0||s.staffingNeeds.length).sort((a,b)=>b.waitlistCount-a.waitlistCount||String(a.schoolName).localeCompare(String(b.schoolName)));
 return {agencyId,schoolYear,schools:rows,summary:{schoolsWithWaitlists:rows.filter(s=>s.waitlistCount>0).length,waitlistEntries:rows.reduce((sum,s)=>sum+s.waitlistCount,0),openPostings:rows.reduce((sum,s)=>sum+s.staffingNeeds.length,0)}};
}
