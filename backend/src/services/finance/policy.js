import pool from '../../config/database.js';
import { billingError, positiveId } from '../familyBillingPolicy.service.js';
export const fail = billingError;
export const id = positiveId;
export function cents(value, allowZero=false) {
 const n=Number(value);if(!Number.isSafeInteger(n)||n<(allowZero?0:1)||n>100000000000)throw fail(400,'Enter a valid amount in cents');return n;
}
export function text(value,max=200,required=true) {
 const s=String(value??'').trim();if((required&&!s)||s.length>max)throw fail(400,`Text must contain ${required?'1':'0'}–${max} characters`);return s;
}
export function date(value,optional=false) {
 if(optional&&!value)return null;
 const s=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw fail(400,'Use a valid calendar date');return s;
}
export function period(start,end){const a=date(start),b=date(end);if(a>b)throw fail(400,'End date must follow start date');return [a,b];}
export async function financeScope(user,agencyId,{write=false,manage=false}={},db=pool){
 agencyId=id(agencyId);
 const [[org]]=await db.execute('SELECT f.*,a.name,a.slug,a.color_palette,a.logo_url,m.name AS manager_name FROM finance_organizations f JOIN agencies a ON a.id=f.agency_id LEFT JOIN agencies m ON m.id=f.manager_agency_id WHERE f.agency_id=? AND f.enabled=1 AND a.is_active=1',[agencyId]);
 if(!org)throw fail(404,'Finance Operations is not enabled for this organization');
 let role=user?.role==='super_admin'?'manager':null;
 if(!role){
  const [members]=await db.execute('SELECT ua.agency_id,fa.role FROM user_agencies ua LEFT JOIN finance_access fa ON fa.agency_id=ua.agency_id AND fa.user_id=ua.user_id WHERE ua.user_id=? AND ua.agency_id IN (?,?)',[id(user?.id),agencyId,org.manager_agency_id||agencyId]);
  const own=members.find(m=>Number(m.agency_id)===agencyId),sponsor=org.manager_agency_id?members.find(m=>Number(m.agency_id)===Number(org.manager_agency_id)):null;
  if(sponsor&&(user.role==='admin'||sponsor.role==='manager'))role='manager';
  else if(own)role=own.role||(user.role==='admin'?(org.mode==='sponsored'?'requester':'manager'):null);
 }
 if(!role||(write&&role==='viewer')||(manage&&role!=='manager'))throw fail(403,'Finance permission is required for this organization');
 return {agencyId,userId:id(user.id),role,org};
}
export async function financeOrganizations(user,db=pool){
 const [rows]=await db.execute('SELECT agency_id FROM finance_organizations WHERE enabled=1 ORDER BY agency_id');const result=[];
 for(const row of rows){try{const s=await financeScope(user,row.agency_id,{},db);const [[b]]=await db.execute('SELECT COALESCE(SUM(amount_cents),0) total FROM finance_budgets WHERE agency_id=?',[row.agency_id]);const [e]=await db.execute('SELECT status,amount_cents FROM finance_expenses WHERE agency_id=?',[row.agency_id]);result.push({...s.org,role:s.role,summary:{budget:Number(b.total),...expenseStateTotals(e)}});}catch(e){if(![403,404].includes(e.status))throw e;}}
 return result;
}
export async function related(db,table,value,agencyId,optional=false){
 if(optional&&!value)return null;const n=id(value);
 const [[row]]=await db.execute(`SELECT * FROM ${table} WHERE id=? AND agency_id=?`,[n,agencyId]);if(!row)throw fail(400,'A related record belongs to another organization or is unavailable');return row;
}
export async function staff(db,value,agencyId){if(!value)return null;const n=id(value);const [[row]]=await db.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=?',[n,agencyId]);if(!row)throw fail(400,'The staff member does not belong to this organization');return n;}
export async function audit(db,scope,action,type,objectId,detail={}){await db.execute('INSERT INTO finance_audit (agency_id,actor_user_id,action,object_type,object_id,detail_json) VALUES (?,?,?,?,?,?)',[scope.agencyId,scope.userId||null,action,type,objectId||null,JSON.stringify(detail)]);}
export async function transaction(scope,fn,db=pool){const conn=await db.getConnection();try{await conn.beginTransaction();const [[org]]=await conn.execute('SELECT enabled FROM finance_organizations WHERE agency_id=? FOR UPDATE',[scope.agencyId]);if(!org?.enabled)throw fail(409,'Finance Operations was paused');const value=await fn(conn);await conn.commit();return value;}catch(e){await conn.rollback();throw e;}finally{conn.release();}}
export const committedStatuses=['approved','scheduled'];
export function expenseStateTotals(expenses){return expenses.reduce((a,e)=>{const n=Number(e.amount_cents);if(e.status==='paid')a.paid+=n;else if(committedStatuses.includes(e.status))a.committed+=n;else if(['submitted','in_review','needs_info'].includes(e.status))a.pending+=n;return a;},{paid:0,committed:0,pending:0});}
export function csvCell(value){const s=String(value??'');return '"'+(/^[=+\-@\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';}

export async function financeAgencyIds(user,db=pool){
 if(!user?.id)return [];
 try{
  const [rows]=await db.execute(`SELECT DISTINCT f.agency_id FROM finance_organizations f JOIN agencies a ON a.id=f.agency_id
   LEFT JOIN user_agencies own ON own.agency_id=f.agency_id AND own.user_id=?
   LEFT JOIN finance_access own_access ON own_access.agency_id=f.agency_id AND own_access.user_id=?
   LEFT JOIN user_agencies sponsor ON sponsor.agency_id=f.manager_agency_id AND sponsor.user_id=?
   LEFT JOIN finance_access sponsor_access ON sponsor_access.agency_id=f.manager_agency_id AND sponsor_access.user_id=?
   WHERE f.enabled=1 AND a.is_active=1 AND (?='super_admin' OR (own.user_id IS NOT NULL AND (?='admin' OR own_access.role IS NOT NULL)) OR (sponsor.user_id IS NOT NULL AND (?='admin' OR sponsor_access.role='manager')))`,[user.id,user.id,user.id,user.id,user.role,user.role,user.role]);
  return rows.map(r=>Number(r.agency_id));
 }catch(e){if(e.code==='ER_NO_SUCH_TABLE')return [];throw e;}
}
