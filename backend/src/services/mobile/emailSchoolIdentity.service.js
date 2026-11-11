import pool from '../../config/database.js';
import {publicUploadsUrlFromStoredPath} from '../../utils/uploads.js';

const normalizeAddress=value=>typeof value==='string'?value.trim().toLowerCase():'';
function recipients(value){
 let parsed=value;
 if(typeof parsed==='string'){try{parsed=JSON.parse(parsed);}catch{return [];}}
 if(!Array.isArray(parsed))return [];
 return parsed.map(item=>normalizeAddress(item?.email)).filter(email=>email && email.length<=320);
}
function sender(value){let parsed=value;if(typeof parsed==='string'){try{parsed=JSON.parse(parsed);}catch{return [];}}const email=normalizeAddress(parsed?.email);return email && email.length<=320?[email]:[];}
const addressSql="LOWER(TRIM(CAST(sp.itsco_email AS CHAR CHARACTER SET utf8mb4))) COLLATE utf8mb4_unicode_ci";

/** Resolve school logos from stored envelope metadata and active affiliations only. */
export async function mobileEmailSchoolIdentities(rows,{db=pool}={}){
 const ids=[...new Set(rows.map(row=>Number(row.id)).filter(id=>Number.isSafeInteger(id)&&id>0))];
 if(!ids.length)return new Map();
 // Keep JSON decoding outside a correlated JSON_TABLE/EXISTS join. MySQL 8.0
 // can optimize that lateral subquery differently from newer local versions.
 const [receipts]=await db.execute(`SELECT c.id AS conversation_id,c.agency_id,m.from_json,m.to_json,m.cc_json
  FROM communication_conversations c JOIN communication_messages m ON m.conversation_id=c.id
  WHERE c.id IN(${ids.map(()=>'?').join(',')}) AND COALESCE(m.is_internal_note,0)=0
   AND (m.auto_reply_kind='school_group_notification' OR m.id=(SELECT MAX(latest.id) FROM communication_messages latest WHERE latest.conversation_id=c.id AND COALESCE(latest.is_internal_note,0)=0 AND COALESCE(latest.send_status,'sent') NOT IN('cancelled','preparing')))
  LIMIT 1001`,ids);
 if(receipts.length>1000)return new Map();
 const byConversation=new Map(),addresses=new Set(),agencyIds=new Set();
 for(const receipt of receipts){
  const id=Number(receipt.conversation_id),agencyId=Number(receipt.agency_id);
  if(!ids.includes(id)||!Number.isSafeInteger(agencyId)||agencyId<1)continue;
  const selected=[...new Set([...sender(receipt.from_json),...recipients(receipt.to_json),...recipients(receipt.cc_json)])];
  if(!selected.length)continue;
  const entries=byConversation.get(id)||[];entries.push({agencyId,addresses:selected});byConversation.set(id,entries);
  agencyIds.add(agencyId);for(const email of selected)addresses.add(email);
 }
 if(!addresses.size||addresses.size>1000)return new Map();
 const [matches]=await db.execute(`SELECT DISTINCT oa.agency_id,sp.itsco_email,school.id,school.name,school.logo_url,school_icon.file_path AS school_icon_path
  FROM school_profiles sp JOIN agencies school ON school.id=sp.school_organization_id
   AND school.is_active=1 AND COALESCE(school.is_archived,0)=0 AND school.organization_type='school'
  LEFT JOIN icons school_icon ON school_icon.id=school.icon_id
  JOIN organization_affiliations oa ON oa.organization_id=school.id AND oa.is_active=1
  WHERE oa.agency_id IN(${[...agencyIds].map(()=>'?').join(',')})
   AND ${addressSql} IN(${[...addresses].map(()=>'?').join(',')})`,[...agencyIds,...addresses]);
 const byAddress=new Map();
 for(const school of matches){
  const key=`${Number(school.agency_id)}:${normalizeAddress(school.itsco_email)}`,schools=byAddress.get(key)||new Map();
  schools.set(Number(school.id),school);byAddress.set(key,schools);
 }
 const result=new Map();
 for(const [id,receipts]of byConversation){
  const schools=new Map();
  for(const receipt of receipts)for(const email of receipt.addresses)for(const [schoolId,school]of byAddress.get(`${receipt.agencyId}:${email}`)||[])schools.set(schoolId,school);
  if(schools.size!==1)continue;
  const school=[...schools.values()][0],logo=publicUploadsUrlFromStoredPath(school.school_icon_path||school.icon_file_path||school.icon_path||school.logo_path||school.logo_url);
  if(logo)result.set(id,{schoolId:Number(school.id),schoolName:school.name,avatar:logo});
 }
 return result;
}

/** Actual staff sender/counterparty, matched to a current agency membership. */
export async function mobileEmailPersonIdentities(rows,{db=pool}={}){
 const candidates=new Map(),addresses=new Set(),agencyIds=new Set();
 for(const row of rows){const agencyId=Number(row.agency_id),emails=[...new Set([...sender(row.latest_from),normalizeAddress(row.sender_email)].filter(Boolean))];if(!Number.isSafeInteger(agencyId)||agencyId<=0||!emails.length)continue;candidates.set(Number(row.id),{agencyId,emails});agencyIds.add(agencyId);for(const email of emails)addresses.add(email);}
 if(!addresses.size || addresses.size>1000)return new Map();
 const [matches]=await db.execute(`SELECT DISTINCT ua.agency_id,u.id,u.email,u.work_email,u.personal_email,u.profile_photo_path
  FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND COALESCE(ua.is_active,1)=1
  WHERE ua.agency_id IN(${[...agencyIds].map(()=>'?').join(',')}) AND u.role IN('provider','admin','support','super_admin')
   AND (LOWER(TRIM(CONVERT(u.email USING utf8mb4))) COLLATE utf8mb4_unicode_ci IN(${[...addresses].map(()=>'?').join(',')})
    OR LOWER(TRIM(CONVERT(u.work_email USING utf8mb4))) COLLATE utf8mb4_unicode_ci IN(${[...addresses].map(()=>'?').join(',')})
    OR LOWER(TRIM(CONVERT(u.personal_email USING utf8mb4))) COLLATE utf8mb4_unicode_ci IN(${[...addresses].map(()=>'?').join(',')}))`,[...agencyIds,...addresses,...addresses,...addresses]);
 const byAddress=new Map();for(const person of matches){for(const value of [person.email,person.work_email,person.personal_email]){const email=normalizeAddress(value);if(!email)continue;const key=`${Number(person.agency_id)}:${email}`,people=byAddress.get(key)||new Map();people.set(Number(person.id),person);byAddress.set(key,people);}}
 const result=new Map();for(const [id,{agencyId,emails}]of candidates){for(const email of emails){const people=byAddress.get(`${agencyId}:${email}`);if(people?.size!==1)continue;const person=[...people.values()][0],avatar=publicUploadsUrlFromStoredPath(person.profile_photo_path);if(avatar)result.set(id,{avatar,staffId:Number(person.id)});break;}}
 return result;
}
