import { expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({agencies:[],userAgencies:[{id:377,slug:'tisi',name:'The Inner Strength Institute',logo_url:'/assets/missing-logo.png'}]})}));
import Logo from '../ScheduleAgencyLogo.vue';
it('replaces an unavailable agency upload with the tenant’s packaged icon', async()=>{
  const wrapper=mount(Logo,{props:{agencyId:3,label:'The Inner Strength Institute',iconUrl:'/uploads/unavailable.png'}});
  expect(wrapper.get('img').attributes('src')).toBe('/uploads/unavailable.png');
  await wrapper.get('img').trigger('error');
  expect(wrapper.get('img').attributes('src')).toBe('/assets/branding/innerstrength-favicon-v2.png');
  await wrapper.get('img').trigger('error'); expect(wrapper.find('img').exists()).toBe(false);
  expect(wrapper.text()).toBe('TI');wrapper.unmount();
});
it('falls back from a broken uploaded logo to the bundled Inner Strength mark',async()=>{
  const wrapper=mount(Logo,{props:{agencyId:377}});
  expect(wrapper.get('img').attributes('src')).toBe('/assets/missing-logo.png');
  await wrapper.get('img').trigger('error');
  expect(wrapper.get('img').attributes('src')).toBe('/assets/branding/innerstrength-favicon-v2.png');
  expect(wrapper.get('img').attributes('alt')).toContain('Inner Strength');wrapper.unmount();
});
