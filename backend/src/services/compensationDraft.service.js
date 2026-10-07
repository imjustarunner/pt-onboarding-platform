import pool from '../config/database.js';
import sanitizeHtml from 'sanitize-html';
import {amendmentIssues, renderAmendment} from '../content/itscoOctober2026Drafts.js';

export const DRAFT_KIND = 'provider_update_compensation';
export function cleanDraftHtml(value) {
 return sanitizeHtml(String(value || ''), {allowedTags:sanitizeHtml.defaults.allowedTags,allowedAttributes:{a:['href','title','target'],th:['colspan','rowspan'],td:['colspan','rowspan']},allowedSchemes:['https','mailto']});
}
const parse = v => typeof v === 'string' ? JSON.parse(v) : v;
const notFound=()=>Object.assign(new Error('Compensation draft not found.'),{status:404});

export async function listCompensationDrafts(agencyId) {
 const [rows]=await pool.execute(`SELECT id,candidate_user_id,token_values_json,created_at FROM contract_generations
  WHERE agency_id=? AND task_id IS NULL AND user_specific_document_id IS NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))=? ORDER BY id`,[agencyId,DRAFT_KIND]);
 return rows.map(row=>{const d=parse(row.token_values_json);return {id:row.id,userId:row.candidate_user_id,name:d.employee.name,category:d.schedule.category,level:d.schedule.level,issues:amendmentIssues(d),example:!!d.example,pushId:d.pushId};});
}
export async function getCompensationDraft(agencyId,id,db=pool) {
 const [rows]=await db.execute(`SELECT id,token_values_json,rendered_html FROM contract_generations
  WHERE id=? AND agency_id=? AND task_id IS NULL AND user_specific_document_id IS NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))=? LIMIT 1`,[id,agencyId,DRAFT_KIND]);
 if(!rows[0])throw notFound();
 const data=parse(rows[0].token_values_json);
 return {id:rows[0].id,data,html:rows[0].rendered_html,issues:amendmentIssues(data)};
}
export function editCompensationDraft(existing,patch,userId) {
 const result=structuredClone(existing);
 for(const key of ['category','level','creditRate','hcodeRate','indirectRate','supportRate','ptoRate']) {
  if(!Object.hasOwn(patch.schedule || {},key))continue;
  const raw=patch.schedule[key];
  const v=raw===''||raw==null?null:Number(raw);
  if(v!==null&&(!Number.isFinite(v)||v<0||v>100000))throw Object.assign(new Error(`Invalid ${key}.`),{status:400});
  if(key==='category'&&v!==null&&![1,2,3].includes(v))throw Object.assign(new Error('Invalid category.'),{status:400});
  if(key==='level'&&v!==null&&![1,2,3,4,5].includes(v))throw Object.assign(new Error('Invalid level.'),{status:400});
  result.schedule[key]=v;
 }
 if(patch.schedule?.levelDescription!==undefined)result.schedule.levelDescription=String(patch.schedule.levelDescription).slice(0,2000);
 if(patch.originalAgreementDate!==undefined)result.employee.originalAgreementDate=String(patch.originalAgreementDate).slice(0,300);
 if(patch.additionalTerms!==undefined)result.additionalTerms=String(patch.additionalTerms).slice(0,6000);
 if(patch.commonClausesHtml!==undefined)result.commonClausesHtml=cleanDraftHtml(patch.commonClausesHtml).slice(0,100000);
 result.editedByUserId=userId;result.editedAt=new Date().toISOString();
 return result;
}
export async function saveCompensationDraft(agencyId,id,patch,userId) {
 const prior=await getCompensationDraft(agencyId,id);
 const data=editCompensationDraft(prior.data,patch,userId);
 const html=renderAmendment(data);
 const [updated]=await pool.execute(`UPDATE contract_generations SET token_values_json=?,rendered_html=?
  WHERE id=? AND agency_id=? AND task_id IS NULL AND user_specific_document_id IS NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))=?`,[JSON.stringify(data),html,id,agencyId,DRAFT_KIND]);
 if(!updated.affectedRows)throw notFound();
 return {id,data,html,issues:amendmentIssues(data)};
}
