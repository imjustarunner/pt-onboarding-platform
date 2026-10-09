import pool from '../config/database.js';
import {publicUploadsUrlFromStoredPath} from '../utils/uploads.js';
const escape=value=>String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function staffStartDate(row={}) {
  for(const value of [row.timeline_start_date,row.provider_start_date,row.first_client_date]){
    if(!value)continue;
    const date=value instanceof Date ? value.toISOString().slice(0,10) : String(value).replace(/^"|"$/g,'').slice(0,10);
    if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date)))return date;
  }
  return null;
}
export function applicationWorkBase(data){
 if(typeof data==='string'){try{data=JSON.parse(data);}catch{return '';}}
 if(!data||typeof data!=='object')return '';
 // Work-location answers only: a home address is not an office assignment.
 for(const [key,value] of Object.entries(data)){
  if(/^(?:preferred_)?(?:work_location|office_location|work_region|job_location|provider_location_selection)$/i.test(key)){
   const text=Array.isArray(value)?value.join(' / '):typeof value==='string'?value:'';
   if(/Denver|Colorado Springs|Windchime/i.test(text))return text.replace(/Windchime(?! \/ Colorado Springs)/ig,'Windchime / Colorado Springs');
  }
 }
 for(const key of ['responses','submission','applicant','application']){const found=applicationWorkBase(data[key]);if(found)return found;}
 return '';
}
export async function staffMilestones(agencyId) {
  const [staff]=await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.preferred_name,u.title,u.credential,u.profile_photo_path,u.provider_start_date,u.work_location,u.terminated_at,ua.agency_position,
    (SELECT JSON_UNQUOTE(v.value) FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id
      WHERE v.user_id=u.id AND d.field_key='start_date' AND NULLIF(TRIM(v.value),'') IS NOT NULL
      ORDER BY v.updated_at DESC,v.id DESC LIMIT 1) AS timeline_start_date,
    (SELECT JSON_UNQUOTE(v.value) FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id
      WHERE v.user_id=u.id AND d.field_key='first_client_date' AND NULLIF(TRIM(v.value),'') IS NOT NULL
      ORDER BY v.updated_at DESC,v.id DESC LIMIT 1) AS first_client_date
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?`,[agencyId]);
  const [locations]=await pool.execute(`SELECT DISTINCT ul.user_id,ol.city FROM user_office_locations ul
    JOIN office_locations ol ON ol.id=ul.office_location_id AND ol.is_active=1 WHERE ul.is_active=1
    AND (ol.agency_id=? OR EXISTS (SELECT 1 FROM office_location_agencies a WHERE a.office_location_id=ol.id AND a.agency_id=?))`,[agencyId,agencyId]);
  const [assigned]=await pool.execute(`SELECT DISTINCT a.provider_id AS user_id,l.city FROM office_standing_assignments a
    JOIN office_locations l ON l.id=a.office_location_id AND l.is_active=1 WHERE a.is_active=1 AND a.booking_agency_id=?`,[agencyId]);
  locations.push(...assigned);
  const [applicationBases]=await pool.execute(`SELECT v.user_id,JSON_UNQUOTE(v.value) AS location FROM user_info_values v
    JOIN user_info_field_definitions d ON d.id=v.field_definition_id JOIN user_agencies ua ON ua.user_id=v.user_id AND ua.agency_id=?
    WHERE d.field_key IN ('provider_work_location','provider_location_selection','work_location') ORDER BY v.updated_at DESC,v.id DESC`,[agencyId]);
  for(const person of staff)if(!person.work_location)person.work_location=applicationBases.find(x=>Number(x.user_id)===Number(person.id)&&/Denver|Colorado Springs|Windchime/i.test(x.location||''))?.location?.replace(/Windchime/ig,'Windchime / Colorado Springs');
  const unresolved=staff.filter(person=>!person.work_location&&!locations.some(l=>Number(l.user_id)===Number(person.id)));
  if(unresolved.length){
    const [applications]=await pool.execute(`SELECT s.id,s.guardian_user_id FROM intake_submissions s JOIN intake_links l ON l.id=s.intake_link_id
      WHERE l.organization_id=? AND l.form_type='job_application' AND s.status IN ('submitted','completed','approved')
      AND s.guardian_user_id IN (${unresolved.map(()=>'?').join(',')}) ORDER BY s.id DESC`,[agencyId,...unresolved.map(s=>s.id)]);
    const {default:IntakeSubmission}=await import('../models/IntakeSubmission.model.js');
    const checked=new Set();
    for(const row of applications){if(checked.has(Number(row.guardian_user_id)))continue;checked.add(Number(row.guardian_user_id));
      const submission=await IntakeSubmission.findById(row.id);const person=unresolved.find(s=>Number(s.id)===Number(row.guardian_user_id));
      if(person)person.work_location=applicationWorkBase(submission?.intake_data);
    }
  }
  return staff.map(s=>({...s,startDate:staffStartDate(s),departureDate:s.terminated_at instanceof Date?s.terminated_at.toISOString().slice(0,10):String(s.terminated_at||'').slice(0,10),bases:[...new Set(locations.filter(l=>Number(l.user_id)===Number(s.id)&&['Denver','Colorado Springs'].includes(l.city)).map(l=>l.city))]}));
}
// Markers keep the editable prose intact while refreshing identity photos and dates.
export function fillStaffMarkers(html,staff,asOf=new Date()) {
  const byId=new Map(staff.map(s=>[Number(s.id),s]));
  return String(html||'').replace(/\{\{staff:(\d+):(photo|startDate|tenure|position|base)\}\}/g,(_,id,field)=>{
    const person=byId.get(Number(id));if(!person)return '';
    if(field==='position')return escape(person.title||person.agency_position||'Position to be confirmed');
    if(field==='base')return escape(person.bases?.join(' / ')||(/Denver|Colorado Springs/i.test(person.work_location||'')?person.work_location:'Base location to be confirmed'));
    if(field==='photo'){
      const url=publicUploadsUrlFromStoredPath(person.profile_photo_path);
      return url?`<img src="${escape(url)}" alt="${escape(`${person.first_name} ${person.last_name}`)}" width="112" height="112" style="width:112px;height:112px;object-fit:cover;border-radius:50%;border:4px solid #719567" />`:'';
    }
    const date=staffStartDate(person);
    const displayDate=date?`${date.slice(5,7)}-${date.slice(8,10)}-${date.slice(0,4)}`:'';
    if(field==='startDate')return date?`Start date: ${displayDate}`:'Start date: not yet recorded';
    if(!date)return 'Start date: not yet recorded';
    const start=new Date(`${date}T00:00:00Z`),end=new Date(asOf);
    let years=end.getUTCFullYear()-start.getUTCFullYear();
    if(end.getUTCMonth()<start.getUTCMonth()||(end.getUTCMonth()===start.getUTCMonth()&&end.getUTCDate()<start.getUTCDate()))years--;
    return `<strong>${Math.max(0,years)} ${years===1?'year':'years'}!</strong> · Start date: ${displayDate}`;
  });
}
