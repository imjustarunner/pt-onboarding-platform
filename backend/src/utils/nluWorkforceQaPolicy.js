import {nluTutoringQaMailDomain} from './nluTutoringQaPolicy.js';
const email=value=>String(value||'').trim().toLowerCase();
// Exact retained people and saved work identities; prospective applicants do
// not become employees by owning an example address or appearing in a roster.
export function nluQaWorkIdentity(user) {
 if(Number(user?.is_demo)!==1||Number(user?.is_active)!==1||Number(user?.is_archived||0)!==0||String(user?.status).toUpperCase()!=='ACTIVE_EMPLOYEE')return null;
 const id=Number(user.id||user.provider_user_id),primary=email(user.email),work=email(user.work_email);
 if(id===1496&&user.role==='provider'&&primary==='qa.nlu.tutor@example.com'&&work===primary)return work;
 if(id===1771&&user.role==='staff'&&primary==='qa.nlu.childcare.a@example.com'&&work===primary)return work;
 if(id===1772&&user.role==='staff'&&primary==='qa.nlu.devon.work@example.com'&&work===primary&&email(user.personal_email)==='qa.nlu.childcare.b@example.com')return work;
 return null;
}
export function nluQaWorkflowEmployee(user,agency) {
 return nluTutoringQaMailDomain(agency)&&nluQaWorkIdentity(user) ? true : false;
}
