import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../hubPeopleAccess.service.js',()=>({hubClientScope:()=>({sql:'c.id IN (?)',params:[8]}),canAccessHubClient:vi.fn()}));
vi.mock('../clientConversationRecord.service.js',()=>({emailClientCandidates:vi.fn()}));
vi.mock('../communicationAccess.service.js',()=>({requireConversationAccess:vi.fn()}));
import pool from '../../config/database.js';
import {requireConversationAccess} from '../communicationAccess.service.js';
import {guardianVoicemailConversations} from '../guardianContactContext.service.js';
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockResolvedValueOnce([[{id:8,agency_id:2,guardian_id:9,name:'Child',first_name:'Parent'}]]).mockResolvedValueOnce([[{id:10,subject:'Voicemail'},{id:11,subject:'Private inbox'}]]);});
it('lists guardian-linked voicemails only when the viewer can access the underlying conversation',async()=>{
 requireConversationAccess.mockImplementation(async(_user,id)=>{if(id===11)throw Object.assign(new Error('Not found'),{status:404});return {id};});
 const result=await guardianVoicemailConversations({user:{id:7,role:'provider'},guardianId:9});
 expect(result.conversations).toEqual([{id:10,subject:'Voicemail'}]);expect(pool.execute.mock.calls[1][1]).toEqual([9,2]);
});
