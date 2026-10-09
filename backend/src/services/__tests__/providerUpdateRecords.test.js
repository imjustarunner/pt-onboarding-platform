import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/ProviderPublicProfile.model.js',()=>({default:{}}));
vi.mock('../../models/UserInfoValue.model.js',()=>({default:{}}));
import pool from '../../config/database.js';
import Profile from '../../models/ProviderPublicProfile.model.js';
vi.mock('../providerDisplayRole.service.js',()=>({getProviderDisplayRole:vi.fn(async()=>({label:'Counselor',currentLabel:'Counselor',fixed:false})),DISPLAY_ROLE_OPTIONS:['Counselor']}));
import {decodeField,supervisionBreakdown,saveProviderReviewProfile} from '../providerUpdateRecords.service.js';
describe('provider update record interpretation',()=>{
 it('keeps reported and app hours separate and exposes balance discrepancies',()=>{const r=supervisionBreakdown({individual:25.5,group:.99},{individual:28.5,group:9.1},{individual:2,group:1},{individual:54,group:10.09});expect(r.reported.total).toBe(64.09);expect(r.app.total).toBe(3);expect(r.calculated.total).toBe(67.09);expect(r.current.total).toBe(64.09);expect(r.difference).toBe(-3);});
 it('uses calculated hours only when no stored account exists',()=>{expect(supervisionBreakdown({},{},{individual:2},null).current.total).toBe(2);});
 it('decodes stored checkbox arrays without splitting labels',()=>{expect(decodeField('["Children (6-10)","Teen (14-18)"]')).toEqual(['Children (6-10)','Teen (14-18)']);expect(decodeField('plain text')).toBe('plain text');});
});

it('saves a self-selected public gender while preserving existing profile details',async()=>{
 Profile.getForProvider=vi.fn(async()=>({details:{gender:'',languages:['Spanish']}}));Profile.upsertForProvider=vi.fn();pool.execute.mockResolvedValue([{affectedRows:1}]);
 await saveProviderReviewProfile({provider_user_id:7,agency_id:2},'credential_display',{credential:'LPCC',displayLabel:'Counselor',publicGender:'nonbinary'});
 expect(Profile.upsertForProvider).toHaveBeenCalledWith(expect.objectContaining({providerUserId:7,details:expect.objectContaining({gender:'nonbinary',languages:['Spanish']})}));
 await expect(saveProviderReviewProfile({provider_user_id:7,agency_id:2},'credential_display',{displayLabel:'Counselor',publicGender:'inferred'})).rejects.toMatchObject({status:400});
});

it('requires language proficiency and a session-capability confirmation before saving',async()=>{
 Profile.getForProvider=vi.fn(async()=>({details:{languages:['English']}}));Profile.upsertForProvider=vi.fn();
 await expect(saveProviderReviewProfile({provider_user_id:7,agency_id:2},'credential_display',{displayLabel:'Counselor',sessionLanguages:[{language:'Spanish',proficiency:'fluent',canConductSessions:false}]})).rejects.toMatchObject({status:400});
 expect(Profile.upsertForProvider).not.toHaveBeenCalled();
 await saveProviderReviewProfile({provider_user_id:7,agency_id:2},'credential_display',{displayLabel:'Counselor',sessionLanguages:[{language:'Spanish',proficiency:'fluent',canConductSessions:true}]});
 expect(Profile.upsertForProvider).toHaveBeenCalledWith(expect.objectContaining({details:expect.objectContaining({languages:['Spanish'],languageProficiencies:[{language:'Spanish',proficiency:'fluent',canConductSessions:true}]})}));
});
