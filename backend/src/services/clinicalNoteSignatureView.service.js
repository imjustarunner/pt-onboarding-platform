import pool from '../config/database.js';

const object=value=>{try{return typeof value==='string'?JSON.parse(value):value || {};}catch{return {};}};
const instant=value=>{if(!value)return null;const date=value instanceof Date?value:new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(String(value))?value:`${String(value).replace(' ','T')}Z`);return Number.isFinite(date.getTime())?date.toISOString():null;};

/** Read-only presentation of persisted signatures. Missing legacy evidence stays missing. */
export async function clinicalNoteSignatureView(note,versions,providerSigner,source=pool){
 const meta=object(note.metadata_json || note.metadata),effective=versions?.revisions?.find(row=>Number(row.id)===Number(versions.effectiveRevisionId));
 const amended=effective && Number(effective.id)!==Number(versions.originalRevisionId);
 const rows=amended?(effective.signatures || []).map(row=>({...row,role:row.action==='supervisor_sign'?'supervisor':row.action==='author_acknowledge'?'author_acknowledgement':'provider',evidence:row.attestation || {}})):[
  {role:'provider',actorUserId:note.provider_signed_by_user_id,signedAt:note.provider_signed_at,evidence:meta.attestation || {},action:'initial_author_sign'},
  {role:'supervisor',actorUserId:note.supervisor_cosigned_by_user_id,signedAt:note.supervisor_cosigned_at,evidence:meta.supervisorCosign || {},action:'initial_supervisor_sign'}
 ];
 const result=[];
 for(const row of rows){
  if(!row.actorUserId || !instant(row.signedAt))continue;
  const linked=(effective?.signatures || []).find(signature=>Number(signature.actorUserId)===Number(row.actorUserId) && signature.action===row.action);
  let signerLabel=row.evidence.signerLabel || null;
  if(!signerLabel && Number(providerSigner?.id)===Number(row.actorUserId))signerLabel=[providerSigner.name,providerSigner.credentials].filter(Boolean).join(', ');
  if(!signerLabel){const [[user]]=await source.execute('SELECT id,first_name,last_name,credential FROM users WHERE id=? LIMIT 1',[row.actorUserId]);if(user)signerLabel=[[user.first_name,user.last_name].filter(Boolean).join(' '),user.credential].filter(Boolean).join(', ');}
  result.push({role:row.role,actorUserId:Number(row.actorUserId),signerLabel:signerLabel || `Account ${row.actorUserId}`,signedAt:instant(row.signedAt),
   signatureId:row.id || linked?.id || null,revisionId:effective?.id || null,contentHash:row.contentHash || linked?.contentHash || row.evidence.contentHash || (!amended?note.content_hash:null) || null,
   evidence:{ipAddressRecorded:!!row.evidence.ipAddress,userAgentRecorded:!!row.evidence.userAgent,attestationRecorded:row.evidence.attested===true || row.evidence.accurateAndComplete===true || row.evidence.reviewedAndApproved===true}});
 }
 return result;
}
