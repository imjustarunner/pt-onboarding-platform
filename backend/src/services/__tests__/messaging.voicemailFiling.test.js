import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../hubPeopleAccess.service.js',()=>({canAccessHubClient:vi.fn(async()=>true)}));
vi.mock('../grasshopperVoicemail.service.js',()=>({voicemailClientCandidates:vi.fn()}));
import pool from '../../config/database.js';
import {voicemailClientCandidates} from '../grasshopperVoicemail.service.js';
import {autoFileEmailMessage,conversationFilingChoices} from '../clientConversationRecord.service.js';
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockImplementation(async sql=>{
 if(sql.includes('SELECT m.*,c.agency_id'))return [[{id:10,agency_id:2,conversation_id:3,direction:'inbound',from_json:{email:'help@grasshopper.com'},subject:'Voicemail from 303-555-1234',body_text:'Transcription: Hello'}]];
 if(sql.startsWith('SELECT agency_id'))return [[{agency_id:2}]];
 if(sql.startsWith('SELECT from_json'))return [[{from_json:{email:'help@grasshopper.com'},subject:'Voicemail'}]];
 return [[]];
});});
it('files a unique caller with the client and guardian communications',async()=>{
 voicemailClientCandidates.mockResolvedValue({phone:'3035551234',clients:[{id:8}],guardians:[{id:9}]});
 await autoFileEmailMessage(10);
 const writes=pool.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO communication_links'));
 expect(writes).toHaveLength(2);expect(writes[0][0]).toContain("'guardian'");expect(writes[0][1]).toEqual([3,9]);expect(writes[1][1]).toEqual([3,8]);
});
it('links a shared family phone to the guardian and requires an explicit child selection',async()=>{
 voicemailClientCandidates.mockResolvedValue({phone:'3035551234',clients:[{id:8},{id:11}],guardians:[{id:9}]});
 await autoFileEmailMessage(10);
 const writes=pool.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO communication_links'));
 expect(writes.some(([sql])=>sql.includes("'client_filing_review'"))).toBe(true);expect(writes.some(([sql])=>sql.includes("VALUES (?,'client',"))).toBe(false);
 expect((await conversationFilingChoices(3,4)).clients.map(c=>c.id)).toEqual([8,11]);
});
it('does not file an unknown number with a guessed client',async()=>{
 voicemailClientCandidates.mockResolvedValue({phone:'3035551234',clients:[],guardians:[]});await autoFileEmailMessage(10);
 expect(pool.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
