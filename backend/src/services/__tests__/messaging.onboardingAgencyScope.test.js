import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({user:vi.fn(),items:vi.fn(),agencies:vi.fn(),choices:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.user}}));
vi.mock('../../models/OnboardingChecklist.model.js',()=>({default:{getUserChecklist:m.items}}));
vi.mock('../staffCommunicationChoices.service.js',()=>({getStaffCommunicationAgencies:m.agencies,getStaffCommunicationChoices:m.choices}));
import {getUserOnboardingChecklist} from '../userOnboardingChecklist.service.js';
beforeEach(()=>{vi.clearAllMocks();m.items.mockResolvedValue([]);m.agencies.mockResolvedValue([{id:2,name:'Agency'}]);m.choices.mockResolvedValue({reviewedAt:null,needsReview:true});});
describe('staff onboarding visibility',()=>{
 it.each(['ACTIVE','ACTIVE_EMPLOYEE','EHR_ONLY'])('does not reopen onboarding for %s staff',async status=>{m.user.mockResolvedValue({status,role:'provider'});expect(await getUserOnboardingChecklist(8)).toEqual({items:[],completionPercentage:100});expect(m.agencies).not.toHaveBeenCalled();expect(m.choices).not.toHaveBeenCalled();});
 it('includes agency choices during actual onboarding',async()=>{m.user.mockResolvedValue({status:'ONBOARDING',role:'provider'});const result=await getUserOnboardingChecklist(8);expect(result.completionPercentage).toBe(0);expect(result.items.map(i=>i.id)).toEqual(['communications-2']);});
});
