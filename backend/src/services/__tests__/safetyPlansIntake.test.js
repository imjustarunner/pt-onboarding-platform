import {describe,it,expect,vi} from 'vitest';
vi.mock('../../models/AgencyOfficeIntakeMaster.model.js',()=>({default:{findByAgencyLanguage:vi.fn().mockResolvedValue(null)}}));
import Master from '../../models/AgencyOfficeIntakeMaster.model.js';
import {getClinicalTemplate,normalizeClinicalData} from '../safetyPlans/clinicalTemplates.js';
import {buildCounselingSelfEnSteps} from '../../data/counselingIntakeSelfEn.js';
describe('clinical enrollment reuse',()=>{
 it('reuses existing contact questions without copying screening tools or prepopulating answers',async()=>{const t=await getClinicalTemplate('client-information-update',2);const fields=t.sections[0].fields;const source=buildCounselingSelfEnSteps()[0].fields;for(const [key,label] of fields)expect(source.find(f=>f.key===key).label).toBe(label);expect(fields.length).toBeGreaterThan(10);expect(JSON.stringify(t)).not.toContain('C-SSRS');expect(normalizeClinicalData({personLabel:'Synthetic',planDate:'2026-10-11'},t).phone_number).toBe('');});
 it('snapshots agency-specific enrollment question labels and source version',async()=>{Master.findByAgencyLanguage.mockResolvedValueOnce({id:5,version:8,intake_fields:[{key:'phone_number',label:'Your preferred contact phone'}],intake_steps:[]});const t=await getClinicalTemplate('client-information-update',2);expect(t.source.masterVersion).toBe(8);expect(t.sections[0].fields.find(f=>f[0]==='phone_number')[1]).toBe('Your preferred contact phone');});
 it('validates option values and dates rather than accepting arbitrary input',async()=>{const t=await getClinicalTemplate('client-information-update',2);expect(()=>normalizeClinicalData({date_of_birth:'2026-02-31'},t)).toThrow();expect(()=>normalizeClinicalData({preferred_contact_method:'hacked'},t)).toThrow();expect(()=>normalizeClinicalData({best_time_to_contact:['hacked']},t)).toThrow();});
});
