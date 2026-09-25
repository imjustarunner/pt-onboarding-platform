import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import { policyError } from './supervisedBillingPolicy.service.js';
export const noteReviewContent = (payload,addenda) => JSON.stringify({note:maybeDecryptNotePayload(payload),addenda:addenda.map(a=>({id:a.id,body:maybeDecryptNotePayload(a.body),created_at:a.created_at}))});
export async function loadReviewDocument(s,type,id, db = clinicalPool) {
  const table=type==='treatment_plan'?'clinical_treatment_plans':'clinical_notes';
  const [[row]]=await db.execute(`SELECT d.* FROM ${table} d WHERE d.id = ? AND d.agency_id = ? AND d.created_by_user_id = ?`,[id,s.agencyId,s.providerUserId]);
  if(!row || row.is_deleted || ['void','superseded','deleted'].includes(row.status))throw policyError(404,'Document is not available for this supervisee');
  let content;
  if(type==='note') {
    const [addenda]=await db.execute('SELECT id,body,created_at FROM clinical_note_addenda WHERE clinical_note_id = ? AND agency_id = ? ORDER BY id',[id,s.agencyId]);
    row.latest_addendum_at=addenda.at(-1)?.created_at || null;
    row.addendum_count=addenda.length;
    content=noteReviewContent(row.note_payload,addenda);
  } else content=JSON.stringify(await ClinicalTreatmentPlan.findById(id));
  return {row,content,hash:crypto.createHash('sha256').update(String(content)).digest('hex')};
}
