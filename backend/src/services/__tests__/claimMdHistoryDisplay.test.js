import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({clinical:vi.fn(),main:vi.fn(),decrypt:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:mocks.clinical}}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.main}}));
vi.mock('../familyBillingEncryption.service.js',()=>({decryptFamilyBilling:mocks.decrypt,encryptFamilyBilling:vi.fn()}));
import {claimEventHistory} from '../claimMdWorkflow.service.js';
beforeEach(()=>vi.resetAllMocks());
it('looks up only the scoped history actors and keeps authoritative actor/time fields',async()=>{
 mocks.clinical.mockResolvedValue([[{id:12,event_type:'correction',actor_user_id:9,created_at:'2026-11-04T20:17:33Z',event_key:'correction:1',payload_encrypted:'encrypted'}]]);
 mocks.main.mockResolvedValue([[{id:9,first_name:'QA',last_name:'Biller'}]]);
 mocks.decrypt.mockReturnValue({reason:'Modifier reviewed',actorUserId:999,createdAt:'forged'});
 const history=await claimEventHistory(2,11);
 expect(mocks.clinical.mock.calls[0][1]).toEqual([2,11]);expect(mocks.main.mock.calls[0][1]).toEqual([9]);
 expect(history[0]).toMatchObject({actorUserId:9,actorName:'QA Biller',createdAt:'2026-11-04T20:17:33Z',reason:'Modifier reviewed'});
});
it('preserves actor IDs when accounts no longer have names and does not invent actors for system events',async()=>{
 mocks.clinical.mockResolvedValue([[{id:12,actor_user_id:9,event_key:'correction:1'},{id:13,actor_user_id:null,event_key:'response:1'}]]);mocks.main.mockResolvedValue([[]]);mocks.decrypt.mockReturnValue({});
 const history=await claimEventHistory(2,11);expect(history[0]).toMatchObject({actorUserId:9,actorName:null});expect(history[1]).toMatchObject({actorUserId:null,actorName:null});
});
