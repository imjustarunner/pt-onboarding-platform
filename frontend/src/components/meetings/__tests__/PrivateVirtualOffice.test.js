import {mount,flushPromises} from '@vue/test-utils';import {describe,it,expect,vi,afterEach} from 'vitest';import Office from '../PrivateVirtualOffice.vue';
afterEach(()=>vi.useRealTimers());
describe('private office admission UI',()=>{
 it('always requires individual admission and keeps Premium at one guest',async()=>{
 const plan={name:'Premium',privateOffice:true,multipleOfficeGuests:false};const requests=[];
 const request=vi.fn(async(path)=>{requests.push(path);if(path==='/me/plan')return {plan};if(path==='/me')return {room:{slug:'stable'}};if(path==='/me/lobby')return {plan,waiting:[{id:2,guestDisplayName:'Pat'}],admitted:[{id:1,guestDisplayName:'Robin'}]};if(path==='/me/video-token')return {token:'fake',sessionId:'fake'};return {ok:true};});
 const wrapper=mount(Office,{props:{request},global:{stubs:{VideoSessionRoom:{name:'VideoSessionRoom',template:'<div />',emits:['connected']}}}});await flushPromises();
 expect(wrapper.text()).not.toContain('Admit all');expect(wrapper.text()).not.toContain('Let everyone');
 await wrapper.findAll('button').find(b=>b.text()==='Open office video').trigger('click');await flushPromises();wrapper.findComponent({name:'VideoSessionRoom'}).vm.$emit('connected');await flushPromises();
 expect(wrapper.findAll('button').find(b=>b.text()==='Admit Pat').attributes('disabled')).toBeDefined();wrapper.unmount();
 });
 it('Basic does not open an office or start paid media',async()=>{const request=vi.fn(async()=>({plan:{name:'Basic',privateOffice:false}}));const w=mount(Office,{props:{request},global:{stubs:{VideoSessionRoom:true}}});await flushPromises();expect(request).toHaveBeenCalledTimes(1);expect(w.text()).toContain('Upgrade to Premium');w.unmount();});
});
