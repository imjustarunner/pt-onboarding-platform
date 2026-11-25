import pool from '../config/database.js';
import {requireNarrivaAgency,positiveId,parseNarrivaObject,narrivaError} from './narrivaAccess.service.js';
import {maybeDecryptNotePayload} from './clinicalNoteCrypto.service.js';
import {logNoteAidChartEvent} from './noteAidChartAudit.service.js';

// Routine review metadata is separate from sampled/paid audit reports. No narrative,
// assessment answers, names or confidential addenda are returned by this endpoint.
export async function listNarrivaReviewResults(req) {
 const agencyId=positiveId(req.query.agencyId);
 await requireNarrivaAgency(req.user,agencyId);
 const agencyWide=['admin','agency_admin','super_admin'].includes(req.user.role) || [true,1,'1'].includes(req.user.has_supervisor_privileges);
 const own=req.query.scope==='mine' || !agencyWide;
 const limit=Math.min(100,Math.max(1,Math.floor(Number(req.query.limit))||50));
 const before=positiveId(req.query.before) || Number.MAX_SAFE_INTEGER;
 const [rows]=await pool.execute(`SELECT id,actor_user_id,clinical_note_id,draft_id,completed_at,result_encrypted FROM narriva_reviews WHERE agency_id=? AND completed_at IS NOT NULL AND id<? ${own?'AND actor_user_id=?':''} ORDER BY id DESC LIMIT ${limit}`,[agencyId,before,...(own?[req.user.id]:[])]);
 const authorIds=[...new Set(rows.map(row=>Number(row.actor_user_id)))];
 const [authors]=authorIds.length?await pool.execute(`SELECT id,first_name,last_name FROM users WHERE id IN (${authorIds.map(()=>'?').join(',')})`,authorIds):[[]];
 const results=rows.map(row=>{
  const review=parseNarrivaObject(maybeDecryptNotePayload(row.result_encrypted));
  return {id:row.id,authorUserId:row.actor_user_id,authorName:authors.filter(author=>Number(author.id)===Number(row.actor_user_id)).map(author=>[author.first_name,author.last_name].filter(Boolean).join(' '))[0] || null,clientId:positiveId(review.clientId),noteId:row.clinical_note_id,draftId:row.draft_id,completedAt:row.completed_at,phase:review.phase,serviceCode:review.documentationCode,status:review.status,score:review.scoring?.score ?? null,manualEdited:review.manualEdited===true,keptAsWritten:[...(review.priorDecisions || []),...(review.checks || []).flatMap(c=>(c.findings || []).filter(f=>f.bypassed).map(f=>({checkId:c.id,id:f.id})))].map(f=>({checkId:f.checkId,id:f.id})),qualityKept:!!review.qualityBypass,checks:(review.checks || []).map(c=>({id:c.id,label:c.label,status:c.status})),quickSignEligible:review.quickSignEligible===true};
 });
 await logNoteAidChartEvent(req,{agencyId,action:'narriva_review_results_viewed',metadata:{scope:own?'mine':'agency',count:results.length}});
 return {results,agencyWide:!own,nextBefore:rows.length===limit?rows.at(-1).id:null};
}
