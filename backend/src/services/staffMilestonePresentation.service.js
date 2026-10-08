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
  const [staff]=await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.preferred_name,u.title,u.credential,u.profile_photo_path,u.provider_start_date,
    (SELECT JSON_UNQUOTE(v.value) FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id
      WHERE v.user_id=u.id AND d.field_key='start_date' AND NULLIF(TRIM(v.value),'') IS NOT NULL
      ORDER BY v.updated_at DESC,v.id DESC LIMIT 1) AS timeline_start_date,
    (SELECT JSON_UNQUOTE(v.value) FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id
      WHERE v.user_id=u.id AND d.field_key='first_client_date' AND NULLIF(TRIM(v.value),'') IS NOT NULL
      ORDER BY v.updated_at DESC,v.id DESC LIMIT 1) AS first_client_date
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?`,[agencyId]);
  return staff.map(s=>({...s,startDate:staffStartDate(s)}));
}
// Markers keep the editable prose intact while refreshing identity photos and dates.
export function fillStaffMarkers(html,staff,asOf=new Date()) {
  const byId=new Map(staff.map(s=>[Number(s.id),s]));
  return String(html||'').replace(/\{\{staff:(\d+):(photo|startDate|tenure)\}\}/g,(_,id,field)=>{
    const person=byId.get(Number(id));if(!person)return '';
    if(field==='photo'){
      const url=publicUploadsUrlFromStoredPath(person.profile_photo_path);
      return url?`<img src="${escape(url)}" alt="${escape(`${person.first_name} ${person.last_name}`)}" width="80" height="80" />`:'';
    }
    const date=staffStartDate(person);
    if(field==='startDate')return date?`Start date: ${escape(date)}`:'Start date: not yet recorded';
    if(!date)return 'Start date: not yet recorded';
    const start=new Date(`${date}T00:00:00Z`),end=new Date(asOf);
    let years=end.getUTCFullYear()-start.getUTCFullYear();
    if(end.getUTCMonth()<start.getUTCMonth()||(end.getUTCMonth()===start.getUTCMonth()&&end.getUTCDate()<start.getUTCDate()))years--;
    return `${Math.max(0,years)} ${years===1?'year':'years'} · Start date: ${escape(date)}`;
  });
}
