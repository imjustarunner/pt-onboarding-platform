import {describe,it,expect,vi,afterEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import GuardianIntakeDocuments from '../GuardianIntakeDocuments.vue';
const m=vi.hoisted(()=>({get:vi.fn()}));vi.mock('../../../services/api',()=>({default:m}));let wrapper;afterEach(()=>{wrapper?.unmount();vi.clearAllMocks();});
describe('guardian signed documents',()=>{
 it('lists signed copies for the selected child',async()=>{m.get.mockResolvedValue({data:{documents:[{id:7,document_template_name:'Consent copy',intake_link_title:'Packet'}]}});wrapper=mount(GuardianIntakeDocuments,{props:{clientId:10}});await flushPromises();expect(m.get).toHaveBeenCalledWith('/guardian-portal/clients/10/intake-documents');expect(wrapper.text()).toContain('Consent copy');expect(wrapper.get('button').text()).toBe('Download PDF');});
 it('does not show a sibling response after child selection changes',async()=>{let resolve;m.get.mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValue({data:{documents:[{id:8,document_template_name:'Other child copy'}]}});wrapper=mount(GuardianIntakeDocuments,{props:{clientId:10}});await wrapper.setProps({clientId:20});await flushPromises();resolve({data:{documents:[{id:7,document_template_name:'Old child copy'}]}});await flushPromises();expect(wrapper.text()).toContain('Other child copy');expect(wrapper.text()).not.toContain('Old child copy');});
 it('explains restricted access without describing it as missing paperwork',async()=>{m.get.mockRejectedValue({response:{status:403}});wrapper=mount(GuardianIntakeDocuments,{props:{clientId:10}});await flushPromises();expect(wrapper.get('[role=alert]').text()).toContain('not shared with this account');expect(wrapper.text()).not.toContain('No signed intake');});
});
