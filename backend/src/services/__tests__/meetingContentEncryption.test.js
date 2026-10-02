import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:db}));
import {encryptSensitiveArtifact,resolveArtifactPlainFields} from '../supervisionArtifactEncryption.service.js';
import {encryptPersonalNoteText,resolvePersonalNotePlaintext} from '../supervisionPersonalNoteEncryption.service.js';
import {maybeEncryptNotePayload,maybeDecryptNotePayload} from '../clinicalNoteCrypto.service.js';
import VideoActivity from '../../models/VideoMeetingActivity.model.js';
import Agenda from '../../models/MeetingAgendaItem.model.js';
const key=Buffer.alloc(32,7).toString('base64');
beforeEach(()=>{vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',key);db.execute.mockReset();db.execute.mockResolvedValue([{insertId:4}]);});
afterEach(()=>vi.unstubAllEnvs());
describe('mandatory meeting content encryption',()=>{
 it('round-trips every artifact field with no plaintext in the stored envelope',()=>{
  const fields={transcriptText:'Private transcript',summaryText:'Private summary',goals:[{text:'Private goal'}],actionItems:[{text:'Private task'}],recordingUrl:'https://private.example/recording',recordingPath:'private/path'};
  const e=encryptSensitiveArtifact(fields);expect(JSON.stringify(e)).not.toContain('Private');
  expect(resolveArtifactPlainFields({sensitive_ciphertext:e.ciphertextB64,sensitive_iv:e.ivB64,sensitive_auth_tag:e.authTagB64,encryption_key_id:e.keyId})).toMatchObject({...fields,isEncrypted:true});
 });
 it('never downgrades to plaintext or legacy fields after missing keys, corruption, or a wrong key',()=>{
  const envelope=maybeEncryptNotePayload('Private');const note=encryptPersonalNoteText('Private');
  const row={note_ciphertext:note.ciphertextB64,note_iv:note.ivB64,note_auth_tag:note.authTagB64,note_text:'Stale plaintext'};
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64','');
  for(const write of [()=>maybeEncryptNotePayload('Private'),()=>encryptSensitiveArtifact({summaryText:'Private'}),()=>encryptPersonalNoteText('Private')])expect(write).toThrow();
  expect(()=>maybeDecryptNotePayload(envelope)).toThrow();expect(()=>resolvePersonalNotePlaintext(row)).toThrow();
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,8).toString('base64'));expect(()=>maybeDecryptNotePayload(envelope)).toThrow();
 });
 it('stores activity ciphertext and an empty compatibility object, never a second plaintext copy',async()=>{
  await VideoActivity.create({eventId:2,userId:1,participantIdentity:'user-1',activityType:'chat',payload:{text:'Private discussion'}});
  const values=db.execute.mock.calls[0][1];expect(values[5]).toBe('{}');expect(values[6]).toBeTruthy();expect(JSON.stringify(values)).not.toContain('Private discussion');
 });
 it('encrypts agenda titles and notes before database writes',async()=>{
  db.execute.mockResolvedValueOnce([{insertId:4}]).mockResolvedValueOnce([[]]);
  await Agenda.create({meetingAgendaId:1,title:'Private agenda',notes:'Private case facts',createdByUserId:1});
  const values=db.execute.mock.calls[0][1];expect(JSON.stringify(values)).not.toContain('Private');expect(maybeDecryptNotePayload(values[2])).toBe('Private agenda');expect(maybeDecryptNotePayload(values[3])).toBe('Private case facts');
 });
 it('does not write activity when encryption is unavailable',async()=>{
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64','');
  await expect(VideoActivity.create({eventId:2,participantIdentity:'user-1',activityType:'chat',payload:{text:'Private'}})).rejects.toThrow();expect(db.execute).not.toHaveBeenCalled();
 });
});
