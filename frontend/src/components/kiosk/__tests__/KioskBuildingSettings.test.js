import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),delete:vi.fn()}}));
const { route, replace } = vi.hoisted(()=>({route:{query:{},params:{},path:'/buildings/settings'},replace:vi.fn()}));
vi.mock('vue-router',()=>({useRoute:()=>route,useRouter:()=>({replace})}));
import api from '../../../services/api';
import Selector from '../KioskBuildingSelector.vue';
import Access from '../OfficeKioskAccessSettings.vue';
import Shell from '../../../views/OfficeShellView.vue';
let wrapper;
const offices=[{id:6,name:'Denver'},{id:1,name:'Windchime'}];
beforeEach(()=>{
  vi.resetAllMocks();route.query={};
  api.get.mockImplementation(async path=>{
    if(path==='/offices')return {data:offices};
    if(path.endsWith('/kiosk-access'))return {data:{configured:false,devices:[]}};
    return {data:{id:1,name:'Windchime',agencies:[{id:2,name:'ITSCO'},{id:6,name:'Next Level Up'},{id:1,name:'Plot Twist Co'}]}};
  });
});
afterEach(()=>wrapper?.unmount());
it('offers a local building selector and preserves other settings query parameters',async()=>{
  route.query={officeId:'6',view:'settings'};
  wrapper=mount(Selector);await flushPromises();
  expect(wrapper.find('select').element.value).toBe('6');
  await wrapper.find('select').setValue('1');
  expect(replace).toHaveBeenCalledWith({query:{officeId:'1',view:'settings'}});
});
it('does not silently choose the alphabetically first building',async()=>{
  wrapper=mount(Shell,{global:{stubs:{RouterLink:true,RouterView:true}}});await flushPromises();
  expect(wrapper.find('select').element.value).toBe('');
  expect(replace).not.toHaveBeenCalled();
  expect(wrapper.find('.kiosk-link-panel').exists()).toBe(false);
});
it('names the building and all affiliated agencies before creating its code',async()=>{
  api.post.mockResolvedValue({data:{code:'001234'}});
  wrapper=mount(Access,{props:{officeId:1}});await flushPromises();
  expect(wrapper.text()).toContain('Windchime · AuricWell Kiosk setup');
  for(const name of ['ITSCO','Next Level Up','Plot Twist Co'])expect(wrapper.text()).toContain(name);
  expect(wrapper.find('a.btn').attributes('href')).toBe('/kiosk-welcome/1');
  const button=wrapper.findAll('button').find(button=>button.text()==='Create Windchime code');
  await button.trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/offices/1/kiosk-access/rotate');
  expect(wrapper.find('.new-code').text()).toContain('Windchime setup code001234');
});
it('does not allow code creation if the building identity cannot load',async()=>{
  api.get.mockImplementation(async path=>{
    if(path.endsWith('/kiosk-access'))return {data:{configured:false,devices:[]}};
    throw new Error('offline');
  });
  wrapper=mount(Access,{props:{officeId:1}});await flushPromises();
  expect(wrapper.text()).toContain('Could not load kiosk access');
  expect(wrapper.findAll('button')).toHaveLength(0);
  expect(api.post).not.toHaveBeenCalled();
});
it('clears the previous building code immediately when switching buildings',async()=>{
  api.post.mockResolvedValue({data:{code:'001234'}});
  wrapper=mount(Access,{props:{officeId:1}});await flushPromises();
  await wrapper.find('button').trigger('click');await flushPromises();
  api.get.mockImplementation(()=>new Promise(()=>{}));
  await wrapper.setProps({officeId:6});
  expect(wrapper.text()).not.toContain('001234');
  expect(wrapper.text()).not.toContain('Windchime');
});
