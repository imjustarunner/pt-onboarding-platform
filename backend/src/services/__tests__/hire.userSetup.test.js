import {describe,it,expect,vi,beforeEach} from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:db,onTableWrite:vi.fn()}));
vi.mock('../providerUpdateRecords.service.js',()=>({getProviderUpdateRecords:vi.fn(async()=>({contact:{phone:''},credential:'',blurb:'',focusGroups:[],clinicalFocus:{top:{},excluded:{}},typicalAvailability:[]}))}));
vi.mock('../../models/ProviderPublicProfile.model.js',()=>({default:{getForProvider:vi.fn(async()=>({details:{},insurances:[]})),upsertForProvider:vi.fn(async()=>({}))}}));
import {validateHireUserSetup,persistHireUserSetup,getHireUserSetup} from '../hireUserSetup.service.js';
import ProviderPublicProfile from '../../models/ProviderPublicProfile.model.js';
import {FOCUS_GROUPS} from '../../../../frontend/src/navigation/providerFocus.js';
const focus=()=>({top:Object.fromEntries(FOCUS_GROUPS.map(g=>[g.key,[]])),excluded:Object.fromEntries(FOCUS_GROUPS.map(g=>[g.key,[]]))});
beforeEach(()=>{vi.clearAllMocks();db.execute.mockResolvedValue([[{id:12}]]);});
describe('new hire user setup',()=>{
 it('starts new provider schedule preferences empty',async()=>{const result=await getHireUserSetup({id:8,role:'provider'},2);expect(result.values.typicalAvailability).toEqual([]);expect(result.values.clinicalFocus.top).toEqual({});});
 it('uses Provider Update focus limits and strips permissions and schedule mutations',()=>{
  const value=validateHireUserSetup({clinicalFocus:focus(),role:'admin',officeAssignments:[{}]},true);
  expect(value).not.toHaveProperty('role');expect(value).not.toHaveProperty('officeAssignments');
  const invalid=focus();invalid.top.specialties=FOCUS_GROUPS[0].options.slice(0,4);
  expect(()=>validateHireUserSetup({clinicalFocus:invalid},true)).toThrow('up to three');
 });
 it('keeps optional demographics empty and does not require clinical claims from support staff',()=>{
  const result=validateHireUserSetup({},false);expect(Object.values(result.demographics)).toEqual(['','']);expect(result.clinicalFocus).toBeUndefined();
 });
 it('writes canonical profile and focus with the supplied phase transaction, never schedules',async()=>{
  const input={clinicalFocus:focus(),blurb:'My introduction',languages:['Spanish'],demographics:{provider_marketing_gender:'Woman'}};
  await persistHireUserSetup(db,8,2,validateHireUserSetup(input,true));
  expect(ProviderPublicProfile.upsertForProvider).toHaveBeenCalledWith(expect.objectContaining({database:db,providerUserId:8,publicBlurb:'My introduction',details:expect.objectContaining({languages:['Spanish'],typicalAvailability:[]})}));
  expect(db.execute.mock.calls.some(([sql])=>/INSERT INTO (office|provider_school|work_hours)/.test(sql))).toBe(false);
  expect(db.execute.mock.calls.some(([sql])=>sql.includes("'$.clinicalFocus'"))).toBe(true);
 });
});
