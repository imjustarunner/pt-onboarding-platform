import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Modal from '../ClientUpdateModal.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
let wrapper;
const props={open:true,clientId:5,agencyId:2,guardianEmail:'caregiver@example.invalid',guardianName:'Care Giver'};
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async url=>({data:url==='/client-updates/status'?{enabled:true}:{documents:[{id:1,name:'Current consent'}],assessments:[],portalSteps:[],recipients:[{id:3,name:"Care Giver",email:props.guardianEmail,forms:true,billing:true}]}}));api.post.mockImplementation(async url=>({data:url.endsWith('/send')?{deliveryStatus:'queued'}:{request:{id:7}}}));});
afterEach(()=>wrapper?.unmount());
async function selectDocument(){await flushPromises();await wrapper.get('.cu-grid input[type=checkbox]').setValue(true);}
const sendButton=()=>wrapper.findAll('button').find(b=>b.text()==='Send portal update');
it('shows an honest rollout hold without creating a client, assigning forms or sending',async()=>{api.get.mockResolvedValue({data:{enabled:false}});wrapper=mount(Modal,{props});await flushPromises();expect(wrapper.text()).toContain('on hold');expect(wrapper.find('input').exists()).toBe(false);expect(api.get).toHaveBeenCalledTimes(1);expect(api.post).not.toHaveBeenCalled();});
it('saves the selected update and makes one explicit delivery attempt without claiming an approval is sent',async()=>{wrapper=mount(Modal,{props});await selectDocument();await sendButton().trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/clients/5/updates',expect.objectContaining({agencyId:2,send:false,documents:[1]}));expect(api.post).toHaveBeenCalledWith('/clients/5/updates/7/send',{guardianEmail:props.guardianEmail});expect(wrapper.text()).toContain('queued for approval');expect(wrapper.emitted('sent')).toBeUndefined();expect(sendButton().attributes('disabled')).toBeDefined();});
it('does not replay an uncertain mail attempt when the modal remains open',async()=>{api.post.mockImplementation(async url=>{if(url.endsWith('/send'))throw new Error('Connection lost');return {data:{request:{id:7}}};});wrapper=mount(Modal,{props});await selectDocument();await sendButton().trigger('click');await flushPromises();expect(wrapper.text()).toContain('Check email history');expect(sendButton().attributes('disabled')).toBeDefined();expect(api.post).toHaveBeenCalledTimes(2);});
it('does not send a late draft result after the selected client changes',async()=>{let finish;api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));wrapper=mount(Modal,{props});await selectDocument();await sendButton().trigger('click');await wrapper.setProps({clientId:6});await flushPromises();finish({data:{request:{id:7}}});await flushPromises();expect(api.post).toHaveBeenCalledTimes(1);expect(wrapper.text()).not.toContain('Portal update sent');});

it('shows each guardian delivery separately without claiming a failed request was sent',async()=>{
 api.post.mockImplementation(async url=>({data:url.endsWith('/send')?{deliveryStatus:'needs_followup',deliveries:[{name:'Parent One',deliveryStatus:'sent'},{name:'Parent Two',deliveryStatus:'needs_followup'}]}:{request:{id:7}}}));
 wrapper=mount(Modal,{props});await selectDocument();await sendButton().trigger('click');await flushPromises();
 expect(wrapper.text()).toContain('Parent One: sent');expect(wrapper.text()).toContain('Parent Two: needs followup');expect(wrapper.emitted('sent')).toBeUndefined();
});

it('assigns an authorization-only task to a linked billing recipient without clinical access',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/status')?{enabled:true}:{portalSteps:[{key:'authorization',title:'Payment authorization'}],recipients:[{id:7,name:'Billing guardian',billing:true,forms:false,email:'billing@example.invalid'}]}}));
 api.post.mockResolvedValueOnce({data:{noticeId:42}}).mockResolvedValueOnce({data:{queued:true}});
 wrapper=mount(Modal,{props});await selectDocument();await sendButton().trigger('click');await flushPromises();
 expect(api.post.mock.calls).toEqual([['/family-billing/staff/tasks',{agencyId:2,guardianUserId:7,clientIds:[5],fromPortal:true,requireCard:false}],['/family-billing/staff/notices/42/send',{agencyId:2}]]);
 expect(wrapper.text()).toContain('Notification queued');
});
it('keeps an intake email from becoming a recipient without a linked account',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/status')?{enabled:true}:{documents:[{id:1,name:'Consent'}],recipients:[]}}));
 wrapper=mount(Modal,{props});await selectDocument();expect(sendButton().attributes('disabled')).toBeDefined();expect(api.post).not.toHaveBeenCalled();
});
