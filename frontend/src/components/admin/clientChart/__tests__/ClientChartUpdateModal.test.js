import { beforeEach, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),leave:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:{get:m.get}}));
import Modal from '../ClientChartUpdateModal.vue';
const Panel=defineComponent({ name:'ClientEhrBringUpToDatePanel',props:['clientId','agencyId'],setup(props,{expose}){ expose({prepareLeave:m.leave});return{};},template:'<div data-panel :data-client="clientId" :data-agency="agencyId" />' });
const client={id:12,agency_id:2,full_name:'Alex Example'};
beforeEach(()=>{vi.resetAllMocks();m.leave.mockResolvedValue(true);m.get.mockResolvedValue({data:[client,{id:13,agency_id:3,full_name:'Pat Example'}]});});
it('moves to the next client with one click after saving drafts',async()=>{
 const wrapper=mount(Modal,{props:{initialClient:client},global:{stubs:{ClientEhrBringUpToDatePanel:Panel}}});await flushPromises();
 await wrapper.findAll('button').find(b=>b.text()==='Next client →').trigger('click');await flushPromises();
 expect(m.leave).toHaveBeenCalledOnce();expect(wrapper.get('[data-panel]').attributes('data-client')).toBe('13');expect(wrapper.get('[data-panel]').attributes('data-agency')).toBe('3');wrapper.unmount();
});
it('keeps the current client open when a draft could not be saved',async()=>{
 m.leave.mockResolvedValue(false);const wrapper=mount(Modal,{props:{initialClient:client},global:{stubs:{ClientEhrBringUpToDatePanel:Panel}}});await flushPromises();
 await wrapper.findAll('button').find(b=>b.text()==='Next client →').trigger('click');await flushPromises();
 expect(wrapper.get('[data-panel]').attributes('data-client')).toBe('12');await wrapper.findAll('button').find(b=>b.text()==='Close').trigger('click');await flushPromises();expect(wrapper.emitted('close')).toBeUndefined();wrapper.unmount();
});
it('loads all authorized list pages and preserves the initially selected client',async()=>{
 m.get.mockResolvedValueOnce({data:{items:[{id:11,agency_id:2,initials:'AA'}],total:3}}).mockResolvedValueOnce({data:{items:[client,{id:13,agency_id:2,initials:'CC'}],total:3}});
 const wrapper=mount(Modal,{props:{initialClient:client,agencyId:2},global:{stubs:{ClientEhrBringUpToDatePanel:Panel}}});await flushPromises();
 expect(m.get).toHaveBeenCalledTimes(2);expect(m.get.mock.calls[1][1].params).toMatchObject({agency_id:2,page:2,includeArchived:true});expect(wrapper.findAll('option')).toHaveLength(3);expect(wrapper.get('[data-panel]').attributes('data-client')).toBe('12');wrapper.unmount();
});
