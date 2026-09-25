import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import { policyError, parseObject } from './supervisedBillingPolicy.service.js';
import { sharedNotePredicate } from './sharedClinicalChart.service.js';
export const noteReviewContent = (payload,addenda) => JSON.stringify({note:maybeDecryptNotePayload(payload),addenda:addenda.map(a=>({id:a.id,body:maybeDecryptNotePayload(a.body),created_at:a.created_at}))});
export async function loadReviewDocument(s,type,id, db = clinicalPool) {
  const table=type==='treatment_plan'?'clinical_treatment_plans':'clinical_notes';
  const authorScope=type==='treatment_plan'
    ? `(d.created_by_user_id = ? OR EXISTS (SELECT 1 FROM clinical_notes n WHERE n.agency_id=d.agency_id AND n.client_id=d.client_id AND n.created_by_user_id=? AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL AND ${sharedNotePredicate('n')}))`
    : 'd.created_by_user_id = ?';
  const [[row]]=await db.execute(`SELECT d.* FROM ${table} d WHERE d.id = ? AND d.agency_id = ? AND ${authorScope}`,[id,s.agencyId,s.providerUserId,...(type==='treatment_plan'?[s.providerUserId]:[])]);
  if(!row || row.is_deleted || ['void','superseded','deleted'].includes(row.status))throw policyError(404,'Document is not available for this supervisee');
  const meta=parseObject(row.metadata_json);
  if([meta.privatePsychotherapyNote,meta.restricted].some(v=>v===true||v==='true'))throw policyError(403,'Restricted records require a separate authorized disclosure workflow');
  let content;
  if(type==='note') {
    const [addenda]=await db.execute('SELECT id,body,created_at FROM clinical_note_addenda WHERE clinical_note_id = ? AND agency_id = ? ORDER BY id',[id,s.agencyId]);
    row.latest_addendum_at=addenda.at(-1)?.created_at || null;
    row.addendum_count=addenda.length;
    content=noteReviewContent(row.note_payload,addenda);
  } else content=JSON.stringify(await ClinicalTreatmentPlan.findById(id));
  return {row,content,hash:crypto.createHash('sha256').update(String(content)).digest('hex')};
}
