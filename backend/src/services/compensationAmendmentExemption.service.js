import pool from '../config/database.js';
export const EXEMPT_DRAFT_KIND='provider_update_compensation_exempt';
export async function isCompensationAmendmentExempt(agencyId,userId,db=pool){
 const [rows]=await db.execute("SELECT id FROM contract_generations WHERE agency_id=? AND candidate_user_id=? AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))=? LIMIT 1",[agencyId,userId,EXEMPT_DRAFT_KIND]);
 return rows.length>0;
}
export function isCompensationUpdatePlan(plan){return !plan||plan.mode==='compensation';}
