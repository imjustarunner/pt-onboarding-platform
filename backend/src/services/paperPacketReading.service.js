import crypto from 'node:crypto';
import { decryptDemographicsPayload } from './demographicsImport.service.js';

export function paperReadingCandidate(client) {
  if(!client?.paper_packet_demo_candidate_enc)return null;
  try{return decryptDemographicsPayload(client.paper_packet_demo_candidate_enc);}catch{return null;}
}
export function paperReadingSnapshot(candidate) {
  return crypto.createHash('sha256').update(JSON.stringify({documentId:candidate.documentId,sourceLocale:candidate.sourceLocale,responses:(candidate.responses || []).map(({key,sourceText})=>({key,sourceText}))})).digest('hex');
}
export function preservePaperReadingReview(next, previous) {
  const history=[...(previous?.englishResponseHistory || [])];
  const review=previous?.reviewedEnglishResponses;
  if(review && review.snapshotId===paperReadingSnapshot(next))return {...next,englishResponseHistory:history,reviewedEnglishResponses:review};
  if(review)history.push({...review,documentId:previous.documentId,sourceResponses:previous.responses});
  return {...next,...(history.length?{englishResponseHistory:history}:{})};
}
const nameParts=value=>{const parts=String(value || '').trim().split(/\s+/).filter(Boolean);return {firstName:parts.shift() || '',lastName:parts.join(' ')};};
export function paperReadingForStaff(client) {
  const candidate=paperReadingCandidate(client);if(!candidate)return null;
  const snapshotId=paperReadingSnapshot(candidate),review=candidate.reviewedEnglishResponses?.snapshotId===snapshotId?candidate.reviewedEnglishResponses:null;
  const fields={...nameParts(candidate.fullName),dateOfBirth:candidate.dateOfBirth || '',gender:candidate.administrativeSex || '',grade:candidate.grade || '',preferred_language:candidate.preferredLanguage || '',address_street:candidate.addressStreet || '',address_city:candidate.addressCity || '',address_state:candidate.addressState || '',address_zip:candidate.addressZip || ''};
  return {documentId:Number(candidate.documentId)||null,snapshotId,sourceLocale:candidate.sourceLocale || 'en',translationStatus:review?'reviewed':candidate.translationStatus || 'original',sourceValues:candidate.sourceValues || {},dateOfBirthNeedsReview:candidate.dateOfBirthNeedsReview===true,
    fields,parent1:{...nameParts(candidate.guardianName),email:candidate.email || '',phone:candidate.contactPhone || '',relationshipTitle:candidate.guardianRelationship || ''},
    parent2:{...nameParts(candidate.otherGuardianName),email:candidate.otherGuardianEmail || '',phone:candidate.otherGuardianPhone || ''},
    responses:(candidate.responses || []).map(response=>({...response,englishText:review?.answers?.[response.key] ?? response.englishText ?? ''})),reviewedAt:review?.reviewedAt || null};
}

export function reviewedPaperReadingPatch(client,input,actorId,{encrypt,documentId}) {
  if(input?.reviewed!==true)return null;
  const candidate=paperReadingCandidate(client);
  if(!candidate || Number(candidate.documentId)!==Number(documentId) || input.snapshotId!==paperReadingSnapshot(candidate))throw Object.assign(new Error('The packet reading changed. Refresh its English proposals before reviewing.'),{status:409});
  const responses=candidate.responses || [],answers={};
  if(!responses.length)throw Object.assign(new Error('No written responses were read from this packet.'),{status:400});
  if(Object.keys(input.answers || {}).some(key=>!responses.some(response=>response.key===key)))throw Object.assign(new Error('Choose only the responses read from this packet.'),{status:400});
  for(const response of responses){const text=input.answers?.[response.key];if(typeof text!=='string'||!text.trim()||text.length>16000)throw Object.assign(new Error('Review each English answer, or leave the English response review pending.'),{status:400});answers[response.key]=text.trim();}
  const previous=candidate.reviewedEnglishResponses;
  const history=[...(candidate.englishResponseHistory || [])];
  if(previous && JSON.stringify(previous.answers)!==JSON.stringify(answers))history.push({...previous,documentId:candidate.documentId,sourceResponses:candidate.responses});
  return encrypt({...candidate,...(history.length?{englishResponseHistory:history}:{}),reviewedEnglishResponses:{snapshotId:input.snapshotId,answers,reviewedAt:new Date().toISOString(),reviewedByUserId:Number(actorId)}});
}
