import {expect,it,vi} from 'vitest';
const execute=vi.hoisted(()=>vi.fn());
vi.mock('../../config/database.js',()=>({default:{execute},onTableWrite:vi.fn()}));
import {maybeCreateFromIntakeGuardian} from '../coGuardianInvite.service.js';
it('records no invitation, ticket or transport from tutoring intake custody fields',async()=>{
 expect(await maybeCreateFromIntakeGuardian({agencyId:453,enrollmentChannel:'tutoring',clientIds:[1],intakeData:{guardian:{other_guardian_has_legal_rights:'yes',other_guardian_email:'other@example.com'}}})).toBeNull();
 expect(execute).not.toHaveBeenCalled();
});
