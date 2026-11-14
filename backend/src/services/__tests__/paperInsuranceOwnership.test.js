import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../familyBillingEncryption.service.js',()=>({decryptFamilyBilling:value=>typeof value==='string'?JSON.parse(value):value}));
vi.mock('../demographicsImport.service.js',()=>({decryptDemographicsPayload:value=>value}));
import {readClientInsurance,readClientInsuranceSnapshot} from '../clientInsurance.service.js';
const insurance={primary:{isMedicaid:true,memberId:'A123456',subscriberFirstName:'Client',subscriberLastName:'Example',relationshipToSubscriber:'self'},patient:{firstName:'Client',lastName:'Example'}};
it('binds the exact packet holder on tenant-scoped reads without changing encrypted insurance',async()=>{
 const row={id:4,billing_insurance_payload:JSON.stringify(insurance),paper_packet_demo_candidate_enc:{secondaryMemberId:'A123456',secondaryHolder:'Parent Example'}},db={execute:vi.fn(async()=>[[row]])};
 expect((await readClientInsurance(4,2,db)).primary.paperSubscriberName).toBe('Parent Example');expect(db.execute.mock.calls[0][1]).toEqual([4,2]);
 expect((await readClientInsuranceSnapshot(4,2,db,{lock:true})).data.primary.paperSubscriberName).toBe('Parent Example');expect(db.execute.mock.calls[1][0]).toContain('FOR UPDATE');expect(JSON.parse(row.billing_insurance_payload)).toEqual(insurance);
});
it.each([readClientInsurance,readClientInsuranceSnapshot])('reads older schemas without paper candidates and never masks other database errors',async read=>{
 const missing=Object.assign(new Error("Unknown column 'paper_packet_demo_candidate_enc' in 'field list'"),{code:'ER_BAD_FIELD_ERROR'}),db={execute:vi.fn().mockRejectedValueOnce(missing).mockResolvedValueOnce([[{id:4,billing_insurance_payload:JSON.stringify(insurance)}]])};
 const value=await read(4,2,db,{lock:true});expect(value.data||value).toEqual(insurance);expect(db.execute.mock.calls[1][0]).not.toContain('paper_packet_demo_candidate_enc');
 const failed={execute:vi.fn().mockRejectedValue(Object.assign(new Error('Unknown column another_field'),{code:'ER_BAD_FIELD_ERROR'}))};await expect(read(4,2,failed)).rejects.toThrow('another_field');expect(failed.execute).toHaveBeenCalledTimes(1);
});
