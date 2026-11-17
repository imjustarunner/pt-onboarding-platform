import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {ref} from 'vue';
import Records from '../GuardianProgressRecords.vue';
import CareAccess from '../GuardianCareAccess.vue';
import api from '../../../services/api';
import {familyLocaleKey,familyTranslator} from '../../../composables/useFamilyLocale';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
beforeEach(()=>{vi.clearAllMocks();});
it.each(['checkins','evaluations'])('presents denied %s as a neutral access state with a real help action',async kind=>{
 api.get.mockRejectedValue({response:{status:403}});
 const w=mount(Records,{props:{clientId:8,clientName:'Synthetic Child',kind}});await flushPromises();
 expect(w.find('[role=alert]').exists()).toBe(false);expect(w.get('[role=status]').text()).toContain('not currently shared with your account');
 expect(w.text()).not.toContain('No evaluation reports');expect(w.text()).not.toContain('No completed check-ins');
 await w.get('.record-access-notice button').trigger('click');expect(w.emitted('help')).toHaveLength(1);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('keeps a real records failure distinct and refreshes without claiming permissions changed',async()=>{
 api.get.mockRejectedValueOnce({response:{status:500}}).mockResolvedValue({data:{deliverables:[]}});
 const w=mount(Records,{props:{clientId:8,kind:'evaluations'}});await flushPromises();
 expect(w.get('[role=alert]').text()).toContain('could not be loaded');expect(w.find('.record-access-notice').exists()).toBe(false);
 await w.get('header button').trigger('click');await flushPromises();expect(w.find('[role=alert]').exists()).toBe(false);expect(w.text()).toContain('No evaluation reports');w.unmount();
});
it('discards a delayed denial from another client instead of replacing current shared records',async()=>{
 let rejectOld;api.get.mockImplementationOnce(()=>new Promise((resolve,reject)=>{rejectOld=reject})).mockResolvedValue({data:{deliverables:[{id:31,title:'Current shared report'}]}});
 const w=mount(Records,{props:{clientId:8,kind:'evaluations'}});await w.setProps({clientId:9});await flushPromises();rejectOld({response:{status:403}});await flushPromises();
 expect(w.text()).toContain('Current shared report');expect(w.find('.record-access-notice').exists()).toBe(false);expect(w.find('[role=alert]').exists()).toBe(false);w.unmount();
});
it('explains a denied messaging audience without a retry or an enabled conversation',async()=>{
 api.get.mockRejectedValue({response:{status:403}});const w=mount(CareAccess,{props:{clientId:8}});await flushPromises();
 expect(w.get('[role=status]').text()).toContain('not authorized for your account');expect(w.find('[role=alert]').exists()).toBe(false);expect(w.text()).not.toContain('Try again');expect(w.text()).not.toContain('These people can read');
 const open=w.findAll('button').find(b=>b.text().includes('conversation'));expect(open.element.disabled).toBe(true);
 await w.findAll('button').find(b=>b.text()==='Contact your team').trigger('click');expect(w.emitted('help')).toHaveLength(1);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('reports a genuinely empty messaging audience without guessing a missing provider or network failure',async()=>{
 api.get.mockResolvedValue({data:{participants:[]}});const w=mount(CareAccess,{props:{clientId:8}});await flushPromises();
 expect(w.get('[role=status]').text()).toContain('No shared messaging participants');expect(w.text()).not.toContain('must be assigned');expect(w.text()).not.toContain('Try again');expect(w.find('[role=alert]').exists()).toBe(false);w.unmount();
});
it('offers retry for a messaging load failure and rechecks the permitted audience',async()=>{
 api.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({data:{participants:[{id:3,name:'Permitted provider',role:'provider'}]}});
 const w=mount(CareAccess,{props:{clientId:8}});await flushPromises();expect(w.get('[role=alert]').text()).toContain('could not be loaded');
 await w.findAll('button').find(b=>b.text()==='Try again').trigger('click');await flushPromises();expect(w.find('[role=alert]').exists()).toBe(false);expect(w.text()).toContain('Permitted provider');expect(w.findAll('button').find(b=>b.text().includes('conversation')).element.disabled).toBe(false);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('translates access guidance and updates the team wording without changing access',async()=>{
 api.get.mockRejectedValue({response:{status:403}});const locale=ref('es');const w=mount(CareAccess,{props:{clientId:8,learningOnly:true},global:{provide:{[familyLocaleKey]:{locale,ft:familyTranslator(locale)}}}});await flushPromises();
 expect(w.text()).toContain('Su cuenta no está autorizada');expect(w.text()).toContain('equipo de tutoría');expect(w.text()).not.toContain('Try again');
 await w.setProps({learningOnly:false});expect(w.text()).toContain('equipo de atención');locale.value='en';await flushPromises();expect(w.text()).toContain('not authorized for your account');expect(api.get).toHaveBeenCalledTimes(1);w.unmount();
});
