import {beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import Messages from '../GuardianMessagesPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:1759,role:'client_guardian'}})}));
const assigned={client_id:2545,agency_id:453,service_id:1038,service_kind:'tutoring',client_label:'QA Student',provider:{id:1496},thread_id:380,available:true,participants:[{id:1496,name:'QA Tutor',role:'provider'},{id:1759,name:'QA Parent',role:'guardian'},{id:1785,name:'Guardian (name private)',role:'guardian'}]};
const options={props:{clientId:2545,learning:true},global:{stubs:{QaRecipientEmailInbox:true,ConversaBrand:true,FamilySharingNotice:true,SecureMessageBanner:true}}};
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async url=>({data:url==='/guardian-portal/messages'?{threads:[assigned]}:[]}));});
it('shows learning wording and the authorized named/role roster on actual Messages before composing anything',async()=>{
 const w=mount(Messages,options);await flushPromises();expect(w.text()).toContain('learning team');expect(w.text()).not.toMatch(/care team|therapy/);expect(w.text()).toContain('QA Tutor · Tutor');expect(w.text()).toContain('QA Parent · Guardian (you)');expect(w.text()).toContain('Guardian (name private) · Guardian');expect(w.find('textarea').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('shows an actionable exact-service prerequisite rather than inviting an unassigned family to message another tutor',async()=>{
 api.get.mockResolvedValue({data:{threads:[{...assigned,service_id:1042,provider:null,participants:[],thread_id:null,available:false,unavailable_reason:'provider_unassigned'}]}});
 const w=mount(Messages,options);await flushPromises();expect(w.text()).toContain('A tutor must be assigned to this service');expect(w.get('.new-subject').element.disabled).toBe(true);expect(w.text()).not.toContain('QA Tutor');expect(w.text()).not.toContain('Start a subject to message');expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('distinguishes a clinical access denial from a successful empty inbox and a temporary failure',async()=>{
 api.get.mockRejectedValue({response:{status:403,data:{error:{message:'Clinical scope is restricted'}}}});
 const w=mount(Messages,{...options,props:{clientId:2271,learning:false}});await flushPromises();expect(w.text()).toContain('does not have permission to view messages for this service');expect(w.text()).not.toContain('No care conversations');expect(w.text()).not.toContain('learning team');expect(w.find('.new-subject').exists()).toBe(false);expect(w.text()).not.toContain('No secure subjects yet');w.unmount();
});


it('never flashes a composer while clinical access is unresolved, then announces the exact denial',async()=>{
 let reject;api.get.mockImplementationOnce(()=>new Promise((_,fail)=>reject=fail));
 const w=mount(Messages,{...options,props:{clientId:2271,learning:false,serviceKind:'counseling'}});await flushPromises();expect(w.find('.new-subject').exists()).toBe(false);expect(w.get('[role=status]').text()).toContain('Loading messages');
 reject({response:{status:403}});await flushPromises();expect(w.get('[role=alert]').text()).toContain('clinical messages for this counseling service');expect(w.get('[role=alert]').attributes('tabindex')).toBe('0');expect(w.find('.new-subject').exists()).toBe(false);w.unmount();
});
