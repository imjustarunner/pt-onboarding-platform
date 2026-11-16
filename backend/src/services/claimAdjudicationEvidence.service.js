import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import StorageService from './storage.service.js';
import {encryptFamilyBilling,decryptFamilyBilling} from './familyBillingEncryption.service.js';
import {policyError} from './supervisedBillingPolicy.service.js';
import {recordClaimEvent} from './claimMdWorkflow.service.js';

export const MAX_ADJUDICATION_FILE_BYTES=10*1024*1024;
const context=(agencyId,claimId,id,part)=>`claim-adjudication:${agencyId}:${claimId}:${id}:${part}`;
const fingerprint=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function adjudicationFileType(file){
 const b=file?.buffer;
 if(!Buffer.isBuffer(b)||!b.length||b.length>MAX_ADJUDICATION_FILE_BYTES)throw policyError(400,'Upload a non-empty proof file no larger than 10 MB.');
 const name=String(file.originalname || '').toLowerCase();
 if(name.endsWith('.pdf') && b.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
 if(name.endsWith('.png') && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(/\.jpe?g$/.test(name) && b[0]===255 && b[1]===216 && b[2]===255)return 'image/jpeg';
 const start=b.subarray(0,2000).toString('ascii');
 if(/\.(835|edi|txt)$/.test(name) && /^ISA\W/.test(start) && /ST\W835\W/.test(start))return 'application/edi-x12';
 throw policyError(400,'Upload a PDF, PNG, JPEG, or an 835 ERA file. The file contents must match its type.');
}
async function primaryClaim(agencyId,claimId,db){
 const [[claim]]=await db.execute('SELECT id,agency_id,client_id,payer_sequence,parent_claim_id,is_deleted FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0',[claimId,agencyId]);
 if(!claim || claim.parent_claim_id || Number(claim.payer_sequence || 1)!==1)throw policyError(404,'Select the primary claim in this organization to attach its ERA/EOB.');
 return claim;
}
function descriptor(row){
 const meta=decryptFamilyBilling(row.metadata_encrypted,context(row.agency_id,row.primary_claim_id,row.id,'metadata'));
 return {id:row.id,filename:meta.filename,kind:meta.kind,source:meta.source,mimeType:meta.mimeType,sizeBytes:meta.sizeBytes,sha256:row.content_sha256,uploadedByUserId:Number(row.created_by_user_id),uploadedAt:row.created_at};
}
export async function uploadClaimAdjudicationEvidence({agencyId,claimId,actorUserId,file,kind,source},deps={}){
 const db=deps.db || clinicalPool,storage=deps.storage || StorageService,record=deps.record || recordClaimEvent;
 const claim=await primaryClaim(agencyId,claimId,db),mimeType=adjudicationFileType(file);
 if(!['primary_eob','primary_era','payer_denial'].includes(kind))throw policyError(400,'Select whether this proof is a primary EOB, ERA, or payer denial.');
 source=String(source || '').trim();
 if(source.length<3 || source.length>255)throw policyError(400,'Record where this proof came from, such as the payer portal or mailed EOB.');
 const id=crypto.randomUUID(),sha256=fingerprint(file.buffer),storageKey=`billing-adjudication/${agencyId}/${claimId}/${id}.encrypted`;
 const filename=String(file.originalname || 'primary-proof').split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f]/g,'').slice(0,180);
 const metadata={filename,kind,source,mimeType,sizeBytes:file.buffer.length};
 // Only encrypted content and random object names reach object storage. No
 // public URL, public bucket ACL, outside scanner, or raw patient filename.
 const packed=encryptFamilyBilling({bytes:file.buffer.toString('base64')},context(agencyId,claimId,id,'content'));
 const encryptedMetadata=encryptFamilyBilling(metadata,context(agencyId,claimId,id,'metadata'));
 await storage.writeObject(storageKey,Buffer.from(packed),'application/octet-stream');
 try{
  await db.execute('INSERT INTO claim_adjudication_evidence(id,agency_id,client_id,primary_claim_id,storage_key,content_sha256,metadata_encrypted,created_by_user_id) VALUES(?,?,?,?,?,?,?,?)',[id,agencyId,claim.client_id,claimId,storageKey,sha256,encryptedMetadata,actorUserId]);
 }catch(error){await storage.deleteObject(storageKey).catch(()=>{});throw error;}
 await record({agencyId,claimId,connectionId:`agency:${agencyId}`,eventKey:`adjudication-proof:${id}`,eventType:'primary_adjudication_proof_uploaded',actorUserId,payload:{evidenceId:id,sha256,kind}},db);
 return {id,...metadata,sha256,uploadedByUserId:actorUserId};
}
export async function listClaimAdjudicationEvidence({agencyId,claimId},db=clinicalPool){
 await primaryClaim(agencyId,claimId,db);
 const [rows]=await db.execute('SELECT * FROM claim_adjudication_evidence WHERE agency_id=? AND primary_claim_id=? ORDER BY created_at,id',[agencyId,claimId]);
 return rows.map(descriptor);
}
export async function validateClaimAdjudicationEvidence({agencyId,claimId,clientId,evidenceIds},db=clinicalPool){
 if(!Array.isArray(evidenceIds) || !evidenceIds.length || evidenceIds.length>10 || evidenceIds.some(id=>typeof id!=='string'||!uuid.test(id)) || new Set(evidenceIds).size!==evidenceIds.length)throw policyError(409,'Upload and select the primary ERA/EOB or denial proof before saving the secondary review.');
 const [rows]=await db.execute(`SELECT * FROM claim_adjudication_evidence WHERE agency_id=? AND primary_claim_id=? AND client_id=? AND id IN (${evidenceIds.map(()=>'?').join(',')})`,[agencyId,claimId,clientId,...evidenceIds]);
 if(rows.length!==evidenceIds.length)throw policyError(409,'Proof must belong to this primary claim, client and organization. Refresh the uploaded evidence.');
 return rows.map(descriptor);
}
export async function downloadClaimAdjudicationEvidence({agencyId,claimId,evidenceId,actorUserId},deps={}){
 const db=deps.db || clinicalPool,storage=deps.storage || StorageService;
 const claim=await primaryClaim(agencyId,claimId,db);
 const [proof]=await validateClaimAdjudicationEvidence({agencyId,claimId,clientId:claim.client_id,evidenceIds:[evidenceId]},db);
 const [[row]]=await db.execute('SELECT storage_key FROM claim_adjudication_evidence WHERE id=? AND agency_id=? AND primary_claim_id=?',[evidenceId,agencyId,claimId]);
 const packed=await storage.readObject(row.storage_key);
 const content=decryptFamilyBilling(packed.toString(),context(agencyId,claimId,evidenceId,'content'));
 const buffer=Buffer.from(content.bytes,'base64');
 if(fingerprint(buffer)!==proof.sha256 || buffer.length!==proof.sizeBytes)throw policyError(409,'The proof file failed its integrity check. Billing must resolve this evidence before use.');
 await (deps.record || recordClaimEvent)({agencyId,claimId,connectionId:`agency:${agencyId}`,eventKey:`adjudication-proof-view:${crypto.randomUUID()}`,eventType:'primary_adjudication_proof_downloaded',actorUserId,payload:{evidenceId}},db);
 return {buffer,filename:proof.filename,mimeType:proof.mimeType};
}
