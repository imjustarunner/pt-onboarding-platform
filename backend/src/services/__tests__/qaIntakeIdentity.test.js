import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {validateQaIntakeGuardian,markQaIntakeGuardian} from '../qaIntakeIdentity.service.js';
const agency={id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}}};
const db={execute:vi.fn()};
beforeEach(()=>db.execute.mockReset());
describe('isolated QA intake identities',()=>{
 it('leaves other agencies unchanged',async()=>{expect(await validateQaIntakeGuardian({agencyId:2,email:'real@domain.test'},db)).toBe(false);expect(db.execute).not.toHaveBeenCalled();});
 it('rejects the shared delivery inbox before any user or client writes',async()=>{db.execute.mockResolvedValue([[agency]]);await expect(validateQaIntakeGuardian({agencyId:450,email:'testing@itsco.health'},db)).rejects.toMatchObject({status:400});expect(db.execute).toHaveBeenCalledTimes(1);});
 it('rejects an existing account with any outside membership',async()=>{db.execute.mockResolvedValueOnce([[agency]]).mockResolvedValueOnce([[{id:5,role:'client_guardian',agency_id:2}]]);await expect(validateQaIntakeGuardian({agencyId:450,email:'qa.family@example.com'},db)).rejects.toMatchObject({status:400});});
 it('does not treat an existing staff identity as a guardian',async()=>{db.execute.mockResolvedValueOnce([[agency]]).mockResolvedValueOnce([[{id:1433,role:'provider',agency_id:450}]]);await expect(validateQaIntakeGuardian({agencyId:450,email:'qa.provider.auricwell@example.com'},db)).rejects.toMatchObject({status:400});});
 it('marks a completed isolated guardian for recipient-only email access',async()=>{db.execute.mockResolvedValueOnce([[agency]]).mockResolvedValueOnce([[{id:9,role:'client_guardian',agency_id:450}]]).mockResolvedValueOnce([{affectedRows:1}]);await markQaIntakeGuardian({agencyId:450,userId:9,email:'qa.family@example.com'},db);expect(db.execute.mock.calls[2][0]).toContain('ua.agency_id=? AND ua.is_active=1');expect(db.execute.mock.calls[2][1]).toEqual([450,9,'qa.family@example.com']);});
 it('fails closed when the QA flag is missing',async()=>{db.execute.mockResolvedValue([[{...agency,feature_flags:{}}]]);await expect(validateQaIntakeGuardian({agencyId:450,email:'qa.family@example.com'},db)).rejects.toMatchObject({status:400});});
 it('accepts the owner-controlled unique testing alias for an isolated guardian',async()=>{
  db.execute.mockResolvedValueOnce([[agency]]).mockResolvedValueOnce([[]]);
  expect(await validateQaIntakeGuardian({agencyId:450,email:'testing+1109-parent2@itsco.health'},db)).toBe(true);
 });
 it.each(['testing+@itsco.health','parent@itsco.health','testing+family@elsewhere.test'])('rejects a nonapproved delivery identity %s',async email=>{
  db.execute.mockResolvedValueOnce([[agency]]);
  await expect(validateQaIntakeGuardian({agencyId:450,email},db)).rejects.toMatchObject({status:400});
 });
});

describe('NLU QA enrollment identity markers',()=>{
 it.each([453,454])('marks only the exact verified NLU QA guardian in scope %s',async agencyId=>{
  const a={id:agencyId,slug:agencyId===453?'nlu-qa-demo':'nlu-qa-learning',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}};
  db.execute.mockResolvedValueOnce([[a]]).mockResolvedValueOnce([[{id:1759,role:'client_guardian',agency_id:453},{id:1759,role:'client_guardian',agency_id:454}]]).mockResolvedValueOnce([{affectedRows:1}]);
  await markQaIntakeGuardian({agencyId,userId:1759,email:'qa.nlu.parent@example.com'},db);
  expect(db.execute.mock.calls[2][1]).toEqual([agencyId,1759,'qa.nlu.parent@example.com']);
 });
 it.each([6,450,451,999])('does not adopt an NLU guardian with outside membership %s',async outside=>{
  const a={id:453,slug:'nlu-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}};
  db.execute.mockResolvedValueOnce([[a]]).mockResolvedValueOnce([[{id:1759,role:'client_guardian',agency_id:outside}]]);
  await expect(markQaIntakeGuardian({agencyId:453,userId:1759,email:'qa.nlu.parent@example.com'},db)).rejects.toHaveProperty('status',400);expect(db.execute).toHaveBeenCalledTimes(2);
 });
 it('leaves live NLU outside QA identity mutation',async()=>{expect(await validateQaIntakeGuardian({agencyId:6,email:'parent@live.example'},db)).toBe(false);expect(db.execute).not.toHaveBeenCalled();});
 it('rejects a reserved ID without the exact synthetic agency markers',async()=>{db.execute.mockResolvedValue([[{id:453,slug:'nlu',feature_flags:{}}]]);await expect(markQaIntakeGuardian({agencyId:453,userId:1759,email:'qa.nlu.parent@example.com'},db)).rejects.toHaveProperty('status',400);});
});
