import {it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
import api from '../../../services/api';
import History from '../ClientNotificationHistory.vue';
beforeEach(()=>vi.clearAllMocks());
it('shows invitation and SMS delivery progress for the selected dependent without claiming a read',async()=>{
 api.get.mockResolvedValue({data:{notifications:[{id:'invite-1',type:'guardian_enrollment_invitation',channel:'email',status:'sent',recipient:'parent@example.test',occurredAt:'2026-10-27T18:00:00Z'},{id:'sms-2',type:'session_reminder',channel:'sms',status:'delivered',occurredAt:'2026-10-27T18:00:00Z'}]}});
 const w=mount(History,{props:{clientId:5,guardian:true}});await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/guardian-portal/clients/5/notification-history',expect.anything());
 expect(w.text()).toContain('Guardian enrollment invitation');expect(w.text()).toContain('sms · Delivered');expect(w.text()).toContain('does not confirm that someone read it');w.unmount();
});
it('clears the prior dependent and ignores an obsolete response',async()=>{
 let old;api.get.mockImplementationOnce(()=>new Promise(resolve=>old=resolve)).mockResolvedValueOnce({data:{notifications:[]}});
 const w=mount(History,{props:{clientId:5,guardian:true}});await w.setProps({clientId:6});await flushPromises();
 old({data:{notifications:[{id:'private-old',type:'must not appear'}],hasMore:true}});await flushPromises();
 expect(w.text()).not.toContain('must not appear');expect(w.text()).not.toContain('Load older');w.unmount();
});
it('offers a Spanish history with a genuine failure state',async()=>{
 api.get.mockRejectedValue(new Error('offline'));const w=mount(History,{props:{clientId:5,guardian:true,language:'es'}});await flushPromises();expect(w.text()).toContain('Historial de comunicaciones');expect(w.get('[role=alert]').text()).toContain('No se pudo cargar');w.unmount();
});
