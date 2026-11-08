import { expect,it,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../models/User.model.js',()=>({default:{}}));
import { authorizeReferralPacket,referralPacketMatch } from '../referralPacketMatch.service.js';
const scope={agencyId:450,organizationId:451,firstName:'Synthetic',lastName:'Child',initials:'SynChi'};
it('requires review before creating another matching client and attaches only an explicitly selected client',async()=>{
 const db={execute:vi.fn(async()=>[[{id:2438,full_name:'Synthetic Child'}]])};
 expect(await referralPacketMatch(scope,db)).toMatchObject({requiresReview:true});
 expect(await referralPacketMatch({...scope,existingClientId:2438},db)).toMatchObject({existingClientId:2438});
 await expect(referralPacketMatch({...scope,existingClientId:999},db)).rejects.toMatchObject({status:400});
 expect(await referralPacketMatch({...scope,reviewedMatchIds:[2438]},db)).toMatchObject({existingClientId:null});
 expect(await referralPacketMatch({...scope,reviewedMatchIds:[999]},db)).toMatchObject({requiresReview:true});
 expect(db.execute.mock.calls[0][1]).toEqual([450,451,'Synthetic Child','SynChi',0]);
});
it('limits support to their agency and school staff to their own school and upload',async()=>{
 const users={getAgencies:vi.fn(async()=>[{id:450}])};
 await authorizeReferralPacket({...scope,user:{id:1,role:'support'}},users);
 await expect(authorizeReferralPacket({...scope,agencyId:2,user:{id:1,role:'support'}},users)).rejects.toMatchObject({status:403});
 users.getAgencies.mockResolvedValue([{id:451}]);
 await authorizeReferralPacket({...scope,user:{id:1,role:'school_staff'},draft:{uploaded_by_user_id:1}},users);
 await expect(authorizeReferralPacket({...scope,user:{id:1,role:'school_staff'},draft:{uploaded_by_user_id:2}},users)).rejects.toMatchObject({status:403});
 await expect(authorizeReferralPacket({...scope,user:{id:1,role:'client_guardian'}},users)).rejects.toMatchObject({status:403});
});
