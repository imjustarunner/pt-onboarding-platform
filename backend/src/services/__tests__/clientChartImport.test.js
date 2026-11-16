import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),readInsurance:vi.fn(),writeInsurance:vi.fn(),contacts:vi.fn(),upsert:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.getConnection}}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:m.readInsurance,writeClientInsurance:m.writeInsurance}));
vi.mock('../clientContactAffiliation.service.js',()=>({upsertClientAffiliatedContact:m.upsert}));
vi.mock('../../models/ClientContactAffiliation.model.js',()=>({default:{listForClient:m.contacts}}));
import { readChartRecord,saveChartRecord,importSupplementaryChartSection } from '../clientChartImport.service.js';
const scope={clientId:12,agencyId:2};
let db, stored;
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('CLIENT_PHI_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));
 stored=new Map();db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:m.execute};m.getConnection.mockResolvedValue(db);
 m.execute.mockImplementation(async(sql,args)=>{
   if(sql.startsWith('SELECT payload_enc'))return [[stored.get(args.join(':'))].filter(Boolean)];
   if(sql.startsWith('INSERT INTO client_chart_import_records')){stored.set(args.slice(0,4).join(':'),{payload_enc:args[4],revision:args[5]});return [{affectedRows:1}];}
   return [[{id:12}]];
 });
 m.contacts.mockResolvedValue([]);m.upsert.mockResolvedValue({affiliation:{id:50,agencyContactId:60}});m.readInsurance.mockResolvedValue(null);m.writeInsurance.mockImplementation(async value=>value);
});
afterEach(()=>vi.unstubAllEnvs());
it('encrypts private drafts at rest, scopes them to the owner, and round trips the source text',async()=>{
 await saveChartRecord(scope,'comments',10,{text:'Synthetic private comment'},10,0);
 expect(stored.get('2:12:comments:10').payload_enc).not.toContain('Synthetic private comment');
 await expect(readChartRecord(scope,'comments',10)).resolves.toEqual({value:{text:'Synthetic private comment'},revision:1});
 await expect(readChartRecord(scope,'comments',11)).resolves.toEqual({value:null,revision:0});
});
it('rolls back a conflicting revision without overwriting the saved paste',async()=>{
 await saveChartRecord(scope,'comments',10,{text:'First'},10,0);
 await expect(saveChartRecord(scope,'comments',10,{text:'Stale'},10,0)).rejects.toMatchObject({status:409});
 expect(db.rollback).toHaveBeenCalledOnce();expect((await readChartRecord(scope,'comments',10)).value.text).toBe('First');
});
it('rejects ciphertext copied from another client context',async()=>{
 await saveChartRecord(scope,'comments',10,{text:'First'},10,0);
 stored.set('2:13:comments:10',stored.get('2:12:comments:10'));
 await expect(readChartRecord({agencyId:2,clientId:13},'comments',10)).rejects.toThrow('context mismatch');
});
it('imports partial insurance without erasing secondary coverage or treating source IDs as verified routes',async()=>{
 m.readInsurance.mockResolvedValue({primary:{insurerName:'Previous',memberId:'PREVIOUS',subscriberDob:'1980-01-02'},secondary:{insurerName:'Secondary',payerId:'00900'},acceptAssignment:true,patient:{firstName:'Alex'}});
 await importSupplementaryChartSection(scope,'insurance','Example Carrier (00050): Primary\nMember ID\nNEW',10);
 expect(m.writeInsurance).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:12,primary:{insurerName:'Example Carrier',sourcePayerId:'00050',payerId:'',memberId:'NEW',subscriberDob:'1980-01-02'},secondary:{insurerName:'Secondary',payerId:'00900'},acceptAssignment:true,verifiedForClaims:false,queueEligibility:false,confirmedBy:10}),db);
});
it('reuses an existing named contact, retains extra fields, and never enables reminders',async()=>{
 m.contacts.mockResolvedValue([{contact_full_name:'Pat Example',agency_contact_id:60}]);
 await importSupplementaryChartSection(scope,'contacts','Name\nPat Example\nCompany\nExample School\nMobile Phone\n555-111-2222\nWork Phone\n555-111-3333\nROI Signed\nNot signed by patient/guardian\nAppt Reminders\nText and email',10);
 expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:12,userId:10,existingContactId:60,importOnly:true,phone:'555-111-2222'}));
 expect((await readChartRecord(scope,'contacts')).value[50]).toMatchObject({company:'Example School',workPhone:'555-111-3333',roiSigned:'Not signed by patient/guardian',appointmentReminders:'Text and email'});
});
it('merges imported contact metadata without erasing fields absent from a later paste',async()=>{
 await saveChartRecord(scope,'contacts',0,{50:{fullName:'Pat Example',company:'Example School',workPhone:'555-111-2222'},51:{fullName:'Alex Example'}},10);
 await saveChartRecord(scope,'contacts',0,{50:{fullName:'Pat Example',email:'pat@example.com'}},10);
 expect((await readChartRecord(scope,'contacts')).value).toMatchObject({50:{company:'Example School',workPhone:'555-111-2222',email:'pat@example.com'},51:{fullName:'Alex Example'}});
});
it('keeps patient comments out of the general/shared notes model',async()=>{
 await importSupplementaryChartSection(scope,'comments','Patient Comments\nsvgEdit\nSynthetic administrative comment',10);
 expect((await readChartRecord(scope,'comments')).value).toEqual({message:'Synthetic administrative comment'});
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('client_notes'))).toBe(false);
});
