import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({reactivate:vi.fn(),assignment:vi.fn(),offer:vi.fn(),coverage:vi.fn(),defaults:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../../services/clientReactivation.service.js',()=>({reactivateClientForActivity:mocks.reactivate}));
vi.mock('../../services/clientAssignmentScope.service.js',()=>({assertAssignableProvider:mocks.assignment,syncPrimaryClientBookingDefaults:mocks.defaults}));
vi.mock('../../services/providerServiceOfferings.service.js',()=>({requireAssignmentService:mocks.offer}));
vi.mock('../../services/clientCoverageAdmission.service.js',()=>({assertNewProviderCoverageAdmission:mocks.coverage}));
vi.mock('../../services/clientProviderAssignmentSync.service.js',()=>({afterLegacyProviderFieldsChanged:vi.fn()}));
vi.mock('../../services/insuranceDemographicsAutomation.service.js',()=>({eligibilityDemographicFields:[],syncInsuranceDemographicsForEligibility:vi.fn()}));
import Client from '../Client.model.js';
let executor;
beforeEach(()=>{vi.clearAllMocks();executor={execute:vi.fn(async sql=>sql.startsWith('SELECT id,agency_id')?[[{id:8,agency_id:2,client_type:'school',provider_id:7}]]:[{affectedRows:1}])};});
it('does not reactivate when a profile edit repeats its unchanged provider',async()=>{
 await Client.update(8,{provider_id:7,contact_phone:'3035550100'},9,{executor,hydrate:false});expect(mocks.reactivate).not.toHaveBeenCalled();
});
it('uses the saved new provider assignment after authorization and coverage checks',async()=>{
 await Client.update(8,{provider_id:10},9,{executor,hydrate:false});
 expect(mocks.reactivate).toHaveBeenCalledWith(expect.objectContaining({clientId:8,trigger:'provider_assignment',actorUserId:9}),{executor});
 expect(mocks.assignment.mock.invocationCallOrder[0]).toBeLessThan(mocks.reactivate.mock.invocationCallOrder[0]);expect(mocks.coverage.mock.invocationCallOrder[0]).toBeLessThan(mocks.reactivate.mock.invocationCallOrder[0]);
});
it('does not reopen a client when the new assignment fails coverage validation',async()=>{
 mocks.coverage.mockRejectedValueOnce(Error('VERIFICATION_REQUIRED'));await expect(Client.update(8,{provider_id:10},9,{executor,hydrate:false})).rejects.toThrow('VERIFICATION_REQUIRED');expect(mocks.reactivate).not.toHaveBeenCalled();
});
