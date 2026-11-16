import {linkedServiceRelationship,resolveLinkedServiceBilling} from '../../../frontend/src/navigation/linkedServiceBilling.js';
import {getApprovedClinicalContext} from './clinicalNoteVersionBilling.service.js';
import {parseObject} from './supervisedBillingPolicy.service.js';

// Only the initial, empty encounter placeholder is expanded automatically.
// Existing reviewed billing and transmitted attempts require reconciliation.
export async function populateLinkedSessionClaim({agencyId,claimId,noteId,sessionId},pool){
 const db=typeof pool.getConnection==='function'?await pool.getConnection():pool;
 const transaction=typeof db.beginTransaction==='function';
 try{
  if(transaction)await db.beginTransaction();
  const [[claim]]=await db.execute('SELECT * FROM clinical_claims WHERE id=? AND agency_id=? FOR UPDATE',[claimId,agencyId]);
  if(!claim || claim.clinical_note_id || claim.claimmd_submitted_at || claim.claimmd_claim_id || !['draft','ready'].includes(claim.claim_lifecycle)){if(transaction)await db.commit();return false;}
  const [lines]=await db.execute('SELECT * FROM clinical_claim_lines WHERE clinical_claim_id=? FOR UPDATE',[claimId]);
  if(lines.length!==1 || Number(lines[0].charge_cents)>0 || lines[0].clinical_note_id || !linkedServiceRelationship(lines[0].procedure_code)){if(transaction)await db.commit();return false;}
  const [[note]]=await db.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? AND clinical_session_id=? AND provider_signed_at IS NOT NULL AND is_deleted=0',[noteId,agencyId,sessionId]);
  const [[session]]=await db.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=?',[sessionId,agencyId]);
  if(!note || !session){if(transaction)await db.commit();return false;}
  const approved=await getApprovedClinicalContext({note,session},db),meta=parseObject(approved.note.metadata_json);
  const code=String(meta.serviceCode || approved.session.service_code || '').toUpperCase();
  const relation=linkedServiceRelationship(code);
  if(!relation || relation.isAddon)throw Object.assign(new Error('Select a parent service before billing linked add-ons.'),{status:409});
  const result=resolveLinkedServiceBilling(code,meta.structuredChart?.durationMinutes ?? meta.durationMinutes ?? approved.session.duration_minutes,{modifiers:meta.modifiers});
  if(!result){if(transaction)await db.commit();return false;}
  if(!result.claimable)throw Object.assign(new Error(result.reason),{status:409});
  await db.execute('UPDATE clinical_claim_lines SET procedure_code=?,units=1 WHERE id=?',[code,lines[0].id]);
  const addonMap=new Map((meta.billingAddons || []).map(addon=>[String(addon.code || addon.serviceCode || '').toUpperCase(),Number(addon.units || 1)]));
  addonMap.delete(relation.addon);addonMap.delete(code);
  for(const addon of result.addons)addonMap.set(addon.code,addon.units);
  let number=2;
  for(const [addon,units] of addonMap)if(/^[A-Z0-9]{5}$/.test(addon) && Number.isInteger(units) && units>0)await db.execute("INSERT INTO clinical_claim_lines(clinical_claim_id,line_number,procedure_code,units,charge_cents,diagnosis_pointers,service_date,clinical_note_id) VALUES(?,?,?,?,0,'1',?,?)",[claimId,number++,addon,units,claim.date_of_service,noteId]);
  await db.execute("UPDATE clinical_claims SET metadata_json=JSON_SET(COALESCE(metadata_json,JSON_OBJECT()),'$.automaticLinkedServices',CAST(? AS JSON)),billing_revision=billing_revision+1 WHERE id=? AND agency_id=?",[JSON.stringify({source:'signed_eligible_minutes',ruleVersion:'CO-SBHS-2026-10',parent:code,addons:result.addons}),claimId,agencyId]);
  if(transaction)await db.commit();return true;
 }catch(error){if(transaction)await db.rollback();throw error;}finally{if(db!==pool)db.release();}
}
