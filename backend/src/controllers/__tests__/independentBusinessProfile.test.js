import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(),update:vi.fn()}}));
import Agency from '../../models/Agency.model.js';
import { normalizeBusinessProfile, getIndependentBusinessProfile, updateIndependentBusinessProfile } from '../independentBusinessProfile.controller.js';
const response=()=>({set:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()});
const profile=()=>({id:7001,organization_type:'life_coach',is_active:1,is_archived:0,name:'Sample Coach Practice',tax_id:'123456789',tax_id_ciphertext:'private',tax_id_last4:'6789'});
beforeEach(()=>{vi.clearAllMocks();Agency.findById.mockResolvedValue(profile());});
it('limits profile editing to company fields and validates URL, timezone and tax ID',()=>{
  expect(normalizeBusinessProfile({name:' Sample Coach ',websiteUrl:'https://coach.example',timezone:'America/Denver',taxId:'12-3456789'})).toEqual({name:'Sample Coach',websiteUrl:'https://coach.example',timezone:'America/Denver',taxId:'123456789'});
  for(const input of [{accountOwnerUserId:999},{role:'admin'},{featureFlags:{}},{taxId:'1234'},{timezone:'Invalid/Zone'},{websiteUrl:'javascript:alert(1)'},{websiteUrl:'https://name:secret@example.com'}])expect(()=>normalizeBusinessProfile(input)).toThrow();
});
it('returns only masked tax details from a loaded business profile',async()=>{
  const res=response(),next=vi.fn();await getIndependentBusinessProfile({params:{agencyId:7001}},res,next);
  expect(next).not.toHaveBeenCalled();const body=res.json.mock.calls[0][0];
  expect(body).toMatchObject({agencyId:7001,name:'Sample Coach Practice',taxIdLast4:'6789'});
  expect(JSON.stringify(body)).not.toContain('123456789');expect(JSON.stringify(body)).not.toContain('private');
});
it('preserves saved tax ID when the form leaves it blank and cannot replace the owner',async()=>{
  const res=response(),next=vi.fn();await updateIndependentBusinessProfile({params:{agencyId:7001},body:{name:'Updated name'}},res,next);
  expect(Agency.update).toHaveBeenCalledWith(7001,{name:'Updated name'});expect(next).not.toHaveBeenCalled();
  await updateIndependentBusinessProfile({params:{agencyId:7001},body:{accountOwnerUserId:999}},res,next);
  expect(Agency.update).toHaveBeenCalledOnce();expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));
});
it('keeps care agencies and archived businesses out of the independent profile endpoint',async()=>{
  for(const change of [{organization_type:'agency'},{is_active:0},{is_archived:1}]){
    Agency.findById.mockResolvedValue({...profile(),...change});const next=vi.fn();
    await getIndependentBusinessProfile({params:{agencyId:7001}},response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404}));
  }
});
