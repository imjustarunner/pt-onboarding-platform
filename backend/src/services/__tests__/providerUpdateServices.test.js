import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/ProviderPublicProfile.model.js',()=>({default:{getForProvider:vi.fn(),upsertForProvider:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn(async()=>({id:7,role:'provider'}))}}));
vi.mock('../providerServiceOfferings.service.js',()=>({readProviderServices:vi.fn(),saveProviderServices:vi.fn()}));
vi.mock('../tutoringWorkspace.service.js',async original=>{const actual=await original();return {...actual,tutoringWorkspace:{save:vi.fn()}};});
import {readProviderServices,saveProviderServices} from '../providerServiceOfferings.service.js';
import {tutoringWorkspace} from '../tutoringWorkspace.service.js';
import Profile from '../../models/ProviderPublicProfile.model.js';
import {saveProviderUpdateServices,tutoringReviewValues} from '../providerUpdateServices.service.js';
const recipient={provider_user_id:7,agency_id:6};
const tutoring={subjectAreas:['Reading'],ageGroups:['6–10'],gradeLevels:['1–5'],bio:'Synthetic introduction',acceptingNewStudents:true};
beforeEach(()=>{vi.clearAllMocks();readProviderServices.mockResolvedValue({services:[{serviceType:'counseling'},{serviceType:'tutoring'}]});Profile.getForProvider.mockResolvedValue({details:{languages:['English'],tutoringFocusByAgency:{2:{ageGroups:['Adults']}}}});});
it('requires tutoring ages, topics and grades before any service writes',async()=>{
 for(const field of ['subjectAreas','ageGroups','gradeLevels'])await expect(saveProviderUpdateServices(recipient,{selected:['tutoring'],tutoring:{...tutoring,[field]:[]}})).rejects.toMatchObject({status:400});
 expect(saveProviderServices).not.toHaveBeenCalled();
});
it('saves both services and only descriptive tutoring fields without enabling booking or changing pay',async()=>{
 const data={selected:['counseling','tutoring'],tutoring:{...tutoring},forgedRate:500};
 await saveProviderUpdateServices(recipient,data);
 expect(saveProviderServices).toHaveBeenCalledWith(7,6,['counseling','tutoring']);
 expect(tutoringWorkspace.save).toHaveBeenCalledWith({id:7,role:'provider'},6,{subjectAreas:['Reading'],gradeLevels:['1–5'],bio:tutoring.bio,acceptingNewStudents:true});
 expect(Profile.upsertForProvider).toHaveBeenCalledWith(expect.objectContaining({details:expect.objectContaining({languages:['English'],tutoringFocusByAgency:{2:{ageGroups:['Adults']},6:{ageGroups:['6–10']}}})}));
 expect(data.forgedRate).toBeUndefined();expect(data.reviewedAt).toEqual(expect.any(String));
});
it('propagates current qualification restrictions and blocks unknown service types',async()=>{
 await expect(saveProviderUpdateServices(recipient,{selected:['psychotherapy_admin']})).rejects.toMatchObject({status:400});
 saveProviderServices.mockRejectedValueOnce(Object.assign(new Error('Qualifications need review'),{status:403}));
 await expect(saveProviderUpdateServices(recipient,{selected:['tutoring'],tutoring})).rejects.toMatchObject({status:403});
 expect(tutoringWorkspace.save).not.toHaveBeenCalled();
});
it('rejects pay/approval data in descriptive tutoring inputs',()=>{
 expect(()=>tutoringReviewValues({...tutoring,learningLevel:5})).not.toThrow();
 const values=tutoringReviewValues({...tutoring,learningLevel:5});expect(values.learningLevel).toBeUndefined();
});
