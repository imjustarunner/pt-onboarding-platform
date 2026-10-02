import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {meetingEncryptionTables,meetingEncryptionPatch} from '../meetingEncryptionBackfill.service.js';
import {encryptPayload,decryptPayload} from '../videoActivityEncryption.service.js';
import {resolveArtifactPlainFields} from '../supervisionArtifactEncryption.service.js';
import {maybeDecryptNotePayload} from '../clinicalNoteCrypto.service.js';
beforeEach(()=>vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64')));
afterEach(()=>vi.unstubAllEnvs());
const spec=table=>meetingEncryptionTables.find(s=>s.table===table);
describe('legacy meeting encryption backfill',()=>{
 it('retains all legacy team fields, erases plaintext, and is idempotent',()=>{
  const row={id:4,transcript_text:'Private words',summary_text:'Private summary',goals_json:[{text:'A goal'}],recording_url:'https://example.com/private'};
  const patch=meetingEncryptionPatch(spec('provider_schedule_event_artifacts'),row);
  expect(patch.transcript_text).toBeNull();expect(patch.summary_text).toBeNull();expect(patch.goals_json).toBeNull();expect(patch.recording_url).toBeNull();
  Object.assign(row,patch);
  expect(resolveArtifactPlainFields(row)).toMatchObject({transcriptText:'Private words',summaryText:'Private summary',goals:[{text:'A goal'}],recordingUrl:'https://example.com/private'});
  expect(meetingEncryptionPatch(spec('provider_schedule_event_artifacts'),row)).toEqual({});
 });
 it('removes the old plaintext activity duplicate while retaining the authoritative ciphertext content',()=>{
  const e=encryptPayload({text:'Encrypted authoritative content'});
  const row={payload_json:JSON.stringify({text:'Stale plaintext'}),payload_ciphertext:e.ciphertextB64,payload_iv:e.ivB64,payload_auth_tag:e.authTagB64};
  Object.assign(row,meetingEncryptionPatch(spec('video_meeting_activity'),row));
  expect(row.payload_json).toBe('{}');expect(decryptPayload(row)).toEqual({text:'Encrypted authoritative content'});expect(meetingEncryptionPatch(spec('video_meeting_activity'),row)).toEqual({});
 });
 it('handles native MySQL JSON fields without turning them into object strings',()=>{
  const row={topics_json:['Private topic'],markers_json:[{text:'Private event'}]};
  Object.assign(row,meetingEncryptionPatch(spec('session_recordings'),row));
  expect(JSON.parse(maybeDecryptNotePayload(row.topics_json))).toEqual(['Private topic']);
  expect(meetingEncryptionPatch(spec('session_recordings'),row)).toEqual({});
 });
 it('refuses to overwrite unreadable ciphertext with legacy columns',()=>{
  expect(()=>meetingEncryptionPatch(spec('provider_schedule_event_artifacts'),{sensitive_ciphertext:'broken',sensitive_iv:'bad',sensitive_auth_tag:'bad',transcript_text:'Legacy'})).toThrow();
 });
});
