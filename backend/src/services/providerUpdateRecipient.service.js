import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import pool from '../config/database.js';
import {nluQaWorkflowEmployee,nluQaWorkIdentity} from '../utils/nluWorkforceQaPolicy.js';
import {QA_EMAIL_INBOX} from '../utils/qaEmailPolicy.js';
const normalize = value => String(value || '').trim().toLowerCase();
const valid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Historical imports put personal addresses in work_email. Only use saved
// addresses on this agency's configured mail domain; never invent an alias.
export function providerUpdateWorkEmail(user, identities, agencyId) {
 const scoped = identities.filter(i => Number(i.agency_id) === Number(agencyId) && i.is_active !== false && Number(i.is_active) !== 0);
 const domains = new Set(scoped.map(i => normalize(i.from_email)).filter(e => valid(e) && e.startsWith('po@')).map(e => e.split('@')[1]));
 const owned = scoped.find(i => i.identity_key === `personal_${user.provider_user_id || user.id}`);
 return [owned?.from_email, user.work_email, user.email].map(normalize).find(e => valid(e) && domains.has(e.split('@')[1])) || null;
}
export async function resolveProviderUpdateRecipients(agencyId, users) {
 const identities = await EmailSenderIdentity.list({agencyId:Number(agencyId),includePlatformDefaults:false,onlyActive:true});
 const qa=new Map();
 const ids=[...new Set(users.map(user=>Number(user.provider_user_id||user.id)).filter(id=>[1496,1771,1772].includes(id)))];
 if([453,454].includes(Number(agencyId))&&ids.length){
  const[rows]=await pool.execute(`SELECT u.id,u.email,u.work_email,u.personal_email,u.role,u.is_demo,u.is_active,u.is_archived,u.status,
    a.id AS qa_agency_id,a.slug,a.feature_flags,a.is_active AS qa_agency_active,a.is_archived AS qa_agency_archived
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.is_active=1
    JOIN agencies a ON a.id=ua.agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    WHERE a.id=? AND u.id IN (${ids.map(()=>'?').join(',')})`,[Number(agencyId),...ids]);
  for(const row of rows){const agency={id:row.qa_agency_id,slug:row.slug,feature_flags:row.feature_flags,is_active:row.qa_agency_active,is_archived:row.qa_agency_archived};if(Number(row.qa_agency_id)===Number(agencyId)&&nluQaWorkflowEmployee(row,agency))qa.set(Number(row.id),nluQaWorkIdentity(row));}
 }
 return users.map(user=>{const userId=Number(user.provider_user_id||user.id),address=qa.get(userId),restricted=[453,454].includes(Number(agencyId))&&(Number(user.is_demo)||[1496,1771,1772].includes(userId));const result={...user,work_email:address||(restricted?null:providerUpdateWorkEmail(user,identities,agencyId)),qa_workflow_allowed:!!address};delete result.qa_workflow_agency_id;delete result.qa_physical_to;if(address)Object.assign(result,{qa_workflow_agency_id:Number(agencyId),qa_physical_to:QA_EMAIL_INBOX});return result;});
}
