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
