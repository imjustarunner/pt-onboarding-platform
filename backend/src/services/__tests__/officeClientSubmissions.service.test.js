import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),clinical:vi.fn(),forms:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>mocks}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:mocks.clinical}}));
vi.mock('../officeCheckinForms.service.js',async importOriginal=>({...await importOriginal(),formsForCheckin:mocks.forms}));
import {submissionTokenHash,completeClientSubmission,attachClientSubmission,beginClientSubmission} from '../officeClientSubmissions.service.js';
import {validateCheckinAnswers} from '../officeCheckinForms.service.js';
const key='1ccab28e-45d3-4409-9cef-083bdd1905cd';
const forms=[{id:'module:1',fields:[{id:'q',type:'select',required:true,options:[{value:'yes'}]}]}];
beforeEach(()=>vi.resetAllMocks());
describe('private client check-in receipts',()=>{
 it('uses a hash and rejects guessed numeric receipts',()=>{expect(submissionTokenHash(key)).toHaveLength(64);expect(submissionTokenHash(key)).not.toContain(key);expect(()=>submissionTokenHash('123')).toThrow();});
 it('checks required values, extra fields and option values',()=>{expect(()=>validateCheckinAnswers(forms,{})).toThrow();expect(()=>validateCheckinAnswers(forms,{'module:1':{q:'no'}})).toThrow();expect(()=>validateCheckinAnswers(forms,{'module:1':{q:'yes',clientId:12}})).toThrow();expect(validateCheckinAnswers(forms,{'module:1':{q:'yes'}})['module:1'].q).toBe('yes');});
 it('keeps child/caregiver versions separate from adult wording',async()=>{
  mocks.execute.mockResolvedValue([[]]);mocks.forms.mockResolvedValue({forms:[{id:'a',respondentType:'adult_self'},{id:'b',respondentType:'caregiver'}],unavailable:false});
  const result=await beginClientSubmission(mocks,{id:1,office_location_id:2,booked_provider_id:3,start_at:'2026-09-29 10:00:00',end_at:'2026-09-29 11:00:00'},4,key,'caregiver');
  expect(result.forms.map(f=>f.id)).toEqual(['b']);expect(JSON.stringify(result)).not.toContain('client_id');
 });
 it('rejects expired forms without saving',async()=>{mocks.execute.mockResolvedValue([[{id:1,expires_at:'2000-01-01 00:00:00'}]]);await expect(completeClientSubmission({locationId:1,key,answers:{}})).rejects.toMatchObject({status:410});expect(mocks.rollback).toHaveBeenCalled();expect(mocks.commit).not.toHaveBeenCalled();});
 it('makes repeated completion idempotent without returning answers',async()=>{mocks.execute.mockResolvedValue([[{id:1,completed_at:'2026-09-29',answers_json:{private:'answer'}}]]);expect(await completeClientSubmission({locationId:1,key,answers:{}})).toEqual({ok:true});expect(mocks.execute).toHaveBeenCalledTimes(1);});
 it('rejects another provider’s receipt before client lookup',async()=>{mocks.execute.mockResolvedValue([[]]);await expect(attachClientSubmission({id:1,providerId:3,clientId:4})).rejects.toMatchObject({status:404});expect(mocks.execute).toHaveBeenCalledTimes(1);});
 it('rejects clients outside the caseload or agency',async()=>{mocks.execute.mockResolvedValueOnce([[{id:1,agency_id:2}]]).mockResolvedValueOnce([[]]);await expect(attachClientSubmission({id:1,providerId:3,clientId:4})).rejects.toMatchObject({status:403});expect(mocks.commit).not.toHaveBeenCalled();});
 it('rejects a mismatched clinical session',async()=>{mocks.execute.mockResolvedValueOnce([[{id:1,agency_id:2}]]).mockResolvedValueOnce([[{id:4}]]);mocks.clinical.mockResolvedValue([[]]);await expect(attachClientSubmission({id:1,providerId:3,clientId:4,sessionId:9})).rejects.toMatchObject({status:403});expect(mocks.commit).not.toHaveBeenCalled();});
 it('preserves an attachment history when linking valid records',async()=>{mocks.execute.mockResolvedValueOnce([[{id:1,agency_id:2,client_id:null,clinical_session_id:null}]]).mockResolvedValueOnce([[{id:4}]]).mockResolvedValueOnce([{}]);mocks.clinical.mockResolvedValue([[{id:9}]]);expect(await attachClientSubmission({id:1,providerId:3,clientId:4,sessionId:9})).toEqual({ok:true});const args=mocks.execute.mock.calls[2][1];expect(JSON.parse(args[2])[0]).toMatchObject({previousClientId:null,clientId:4,sessionId:9,by:3});expect(mocks.commit).toHaveBeenCalledOnce();});
});
