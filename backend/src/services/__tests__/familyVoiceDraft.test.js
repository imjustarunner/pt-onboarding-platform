import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),benefit:vi.fn(),household:vi.fn(),generate:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../familyAuth.service.js',()=>({assertFamilyBenefit:mocks.benefit,requireHousehold:mocks.household}));
vi.mock('../geminiText.service.js',()=>({callGeminiText:mocks.generate}));
import {normalizeFamilyVoiceDraft,draftFamilyVoiceEvent} from '../familyVoiceDraft.service.js';
const members=[{user_id:1,display_name:'Dad',first_name:'Michael'},{user_id:3,display_name:'Emma'}];
const session={userId:1,agencyId:9};
const event={title:'Emma soccer practice',memberUserId:3,startDate:'2026-09-26',startTime:'17:00',endDate:'2026-09-26',endTime:'18:30',address:'Riverside Park',equipment:'Water, cleats',pickup:'Dad',reminderMinutes:30};
beforeEach(()=>{vi.clearAllMocks();mocks.benefit.mockResolvedValue();mocks.household.mockResolvedValue({id:7,timezone:'America/Denver'});mocks.execute.mockResolvedValue([members]);mocks.generate.mockResolvedValue({text:JSON.stringify(event),finishReason:'STOP'});});
describe('family-only voice event drafts',()=>{
 it('reads only authorized household members, uses household date and timezone, and never writes',async()=>{
   const result=await draftFamilyVoiceEvent(session,7,{transcript:'Emma soccer tomorrow at five pm'},{now:new Date('2026-09-26T01:00:00Z')});
   expect(result.draft).toMatchObject({kind:'event',memberUserId:3,startAt:'2026-09-26T17:00',endAt:'2026-09-26T18:30',metadata:{address:'Riverside Park',pickup:'Dad',equipment:'Water, cleats',reminderMinutes:30}});
   expect(result.timezone).toBe('America/Denver');
   expect(mocks.execute).toHaveBeenCalledTimes(1);expect(mocks.execute.mock.calls[0][0]).toMatch(/^SELECT .*WHERE m.household_id=\?$/);expect(mocks.execute.mock.calls[0][1]).toEqual([7]);
   expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({vertexOnly:true,sensitive:true,prompt:expect.stringContaining('September 25, 2026')}));
 });
 it('rejects a foreign household and a disabled feature before reading context or calling AI',async()=>{
   mocks.household.mockRejectedValueOnce(new Error('Household not found'));await expect(draftFamilyVoiceEvent(session,99,{transcript:'Soccer'})).rejects.toThrow('Household not found');
   expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();
   mocks.benefit.mockRejectedValueOnce(new Error('Disabled'));await expect(draftFamilyVoiceEvent(session,7,{transcript:'Soccer'})).rejects.toThrow('Disabled');expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('limits input and does not trust caller-supplied scope or time zone',async()=>{
   for(const transcript of ['', 'x'.repeat(4001),{text:'Soccer'}])await expect(draftFamilyVoiceEvent(session,7,{transcript})).rejects.toMatchObject({status:400});
   await draftFamilyVoiceEvent(session,7,{transcript:'Soccer',agencyId:99,timezone:'UTC',members:[{user_id:99}]});
   expect(mocks.household).toHaveBeenLastCalledWith(session,7);expect(mocks.generate.mock.calls[0][0].prompt).toContain('America/Denver');
 });
 it('keeps missing times blank and preserves the known date as a review hint',()=>{
   const result=normalizeFamilyVoiceDraft({title:'Dentist',startDate:'2026-10-01',memberUserId:999},members);
   expect(result.draft).toMatchObject({startAt:'',endAt:'',memberUserId:null});expect(result.review.join(' ')).toContain('2026-10-01');expect(result.review.join(' ')).toContain('no family member');
   expect(normalizeFamilyVoiceDraft({title:'Dentist',startTime:'09:00'},members).review.join(' ')).toContain('09:00');
 });
 it('rejects invalid dates, time rollover and negative duration',()=>{
   expect(normalizeFamilyVoiceDraft({...event,startDate:'2026-02-30'},members).draft.startAt).toBe('');
   expect(normalizeFamilyVoiceDraft({...event,startTime:'25:00'},members).draft.startAt).toBe('');
   expect(normalizeFamilyVoiceDraft({...event,endTime:'16:00'},members).draft.endAt).toBe('');
 });
 it('normalizes inclusive all-day ranges and preserves overnight timed events',()=>{
   expect(normalizeFamilyVoiceDraft({...event,allDay:true,endDate:'2026-09-28'},members).draft).toMatchObject({startAt:'2026-09-26T00:00',endAt:'2026-09-29T00:00'});
   expect(normalizeFamilyVoiceDraft({...event,allDay:true,endDate:null},members).draft.endAt).toBe('2026-09-27T00:00');
   expect(normalizeFamilyVoiceDraft({...event,startTime:'23:00',endDate:'2026-09-27',endTime:'01:00'},members).draft.endAt).toBe('2026-09-27T01:00');
 });
 it('strips tool calls, ids, foreign membership, recurrence, URLs and arbitrary metadata',()=>{
   const result=normalizeFamilyVoiceDraft({...event,id:6,kind:'work',memberUserId:999,agencyId:99,householdId:99,tools:[{name:'save'}],metadata:{artwork:'evil'},recurrence:'weekly',color:'red',notes:'Every week — review recurrence'},members);
   expect(result.draft.kind).toBe('event');expect(result.draft.memberUserId).toBe(null);expect(result.draft.id).toBeUndefined();expect(result.draft.metadata.artwork).toBeUndefined();expect(result.draft.metadata.recurrence).toBeUndefined();expect(result.draft.metadata.color).toBeUndefined();
 });
 it('handles fenced JSON and fails closed on broken, truncated or unavailable model output',async()=>{
   mocks.generate.mockResolvedValueOnce({text:'```json\n'+JSON.stringify(event)+'\n```'});await expect(draftFamilyVoiceEvent(session,7,{transcript:'Soccer'})).resolves.toHaveProperty('draft');
   for(const response of [{text:'not JSON'},{text:'null'},{text:JSON.stringify(event),finishReason:'MAX_TOKENS'}]){mocks.generate.mockResolvedValueOnce(response);await expect(draftFamilyVoiceEvent(session,7,{transcript:'Soccer'})).rejects.toMatchObject({status:503});}
   mocks.generate.mockRejectedValueOnce(new Error('Offline'));await expect(draftFamilyVoiceEvent(session,7,{transcript:'Soccer'})).rejects.toMatchObject({status:503});
 });
});
