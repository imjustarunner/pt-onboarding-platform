import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:vi.fn()}));
import {createGuardianDemographicsService,demographicRevision,validateDemographicValues,enrollmentDemographicValues} from '../guardianDemographics.service.js';
let db,service,current,record;
const parent={id:9,role:'client_guardian'},staff={id:4,role:'admin'};
beforeEach(()=>{
 current={full_name:'Susanne Example',preferred_name:'Susanne',date_of_birth:'2018-01-01',preferred_language:'English',gender:'',grade:'',contact_phone:'',email:'',address_street:'',address_apt:'',address_city:'',address_state:'',address_zip:'',ethnicity:''};
 record={id:7,status:'pending',guardian_user_id:9,changes_encrypted:JSON.stringify({base:current,proposed:{preferred_name:'Susie'}})};
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql)=>{
  if(sql.startsWith('SELECT full_name'))return [[current]];
  if(sql.startsWith('SELECT s.id,s.guardian_user_id'))return [[{id:18,guardian_user_id:9,agency_id:2,organization_id:2}]];
  if(sql.startsWith('SELECT id,status FROM guardian_demographic_requests'))return [[]];
  if(sql.includes('SELECT * FROM guardian_demographic_requests'))return [[record]];
  if(sql.includes('SELECT r.*'))return [[{...record,submitted_by:'Parent Example'}]];
  if(sql.startsWith('SELECT id FROM guardian_demographic_requests'))return [[]];
  return [{insertId:7}];
 })};db.getConnection=vi.fn(async()=>db);
 service=createGuardianDemographicsService({db,guardianAccess:vi.fn(async()=>({agency_id:2,organization_id:2})),staffAccess:vi.fn(async()=>({agency_id:2})),encrypt:JSON.stringify,decrypt:JSON.parse});
});
it('keeps legal name separate from preferred name and rejects injected chart fields',()=>{
 expect(validateDemographicValues({preferred_name:' Susie '})).toEqual({preferred_name:'Susie'});
 expect(()=>validateDemographicValues({agency_id:'3'})).toThrow();
 expect(()=>validateDemographicValues({date_of_birth:'2026-02-30'})).toThrow();
});
it('records the parent update and a support task without changing the child identity',async()=>{
 expect(await service.submit({user:parent,clientId:5,values:{preferred_name:'Susie'},revision:demographicRevision(current)})).toEqual({id:7,status:'pending'});
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE clients'))).toBe(false);
 expect(db.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO support_tickets'))).toBe(true);
 expect(db.commit).toHaveBeenCalledOnce();
});
it('returns only this parent’s proposals to a guardian, while staff can compare both',async()=>{
 await service.read({user:parent,clientId:5});
 const call=db.execute.mock.calls.find(([sql])=>sql.includes('SELECT r.*'));
 expect(call[0]).toContain('AND r.guardian_user_id=?');expect(call[1]).toEqual([5,2,9]);
});
it('does not save a request against stale demographics',async()=>{
 await expect(service.submit({user:parent,clientId:5,values:{preferred_name:'Susie'},revision:'stale'})).rejects.toHaveProperty('status',409);
 expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();
});
it('applies only the fields chosen by support and records reviewer identity',async()=>{
 await service.review({user:staff,clientId:5,requestId:7,acceptedFields:['preferred_name'],reason:'Confirmed preferred name',revision:demographicRevision(current)});
 expect(db.execute).toHaveBeenCalledWith('UPDATE clients SET preferred_name=?,updated_by_user_id=?,last_activity_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?',['Susie',4,5,2]);
 const review=db.execute.mock.calls.find(([sql])=>sql.includes("status='reviewed'"));expect(review[1][0]).toBe(4);expect(JSON.parse(review[1][1]).previous.full_name).toBe('Susanne Example');
});
it('retains current values if support declines a proposed change',async()=>{
 await service.review({user:staff,clientId:5,requestId:7,acceptedFields:[],reason:'Existing record confirmed',revision:demographicRevision(current)});
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE clients'))).toBe(false);expect(db.commit).toHaveBeenCalledOnce();
});
it('prevents a stale review from overwriting another staff decision',async()=>{
 await expect(service.review({user:staff,clientId:5,requestId:7,acceptedFields:['preferred_name'],reason:'Review',revision:'stale'})).rejects.toHaveProperty('status',409);
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE clients'))).toBe(false);
});
it('requires a fresh clinical access review when support corrects date of birth',async()=>{
 record.changes_encrypted=JSON.stringify({base:current,proposed:{date_of_birth:'2017-01-01'}});
 await service.review({user:staff,clientId:5,requestId:7,acceptedFields:['date_of_birth'],reason:'Verified birth date',revision:demographicRevision(current)});
 expect(db.execute).toHaveBeenCalledWith('UPDATE guardian_clinical_grants SET review_due_date=CURRENT_DATE WHERE agency_id=? AND client_id=? AND revoked_at IS NULL',[2,5]);
});
it('maps only child identity and explicit per-child details, without clearing absent answers',()=>{
 expect(enrollmentDemographicValues({child:{firstName:'Child',middleName:'Middle',lastName:'Example'},responses:{
  guardian_first:'Parent',guardian_last:'Example',guardian_preferred_language:'Russian',
  demographicsInfo:{dob:'2018-02-03',preferredCalled:'Their name',preferredLanguage:'Spanish'}
 },demographics:{dob:'2012-01-01',preferredLanguage:'English'}})).toEqual({
  full_name:'Child Middle Example',date_of_birth:'2018-02-03',preferred_name:'Their name',preferred_language:'Spanish'
 });
 expect(enrollmentDemographicValues({responses:{guardian_first:'Parent',guardian_last:'Example',guardian_preferred_language:'Russian'}})).toEqual({});
 expect(enrollmentDemographicValues({child:{firstName:'Partial'},demographics:{dob:'',preferredCalled:null,preferredLanguage:''}})).toEqual({});
});
it('queues a signed enrollment separately from portal proposals, with no client identity write',async()=>{
 const result=await service.enqueueFromEnrollment({clientId:5,submissionId:18,guardianUserId:9,values:{full_name:'Changed Child',preferred_language:'Spanish'}});
 expect(result).toEqual({id:7,status:'pending'});
 const insert=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO guardian_demographic_requests'));
 expect(insert[1].slice(0,4)).toEqual([2,5,9,18]);
 expect(JSON.parse(insert[1][4])).toEqual({base:current,proposed:{full_name:'Changed Child',preferred_language:'Spanish'}});
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE clients')||sql.startsWith('UPDATE guardian_demographic_requests'))).toBe(false);
 const ticket=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO support_tickets'));
 expect(ticket[1].join(' ')).not.toContain('Changed Child');
 expect(db.commit).toHaveBeenCalledOnce();
});
it('makes retrying the same signed enrollment idempotent without a second support task',async()=>{
 const implementation=db.execute.getMockImplementation();
 db.execute.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT id,status FROM guardian_demographic_requests')?[[{id:7,status:'reviewed'}]]:implementation(sql,...args));
 expect(await service.enqueueFromEnrollment({clientId:5,submissionId:18,guardianUserId:9,values:{preferred_name:'Susie'}})).toEqual({id:7,status:'reviewed'});
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it('does not queue unchanged enrollment answers',async()=>{
 expect(await service.enqueueFromEnrollment({clientId:5,submissionId:18,guardianUserId:9,values:{full_name:current.full_name}})).toEqual({status:'unchanged'});
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it('rejects an enrollment that is not owned by this guardian and bound to the invited child',async()=>{
 const implementation=db.execute.getMockImplementation();
 db.execute.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT s.id,s.guardian_user_id')?[[]]:implementation(sql,...args));
 await expect(service.enqueueFromEnrollment({clientId:5,submissionId:18,guardianUserId:10,values:{preferred_name:'Susie'}})).rejects.toHaveProperty('status',403);
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 expect(db.rollback).toHaveBeenCalledOnce();
});
it('rolls back the enrollment proposal when its support task fails',async()=>{
 const implementation=db.execute.getMockImplementation();
 db.execute.mockImplementation(async(sql,...args)=>{if(sql.startsWith('INSERT INTO support_tickets'))throw new Error('Queue unavailable');return implementation(sql,...args);});
 await expect(service.enqueueFromEnrollment({clientId:5,submissionId:18,guardianUserId:9,values:{preferred_name:'Susie'}})).rejects.toThrow('Queue unavailable');
 expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();
});

it('reviews home-address edits into the same client fields used by claims',async()=>{record.changes_encrypted=JSON.stringify({base:current,proposed:{address_street:'100 Demo Way',address_city:'Denver',address_zip:'80202'}});await service.review({user:staff,clientId:5,requestId:7,acceptedFields:['address_street','address_city','address_zip'],reason:'Family verified',revision:demographicRevision(current)});expect(db.execute).toHaveBeenCalledWith('UPDATE clients SET address_street=?,address_city=?,address_zip=?,updated_by_user_id=?,last_activity_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?',['100 Demo Way','Denver','80202',4,5,2]);});
