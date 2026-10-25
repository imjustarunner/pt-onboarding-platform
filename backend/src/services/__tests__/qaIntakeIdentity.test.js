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
 it('marks a completed isolated guardian for recipient-only email access',async()=>{db.execute.mockResolvedValueOnce([[agency]]).mockResolvedValueOnce([[{id:9,role:'client_guardian',agency_id:450}]]).mockResolvedValueOnce([{affectedRows:1}]);await markQaIntakeGuardian({agencyId:450,userId:9,email:'qa.family@example.com'},db);expect(db.execute.mock.calls[2][0]).toContain('ua.agency_id=450 AND ua.is_active=1');expect(db.execute.mock.calls[2][1]).toEqual([9,'qa.family@example.com']);});
 it('fails closed when the QA flag is missing',async()=>{db.execute.mockResolvedValue([[{...agency,feature_flags:{}}]]);await expect(validateQaIntakeGuardian({agencyId:450,email:'qa.family@example.com'},db)).rejects.toMatchObject({status:400});});
});
