import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {isCardReviewer,cardFollowupEligible,clientHasMedicaid,assertFreshCardEmail} from '../insuranceCards/scope.js';
const primary={insurerName:'Commercial'};
const client={client_type:'school',enrolledInApp:true,hasMedicaid:false,hasRecordedCoverage:true};
it('keeps only Michael, Kaitlyn and Hannah, with exact active account identities',async()=>{
 for(const [id,first_name,last_name] of [[501,'Michael','Mendez'],[539,'Kaitlyn',"O'Connell"],[559,'Hannah','Inyart']]) {
  const db={execute:vi.fn(async()=>[[{first_name,last_name}]])};
  expect(await isCardReviewer({id},db)).toBe(true);
  db.execute.mockResolvedValue([[]]);expect(await isCardReviewer({id},db)).toBe(false);
  db.execute.mockResolvedValue([[{first_name:'Different',last_name}]]);expect(await isCardReviewer({id},db)).toBe(false);
 }
 const db={execute:vi.fn()};for(const id of [538,555,999])expect(await isCardReviewer({id,role:'super_admin'},db)).toBe(false);
 expect(db.execute).not.toHaveBeenCalled();
});
it('requires every linked client to be enrolled school/office with recorded non-Medicaid coverage',()=>{
 const context={profile:{primary},clients:[client]};expect(cardFollowupEligible(context)).toBe(true);
 expect(cardFollowupEligible({...context,clients:[{...client,client_type:'clinical'}]})).toBe(true);
 for(const patch of [{enrolledInApp:false},{hasMedicaid:true},{hasRecordedCoverage:false},{client_type:'learning'},{client_type:'basic_nonclinical'}])expect(cardFollowupEligible({...context,clients:[client,{...client,...patch}]})).toBe(false);
 expect(cardFollowupEligible({...context,clients:[]})).toBe(false);
 expect(cardFollowupEligible({...context,profile:{primary,secondary:{isMedicaid:true}}})).toBe(false);
});
it('Medicaid on the chart, secondary coverage or another assigned policy vetoes commercial card follow-up',()=>{
 expect(clientHasMedicaid({}, {primary})).toBe(false);
 for(const c of [{insurance_key:'medicaid'},{insurance_label:'Health First Colorado'},{primary_insurer_name:'Medicaid'}])expect(clientHasMedicaid(c,{primary})).toBe(true);
 expect(clientHasMedicaid({},{primary,secondary:{isMedicaid:true}})).toBe(true);
 expect(clientHasMedicaid({},{primary},[{primary:{isMedicaid:true}}])).toBe(true);
});
it('prevents previously queued insurance emails from bypassing a fresh review',()=>{
 expect(()=>assertFreshCardEmail({templateType:'insurance_card_followup',existingCommunicationId:123})).toThrow(/fresh eligibility/);
 expect(()=>assertFreshCardEmail({templateType:'insurance_card_followup'})).not.toThrow();
 expect(()=>assertFreshCardEmail({templateType:'appointment_reminder',existingCommunicationId:123})).not.toThrow();
});
