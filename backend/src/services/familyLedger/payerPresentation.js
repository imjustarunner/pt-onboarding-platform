import clinicalPool from '../../config/clinicalDatabase.js';

/** Only service billing fields are selected; diagnoses and clinical text never enter this view. */
export async function payerServiceBreakdown(receivable,mode,db=clinicalPool) {
  if(!['payment_only','payer_plus'].includes(mode))return {};
  let sessionId=null,claimId=null;
  if(receivable.source_type==='claim_responsibility')claimId=Number(receivable.source_key);
  else if(['clinical_copay','clinical_self_pay'].includes(receivable.source_type))sessionId=Number(receivable.source_key);
  if(!sessionId&&!claimId)return {};
  const [[visit]]=await db.execute(`SELECT s.id,s.place_of_service FROM clinical_sessions s WHERE s.agency_id=? AND s.client_id=? AND ${claimId?'s.id=(SELECT clinical_session_id FROM clinical_claims WHERE id=? AND agency_id=s.agency_id AND client_id=s.client_id)':'s.id=?'}`,[receivable.agency_id,receivable.client_id,claimId||sessionId]);
  const result={visitType:['02','10'].includes(String(visit?.place_of_service))?'virtual':String(visit?.place_of_service)==='11'?'office':null};
  if(mode!=='payer_plus'||!visit)return result;
  const [[claim]]=await db.execute("SELECT id FROM clinical_claims WHERE agency_id=? AND client_id=? AND clinical_session_id=? AND is_deleted=0 AND COALESCE(payer_sequence,1)=1 ORDER BY id DESC LIMIT 1",[receivable.agency_id,receivable.client_id,visit.id]);
  if(!claim)return result;
  const [[lines]]=await db.execute('SELECT GROUP_CONCAT(DISTINCT procedure_code ORDER BY procedure_code SEPARATOR ", ") AS serviceCode,SUM(charge_cents) AS billedCents FROM clinical_claim_lines WHERE clinical_claim_id=?',[claim.id]);
  const [[postings]]=await db.execute(`SELECT SUM(p.paid_cents) AS insurancePaidCents,SUM(p.adjustment_cents) AS adjustmentCents FROM claimmd_payment_postings p JOIN clinical_claims c ON c.id=p.clinical_claim_id AND c.agency_id=p.agency_id WHERE c.agency_id=? AND c.client_id=? AND c.clinical_session_id=? AND c.is_deleted=0`,[receivable.agency_id,receivable.client_id,visit.id]);
  return {...result,serviceCode:lines?.serviceCode||null,billedCents:lines?.billedCents==null?null:Number(lines.billedCents),insurancePaidCents:postings?.insurancePaidCents==null?null:Number(postings.insurancePaidCents),adjustmentCents:postings?.adjustmentCents==null?null:Number(postings.adjustmentCents)};
}
