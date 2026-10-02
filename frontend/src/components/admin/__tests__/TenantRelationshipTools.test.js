import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import TenantRelationshipTools from '../TenantRelationshipTools.vue';
const api=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
beforeEach(()=>vi.clearAllMocks());
describe('agency service assignments',()=>{
 it('shows the shared credential level separately from service assignments',async()=>{
  api.get.mockResolvedValue({data:{credentialTier:'bachelors',credential:'BA',services:[{id:234,name:'Counseling',assigned:0},{id:239,name:'Skills training',assigned:0}]}});
  const wrapper=shallowMount(TenantRelationshipTools,{props:{userId:538,agencyId:6}});
  wrapper.get('details').element.open=true;await wrapper.get('details').trigger('toggle');await flushPromises();
  expect(wrapper.text()).toContain('Clinical permission level: Bachelor’s level');
  expect(wrapper.text()).toContain('Assignments do not grant clinical permissions');
  expect(wrapper.findAll('input[type="checkbox"]').every(c=>!c.element.checked)).toBe(true);
 });
 it('loads on expansion and saves choices only for the selected person and agency',async()=>{
  const data={services:[{id:234,name:'Individual counseling',service_code:'H0004',assigned:1},{id:239,name:'Skills training',service_code:'H2014',assigned:0}]};
  api.get.mockResolvedValue({data});api.put.mockResolvedValue({data});
  const wrapper=shallowMount(TenantRelationshipTools,{props:{userId:538,agencyId:6}});
  expect(api.get).not.toHaveBeenCalled();
  wrapper.get('details').element.open=true;await wrapper.get('details').trigger('toggle');await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/users/538/agencies/6/service-assignments');
  expect(wrapper.getComponent({name:'ProviderAvailabilitySettings'}).props()).toMatchObject({providerId:538,agencyId:6});
  await wrapper.findAll('input[type="checkbox"]')[1].setValue(true);
  await wrapper.get('fieldset button').trigger('click');await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/users/538/agencies/6/service-assignments',{serviceIds:[234,239]});
  expect(wrapper.get('[role="status"]').text()).toContain('saved for this agency');
 });
});
