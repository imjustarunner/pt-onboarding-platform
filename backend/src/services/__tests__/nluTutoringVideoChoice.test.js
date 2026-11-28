import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn()}}));
import Agency from '../../models/Agency.model.js';
import { nluTutoringVideoChoice } from '../nluTutoringVideoChoice.service.js';
beforeEach(()=>vi.clearAllMocks());
it.each(['nlu','nextlevelup','nextleveluplcc','next-level-up'])('enables NLU tutoring using its saved %s organization',async slug=>{
 Agency.findById.mockResolvedValue({id:6,slug});
 expect(await nluTutoringVideoChoice({agencyId:6,businessType:'tutoring'})).toBe(true);
 expect(Agency.findById).toHaveBeenCalledWith(6);
});
it.each([[453,'nlu-qa-demo'],[454,'nlu-qa-learning']])('enables the retained synthetic organization %s with its own marker',async(id,slug)=>{
 Agency.findById.mockResolvedValue({id,slug,feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}});
 expect(await nluTutoringVideoChoice({agencyId:id,businessType:'learning'})).toBe(true);
 Agency.findById.mockResolvedValue({id,slug});expect(await nluTutoringVideoChoice({agencyId:id,businessType:'learning'})).toBe(false);
});
it('keeps the new scope within NLU regardless of its selected service',async()=>{
 Agency.findById.mockResolvedValue({id:2,slug:'itsco'});
 expect(await nluTutoringVideoChoice({agencyId:2,businessType:'tutoring',slug:'nlu'})).toBe(false);
 Agency.findById.mockResolvedValue({id:6,slug:'nlu'});
 for(const businessType of ['mental_health','healthcare','coaching','learning',null])expect(await nluTutoringVideoChoice({agencyId:6,businessType})).toBe(true);
});
