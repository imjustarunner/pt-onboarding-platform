import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
export const NOTE_BILLING_DISPOSITIONS=['chart_only','entered_in_error','documented_elsewhere','therapy_notes'];
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function noteBillingExclusion({agencyId,noteId,sessionId},db=clinicalPool){
 const [[row]]=await db.execute(`SELECT id,disposition,reason,actor_user_id,created_at FROM clinical_note_billing_exclusions
  WHERE agency_id=? AND (clinical_note_id=? OR (clinical_session_id IS NOT NULL AND clinical_session_id=?)) ORDER BY id DESC LIMIT 1`,[agencyId,noteId||0,sessionId||0]);
 return row||null;
}
export async function assertNoteBillingAllowed(input,db=clinicalPool){
 if(await noteBillingExclusion(input,db))throw fail(409,'This encounter is saved in the chart without billing. Its administrative disposition prevents claim preparation and submission.');
}
export async function excludeNoteFromBilling({agencyId,noteId,actor,disposition,reason,confirmed},dbPool=clinicalPool){
 if(!['super_admin','superadmin'].includes(actor?.role))throw fail(403,'Only a superadministrator can set this administrative chart disposition.');
 if(!Number.isSafeInteger(Number(agencyId))||Number(agencyId)<1||!Number.isSafeInteger(Number(noteId))||Number(noteId)<1||!Number.isSafeInteger(Number(actor.id))||Number(actor.id)<1)throw fail(400,'A valid practice, note, and signed-in actor are required.');
 reason=String(reason||'').trim();
 if(!NOTE_BILLING_DISPOSITIONS.includes(disposition)||reason.length<10||reason.length>2000||confirmed!==true)throw fail(400,'Choose a chart disposition, explain it, and confirm that this encounter must not produce a claim.');
 const {recordClaimEvent}=await import('./claimMdWorkflow.service.js');
 const {previouslyTransmitted}=await import('./claimServiceChanges.service.js');
 const db=await dbPool.getConnection();
 try{
  await db.beginTransaction();
  const [[reference]]=await db.execute('SELECT clinical_session_id FROM clinical_notes WHERE id=? AND agency_id=? AND is_deleted=0',[noteId,agencyId]);
  if(!reference)throw fail(404,'Clinical note not found in this practice.');
  if(reference.clinical_session_id)await db.execute('SELECT id FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE',[reference.clinical_session_id,agencyId]);
  const [[note]]=await db.execute('SELECT id,clinical_session_id,provider_signed_at FROM clinical_notes WHERE id=? AND agency_id=? AND is_deleted=0 FOR UPDATE',[noteId,agencyId]);
  if(!note||Number(note.clinical_session_id||0)!==Number(reference.clinical_session_id||0))throw fail(409,'The encounter link changed. Reload this note.');
  const [claims]=await db.execute('SELECT * FROM clinical_claims WHERE agency_id=? AND clinical_session_id=? AND is_deleted=0 FOR UPDATE',[agencyId,note.clinical_session_id||0]);
  if(claims.some(c=>c.claim_lifecycle==='queued'))throw fail(409,'A claim transmission is unresolved. Reconcile it before excluding this encounter from billing.');
  const [entry]=await db.execute(`INSERT INTO clinical_note_billing_exclusions(agency_id,clinical_note_id,clinical_session_id,disposition,reason,actor_user_id) VALUES(?,?,?,?,?,?)`,[agencyId,noteId,note.clinical_session_id,disposition,reason,actor.id]);
  if(note.clinical_session_id)await db.execute("UPDATE clinical_sessions SET claim_blocked_reason=? WHERE id=? AND agency_id=?",[`CHART_ONLY: ${disposition}`,note.clinical_session_id,agencyId]);
  let closed=0;
  for(const claim of claims){
   const [[submission]]=await db.execute("SELECT id FROM claimmd_claim_events WHERE agency_id=? AND clinical_claim_id=? AND event_type IN ('approved_submission','external_primary_adjudication_recorded','external_final_adjudication_recorded') LIMIT 1",[agencyId,claim.id]);
   const transmitted=previouslyTransmitted(claim)||!!submission;
   const canClose=!transmitted&&['draft','ready','rejected'].includes(claim.claim_lifecycle);
   if(canClose){
    let metadata;try{metadata=typeof claim.metadata_json==='string'?JSON.parse(claim.metadata_json):claim.metadata_json||{};}catch{metadata={};}
    metadata.claimClosure={previousLifecycle:claim.claim_lifecycle,reason:`${disposition}: ${reason}`,actorUserId:actor.id,closedAt:new Date().toISOString(),source:'note_billing_disposition',dispositionId:entry.insertId};
    await db.execute("UPDATE clinical_claims SET claim_lifecycle='closed',metadata_json=?,billing_revision=billing_revision+1 WHERE id=? AND agency_id=?",[JSON.stringify(metadata),claim.id,agencyId]);closed++;
   }
   await recordClaimEvent({agencyId,claimId:claim.id,connectionId:claim.claimmd_connection_id||`agency:${agencyId}`,eventKey:`note-disposition:${crypto.randomUUID()}`,eventType:'note_billing_disposition',actorUserId:actor.id,payload:{disposition,reason,noteId,dispositionId:entry.insertId,previouslyTransmitted:transmitted,claimClosed:canClose}},db);
  }
  await db.commit();return {id:entry.insertId,noteId,disposition,claimsClosed:closed,claimCreated:false,message:'Saved in the chart without billing. Signed text and historical submissions remain on record.'};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
