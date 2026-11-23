import { it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Card from '../GuardianContactCard.vue';
import api from '../../../services/api';
import {openEmailComposer} from '../../../utils/emailComposerWindow';
const auth = vi.hoisted(() => ({ user: { role: 'provider' } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => auth }));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),delete:vi.fn()}}));
vi.mock('../../../utils/emailComposerWindow',()=>({openEmailComposer:vi.fn()}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'}}),useRouter:()=>({})}));
it('sends one parent email with both explicitly selected client records',async()=>{
 api.get.mockResolvedValue({data:{guardian:{id:30,name:'Demo Parent',email:'parent@example.test'},clients:[{id:1,name:'Child One',agencyId:2,agencyName:'ITSCO'},{id:2,name:'Child Two',agencyId:2,agencyName:'ITSCO'}]}});
 const w=mount(Card,{props:{guardianId:30,clientId:1,showAccountLink:true},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.find('input').element.checked).toBe(true);
 await w.findAll('input')[1].setValue(true);await w.find('button').trigger('click');
 expect(openEmailComposer).toHaveBeenCalledWith(expect.anything(),{mode:'new',agencyId:2,to:'parent@example.test',clientIds:'1,2'});
 expect(w.find('router-link-stub').attributes('to')).toBe('/itsco/guardian-contacts/30');w.unmount();
});
it('does not allow sending without a selected client from the guardian account',async()=>{
 api.get.mockResolvedValue({data:{guardian:{id:30,name:'Demo Parent',email:'parent@example.test'},clients:[{id:1,name:'Child One',agencyId:2,agencyName:'ITSCO'}]}});
 const w=mount(Card,{props:{guardianId:30},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.find('button').attributes('disabled')).toBeDefined();w.unmount();
});
it('refreshes Account Information after the same guardian is edited in Portal',async()=>{
 let name='Previous Example';
 api.get.mockImplementation(async url=>({data:url.endsWith('/voicemails')?{conversations:[]}:{guardian:{id:30,name,email:'parent@example.test'},clients:[]}}));
 const w=mount(Card,{props:{guardianId:30,refreshKey:'previous'},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.text()).toContain('Previous Example');name='Correct Example';
 await w.setProps({refreshKey:'correct'});await flushPromises();
 expect(w.text()).toContain('Correct Example');expect(w.text()).not.toContain('Previous Example');w.unmount();
});
it('opens a linked voicemail and shows its transcript without sending email',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/voicemails')?{conversations:[{id:12,subject:'Voicemail from parent',last_message_at:'2026-10-27'}]}:url.includes('/conversations/')?{conversation:{id:12,subject:'Voicemail from parent'},messages:[{id:1,from:{email:'help@grasshopper.com'},body_text:'Transcription: Please call me back.'}]}:{guardian:{id:30,name:'Parent',email:'parent@example.test'},clients:[{id:1,name:'Child',agencyId:2,agencyName:'ITSCO'}]}}));
 const w=mount(Card,{props:{guardianId:30},global:{stubs:{RouterLink:true}}});await flushPromises();
 await w.findAll('button').find(b=>b.text().includes('Voicemail from parent')).trigger('click');await flushPromises();
 expect(w.text()).toContain('Transcription: Please call me back.');w.unmount();
});
it('opens the full guardian profile for staff and disconnects only the current client', async () => {
 auth.user.role = 'super_admin';
 const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
 api.get.mockResolvedValue({ data: { guardian: { id: 30 }, clients: [{ id: 1, agencyId: 2 }, { id: 2, agencyId: 2 }] } });
 api.delete.mockResolvedValue({ data: { ok: true } });
 const wrapper = mount(Card, { props: { guardianId: 30, clientId: 2, showAccountLink: true }, global: { stubs: { RouterLink: true } } });
 try {
  await flushPromises();
  expect(wrapper.get('router-link-stub').attributes('to')).toBe('/itsco/admin/users/30');
  await wrapper.findAll('button').find(button => button.text() === 'Disconnect from this client').trigger('click');
  await flushPromises();
  expect(api.delete).toHaveBeenCalledExactlyOnceWith('/clients/2/guardians/30', { skipGlobalLoading: true });
  expect(wrapper.emitted('disconnected')).toEqual([[{ guardianId: 30, clientId: 2 }]]);
 } finally {
  wrapper.unmount();
  confirm.mockRestore();
  auth.user.role = 'provider';
 }
});

it('shows a valid account with no linked clients without offering client outreach', async () => {
 api.get.mockImplementation(async url => ({data:url.endsWith('/voicemails')?{conversations:[]}:{guardian:{id:30,name:'Demo Parent',email:'parent@example.test'},clients:[]}}));
 const w=mount(Card,{props:{guardianId:30},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.text()).toContain('Demo Parent');
 expect(w.text()).toContain('No current client relationships are available for this guardian account.');
 expect(w.find('[role=alert]').exists()).toBe(false);
 expect(w.find('button').exists()).toBe(false);
 w.unmount();
});
