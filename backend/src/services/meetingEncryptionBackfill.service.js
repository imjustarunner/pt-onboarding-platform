import {encryptSensitiveArtifact,resolveArtifactPlainFields} from './supervisionArtifactEncryption.service.js';
import {encryptPersonalNoteText,resolvePersonalNotePlaintext} from './supervisionPersonalNoteEncryption.service.js';
import {encryptPayload,decryptPayload} from './videoActivityEncryption.service.js';
import {maybeEncryptNotePayload,maybeDecryptNotePayload} from './clinicalNoteCrypto.service.js';
import {isChatEncryptionConfigured} from './chatEncryption.service.js';

const artifactColumns=['transcript_url','transcript_text','summary_text','focus_title','goals_json','action_items_json'];
export const meetingEncryptionTables = [
  {table:'provider_schedule_event_artifacts',type:'artifact',columns:[...artifactColumns,'recording_url','recording_path']},
  {table:'supervision_session_artifacts',type:'artifact',columns:[...artifactColumns,'private_notes_text']},
  {table:'supervision_session_personal_notes',type:'note',columns:['note_text'],keys:['session_id','user_id']},
  {table:'meeting_personal_notes',type:'note',columns:['note_text'],keys:['event_id','user_id']},
  {table:'video_meeting_activity',type:'activity',columns:['payload_json']},
  {table:'meeting_agenda_items',type:'envelope',columns:['title','notes']},
  {table:'session_recordings',type:'envelope',columns:['transcript_text','summary_text','topics_json','techniques_json','markers_json']},
  {table:'learning_class_sessions',type:'envelope',columns:['transcript_text','ai_summary_json']},
  {table:'hiring_interview_artifacts',type:'envelope',columns:['flow_state_json','scorecard_json','private_notes_json','team_chat_json','transcript_summary','action_items_json']},
  {table:'clinical_note_drafts',type:'envelope',columns:['input_text','output_json']}
];
const raw = value => typeof value==='object' && value!==null ? JSON.stringify(value) : value;
const isEnvelope = value => {try{return JSON.parse(raw(value))?._enc===true;}catch{return false;}};
export function meetingEncryptionPatch(spec,row) {
  const patch={};
  if(spec.type==='envelope') {
    for(const key of spec.columns) {
      if(row[key]==null || row[key]==='')continue;
      if(isEnvelope(row[key])){maybeDecryptNotePayload(raw(row[key]));continue;}
      patch[key]=maybeEncryptNotePayload(raw(row[key]));
    }
    return patch;
  }
  const hasPlaintext=spec.columns.some(key=>row[key]!=null && row[key]!=='' && !(spec.type==='activity' && raw(row[key])==='{}'));
  const cipherKey=spec.type==='artifact'?'sensitive_ciphertext':spec.type==='note'?'note_ciphertext':'payload_ciphertext';
  // Read existing ciphertext first; key errors must never overwrite protected content.
  if(spec.type==='artifact') {
    const value=resolveArtifactPlainFields(row);
    if(row[cipherKey]&&!hasPlaintext)return patch;
    const e=encryptSensitiveArtifact(value);
    Object.assign(patch,{sensitive_ciphertext:e.ciphertextB64,sensitive_iv:e.ivB64,sensitive_auth_tag:e.authTagB64,encryption_key_id:e.keyId});
  }else if(spec.type==='note') {
    const value=resolvePersonalNotePlaintext(row);
    if(row[cipherKey]&&!hasPlaintext)return patch;
    const e=encryptPersonalNoteText(value);
    Object.assign(patch,{note_ciphertext:e.ciphertextB64,note_iv:e.ivB64,note_auth_tag:e.authTagB64,encryption_key_id:e.keyId});
  }else {
    const value=decryptPayload(row,{});
    if(row[cipherKey]&&!hasPlaintext)return patch;
    const e=encryptPayload(value);
    Object.assign(patch,{payload_ciphertext:e.ciphertextB64,payload_iv:e.ivB64,payload_auth_tag:e.authTagB64,encryption_key_id:e.keyId});
  }
  for(const key of spec.columns)patch[key]=spec.type==='activity'?'{}':null;
  return patch;
}

export async function backfillMeetingEncryption(pool,{apply=false,onProgress=()=>{}}={}) {
  if(!isChatEncryptionConfigured())throw new Error('Encryption must be configured before running this backfill.');
  const counts={};
  for(const spec of meetingEncryptionTables) {
    const keys=spec.keys || ['id'];let cursor=null,changed=0;
    while(true) {
      const db=await pool.getConnection();let rows;
      try{
        if(apply)await db.beginTransaction();
        const where=cursor?`WHERE (${keys.join(',')}) > (${keys.map(()=>'?').join(',')})`:'';
        [rows]=await db.execute(`SELECT * FROM ${spec.table} ${where} ORDER BY ${keys.join(',')} LIMIT 100${apply?' FOR UPDATE':''}`,cursor || []);
        for(const row of rows) {
          const patch=meetingEncryptionPatch(spec,row),columns=Object.keys(patch);
          if(!columns.length)continue;
          if(apply)await db.execute(`UPDATE ${spec.table} SET ${columns.map(k=>`${k}=?`).join(',')} WHERE ${keys.map(k=>`${k}=?`).join(' AND ')}`,[...columns.map(k=>patch[k]),...keys.map(k=>row[k])]);
          changed++;
        }
        if(apply)await db.commit();
      }catch(error){if(apply)await db.rollback();throw error;}finally{db.release();}
      if(!rows.length)break;
      cursor=keys.map(k=>rows.at(-1)[k]);
    }
    counts[spec.table]=changed;onProgress({table:spec.table,rows:changed,apply});
  }
  return counts;
}
