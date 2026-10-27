import { it,expect,vi,beforeEach } from 'vitest';
import { mount,flushPromises } from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
import Invitations from '../GuardianInvitations.vue';
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{invitations:[{id:3,email:'typo@example.test',deliveryStatus:'failed',canManage:true}]}});});
it('shows delivery failure and lets the parent correct the stored invitation',async()=>{
 const w=mount(Invitations,{props:{agencyId:4}});await flushPromises();expect(w.text()).toContain('Invitation not delivered');
 await w.get('input').setValue('correct@example.test');api.post.mockResolvedValue({data:{deliveryStatus:'sent'}});await w.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/invitations/3/resend',{agencyId:4,email:'correct@example.test'});expect(w.text()).toContain('previous link no longer works');w.unmount();
});
it('shows each invitation and reminder attempt and filters by dependent',async()=>{
 api.get.mockResolvedValue({data:{invitations:[{id:3,email:'other@example.test',status:'pending',deliveryStatus:'sent',nextReminderAt:'2026-11-03T18:00:00Z',history:[{id:1,kind:'invitation',status:'sent',occurredAt:'2026-10-27T18:00:00Z'},{id:2,kind:'reminder',status:'sent',occurredAt:'2026-10-29T18:00:00Z'}]}]}});
 const w=mount(Invitations,{props:{agencyId:4,clientId:5}});await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/guardian-portal/invitations',{params:{agencyId:4,clientId:5},skipGlobalLoading:true});
 expect(w.findAll('.invite-history li')).toHaveLength(2);expect(w.text()).toContain('Next reminder if enrollment is still incomplete');w.unmount();
});
it('keeps a failed resend visible and does not claim success',async()=>{
 const w=mount(Invitations,{props:{agencyId:4}});await flushPromises();api.post.mockResolvedValue({data:{deliveryStatus:'failed'}});await w.get('form').trigger('submit');await flushPromises();expect(w.text()).not.toContain('new invitation was sent');expect(w.text()).toContain('Invitation not delivered');w.unmount();
});
it('has a Spanish correction path',async()=>{const w=mount(Invitations,{props:{agencyId:4,language:'es'}});await flushPromises();expect(w.text()).toContain('No se pudo entregar');expect(w.get('button').text()).toContain('Guardar y reenviar');w.unmount();});
it('shows accepted invitation and connected account without exposing answers or offering resend',async()=>{
 api.get.mockResolvedValue({data:{invitations:[{id:3,email:'parent@example.test',status:'accepted',accountConnected:1,invitedAt:'2026-10-01T12:00:00Z',completedAt:'2026-10-02T12:00:00Z',deliveryStatus:'sent',canManage:true}]}});
 const w=mount(Invitations,{props:{agencyId:4}});await flushPromises();
 expect(w.text()).toContain('own connected portal account');expect(w.text()).toContain('Accepted:');
 expect(w.get('input').attributes('disabled')).toBeDefined();expect(w.find('button').exists()).toBe(false);w.unmount();
});
it('shows staff-managed historical invitation progress with a masked address and no resend controls',async()=>{
 api.get.mockResolvedValue({data:{invitations:[{id:18,email:'p•••@•••',status:'pending',accountConnected:0,invitedAt:'2026-10-01T12:00:00Z',lastSentAt:'2026-10-02T12:00:00Z',deliveryStatus:'failed',canManage:false}]}});
 const w=mount(Invitations,{props:{agencyId:4}});await flushPromises();
 expect(w.text()).toContain('support team manages this invitation');expect(w.text()).toContain('p•••@•••');
 expect(w.text()).toContain('Last delivery attempt:');expect(w.find('input').exists()).toBe(false);expect(w.find('button').exists()).toBe(false);
 await w.get('form').trigger('submit');await flushPromises();expect(api.post).not.toHaveBeenCalled();w.unmount();
});
