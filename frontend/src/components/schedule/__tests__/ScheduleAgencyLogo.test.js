import { expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({agencies:[],userAgencies:[]})}));
import Logo from '../ScheduleAgencyLogo.vue';
it('replaces an unavailable agency upload with the tenant’s packaged icon', async()=>{
  const wrapper=mount(Logo,{props:{agencyId:3,label:'The Inner Strength Institute',iconUrl:'/uploads/unavailable.png'}});
  expect(wrapper.get('img').attributes('src')).toBe('/uploads/unavailable.png');
  await wrapper.get('img').trigger('error');
  expect(wrapper.get('img').attributes('src')).toBe('/assets/branding/innerstrength-favicon-v2.png');
  await wrapper.get('img').trigger('error'); expect(wrapper.find('img').exists()).toBe(false);
  expect(wrapper.text()).toBe('TI');wrapper.unmount();
});
