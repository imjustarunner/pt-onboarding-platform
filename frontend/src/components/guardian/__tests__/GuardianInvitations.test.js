import { it,expect,vi,beforeEach } from 'vitest';
import { mount,flushPromises } from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
import Invitations from '../GuardianInvitations.vue';
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{invitations:[{id:3,email:'typo@example.test',deliveryStatus:'failed'}]}});});
it('shows delivery failure and lets the parent correct the stored invitation',async()=>{
 const w=mount(Invitations,{props:{agencyId:4}});await flushPromises();expect(w.text()).toContain('Invitation not delivered');
 await w.get('input').setValue('correct@example.test');api.post.mockResolvedValue({data:{deliveryStatus:'sent'}});await w.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/invitations/3/resend',{agencyId:4,email:'correct@example.test'});expect(w.text()).toContain('previous link no longer works');w.unmount();
});
it('keeps a failed resend visible and does not claim success',async()=>{
 const w=mount(Invitations,{props:{agencyId:4}});await flushPromises();api.post.mockResolvedValue({data:{deliveryStatus:'failed'}});await w.get('form').trigger('submit');await flushPromises();expect(w.text()).not.toContain('new invitation was sent');expect(w.text()).toContain('Invitation not delivered');w.unmount();
});
it('has a Spanish correction path',async()=>{const w=mount(Invitations,{props:{agencyId:4,language:'es'}});await flushPromises();expect(w.text()).toContain('No se pudo entregar');expect(w.get('button').text()).toContain('Guardar y reenviar');w.unmount();});
