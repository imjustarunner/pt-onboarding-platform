import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Card from '../BriefingSecurityCard.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
let wrapper;beforeEach(()=>vi.clearAllMocks());afterEach(()=>wrapper?.unmount());
it('shows recorded sign-ins before the security advice and routes to session review',async()=>{
 api.get.mockResolvedValue({data:{items:[{reference:'one',current:true,browser:'Chrome',startedAt:'2026-11-22T12:00:00Z'},{reference:'two',browser:'Firefox',startedAt:'2026-11-21T12:00:00Z'}]}});
 wrapper=mount(Card,{props:{userId:7,to:'/itsco/account-security'}});await flushPromises();
 expect(wrapper.findAll('li')).toHaveLength(2);expect(wrapper.text().indexOf('Firefox')).toBeLessThan(wrapper.text().indexOf('If you don’t recognize'));
 await wrapper.get('.security-link').trigger('click');expect(wrapper.emitted('navigate')).toEqual([['/itsco/account-security']]);
});
it('reports a history failure without presenting an empty history as verified',async()=>{
 api.get.mockRejectedValue(Error('offline'));wrapper=mount(Card,{props:{userId:7}});await flushPromises();expect(wrapper.text()).toContain('could not be loaded');expect(wrapper.text()).not.toContain('No earlier sign-ins');
});
it('discards a stale history response after the user changes',async()=>{
 let finish;api.get.mockReturnValueOnce(new Promise(resolve=>finish=resolve)).mockResolvedValueOnce({data:{items:[{reference:'new',browser:'New browser'}]}});
 wrapper=mount(Card,{props:{userId:7}});await wrapper.setProps({userId:8});await flushPromises();finish({data:{items:[{reference:'old',browser:'Old browser'}]}});await flushPromises();expect(wrapper.text()).toContain('New browser');expect(wrapper.text()).not.toContain('Old browser');
});
