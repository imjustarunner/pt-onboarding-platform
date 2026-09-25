import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../familyBillingPolicy.service.js',()=>({billingError:(status,message)=>Object.assign(new Error(message),{status}),auditBilling:vi.fn()}));
import {validateEftEvidence,eftGuide,listPayerEft,savePayerEft} from '../payerEft.service.js';
import {encryptFamilyBilling,decryptFamilyBilling} from '../familyBillingEncryption.service.js';
import {taxIdHash} from '../claimMdWorkflow.service.js';
const input=()=>({agencyId:1,officeId:8,actorUserId:9,payerId:'COCHA',payerName:'CCHA',revision:0,status:'active_reported',source:'staff_report',reference:'Agency confirms existing direct deposits',evidenceDate:'2026-09-25',attested:true});
const profile={officeId:8,billingNpi:'1306688650',practice:{tax_id:'123456789'}};
beforeEach(()=>vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64')));
describe('payer EFT tracking',()=>{
 it('does not call a reported setup verified; requires actual deposit evidence',()=>{
  expect(validateEftEvidence(input()).depositMatched).toBe(false);
  for(const changes of [{status:'active_verified'},{status:'active_verified',source:'payer_portal',depositMatched:true},{source:'era'},{attested:false},{evidenceDate:'2099-01-01'},{evidenceDate:'2026-02-30'}])expect(()=>validateEftEvidence({...input(),...changes})).toThrow();
  expect(validateEftEvidence({...input(),status:'active_verified',source:'bank_deposit',depositMatched:true}).depositMatched).toBe(true);
 });
 it('provides the verified CCHA portal and never fabricates a portal for other payers',()=>{expect(eftGuide('COCHA').url).toBe('https://enrollsafe.payeehub.org/');expect(eftGuide('UNKNOWN').url).toBeNull();});
 it('invalidates a recorded active status when the current tax identity changes and omits the tax hash',async()=>{
  const row={id:11,agency_id:1,payer_id:'COCHA',provider_npi:profile.billingNpi,tax_id_hash:taxIdHash('987654321'),status:'active_verified',evidence_encrypted:encryptFamilyBilling(validateEftEvidence(input()),'payer-eft:1:11')};
  const deps={db:{execute:vi.fn().mockResolvedValue([[row]])},offices:async()=>[{id:8}],profile:async()=>profile};const data=await listPayerEft(1,deps);expect(data.items[0].identityCurrent).toBe(false);expect(data.items[0]).not.toHaveProperty('tax_id_hash');expect(deps.db.execute.mock.calls[0][1]).toEqual([1]);
 });
 function setup(previous){const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>{if(sql.startsWith('SELECT id FROM agencies'))return [[{id:1}]];if(sql.startsWith('SELECT * FROM payer_eft_enrollments'))return [previous?[previous]:[]];return [{insertId:11}];})};return {db,deps:{db:{getConnection:async()=>db},profile:async()=>profile}};}
 it('stores encrypted immutable evidence, not bank instructions, and does not send enrollment',async()=>{const {db,deps}=setup();expect(await savePayerEft({...input(),bankAccount:'IGNORED-SECRET'},deps)).toMatchObject({id:11,revision:1,bankInstructionsChanged:false,enrollmentSubmitted:false});const event=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO payer_eft_events'));expect(event[1][4]).not.toContain('Agency confirms');expect(decryptFamilyBilling(event[1][4],'payer-eft:1:11')).toMatchObject({source:'staff_report',depositMatched:false});expect(JSON.stringify(db.execute.mock.calls)).not.toContain('IGNORED-SECRET');expect(db.commit).toHaveBeenCalled();});
 it('rejects stale updates without replacing the current record',async()=>{const {db,deps}=setup({id:11,revision:2});await expect(savePayerEft(input(),deps)).rejects.toMatchObject({status:409});expect(db.commit).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalled();});
});
