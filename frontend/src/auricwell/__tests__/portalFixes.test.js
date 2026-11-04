import {it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {portalReadApi} from '../portalReadApi';
import {auricwellLoginDestination} from '../../utils/loginHandoff';
import Calendar from '../../components/schedule/ScheduleRecordCalendar.vue';
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../services/api';
import Recovery from '../SessionRecovery.vue';
import PortalForms from '../../components/safetyPlans/PortalSafetyPlans.vue';
it('keeps each parent preview in its own account and practice, including downloads',async()=>{
 const api={get:vi.fn().mockResolvedValue({data:{}})},first=portalReadApi(api,{clientId:7,userId:10,agencyId:2}),second=portalReadApi(api,{clientId:7,userId:11,agencyId:2});
 await first.get('/guardian-portal/clients/7/intake-documents',{params:{agencyId:99}});await second.get('/family-billing/balances');
 expect(api.get.mock.calls[0]).toEqual(['/portal-admin/clients/7/accounts/10/read',{params:{agencyId:2,resource:'intake-documents'}}]);
 expect(api.get.mock.calls[1][0]).toBe('/portal-admin/clients/7/accounts/11/read');
 await first.post('/assessment-deliverables/22/export',{format:'pdf'},{responseType:'blob'});expect(api.get.mock.calls.at(-1)[1]).toMatchObject({responseType:'blob',params:{agencyId:2,resource:'assessment-download',id:'22'}});
 for(const work of [()=>first.post('/family-billing/allocations/1/pay',{}),()=>first.get('/guardian-portal/clients/8/shared-files'),()=>first.put('/account',{}),()=>first.delete('/files/3'),()=>first.post('/assessment-deliverables/22/export',{format:'google_doc'})])await expect(work()).rejects.toThrow('read-only');
 expect(api.get).toHaveBeenCalledTimes(3);
});
it('restores only same-origin AuricWell entry paths, including query and hash',()=>{
 const target='/auricwell/app/itsco/my-schedule?view=day&weekStart=2026-11-02#event';expect(auricwellLoginDestination(target,'app.itsco.health')).toBe(target);
 expect(auricwellLoginDestination('/app/itsco/portal','auricwell.com')).toBe('/app/itsco/portal');
 for(const url of ['//evil.test/app','https://evil.test','/auricwell/app\\evil','/app/itsco','/auricwell/app\n/other','/auricwell/application'])expect(auricwellLoginDestination(url,'app.itsco.health')).toBeNull();
});
it('shows overnight events on both days and keeps exact calendar minutes',()=>{
 const wrapper=mount(Calendar,{props:{start:'2026-11-03',days:2,timeZone:'America/Denver',records:[{key:'1',date:'2026-11-03',startAt:'2026-11-04T06:28:00Z',endAt:'2026-11-04T08:21:00Z',title:'Overnight block'}]}});
 expect(wrapper.findAll('li')).toHaveLength(2);expect(wrapper.text()).toContain('11:28 PM–1:21 AM');wrapper.unmount();
});
it('unlocks in place using the session endpoint and emits only after success',async()=>{
 api.get.mockResolvedValue({data:{pinRequired:true}});api.post.mockRejectedValueOnce({response:{data:{error:{message:'Incorrect passcode'}}}}).mockResolvedValueOnce({data:{}});
 const wrapper=mount(Recovery,{props:{loginUrl:'/login?redirect=test'}});await flushPromises();await wrapper.get('input').setValue('123456');await wrapper.get('form').trigger('submit');await flushPromises();expect(wrapper.emitted('resumed')).toBeUndefined();expect(wrapper.text()).toContain('Incorrect passcode');await wrapper.get('input').setValue('654321');await wrapper.get('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenLastCalledWith('/auth/session-activity',{action:'resume',pin:'654321'});expect(wrapper.emitted('resumed')).toHaveLength(1);wrapper.unmount();
});

it('shows a pending form in preview without signature or editing controls',async()=>{
 const readApi={get:vi.fn().mockResolvedValueOnce({data:{shares:[{id:5,title:'Update information',version:1}]}}).mockResolvedValueOnce({data:{version:1,currentVersion:1,template:{key:'client-information-update'},data:{},branding:{},mySignerId:10,signers:[{id:10,allowCompletion:true}]}})};
 const wrapper=mount(PortalForms,{props:{clientId:7,readOnly:true},global:{provide:{clinicalFormsHttp:readApi},stubs:{SafetyPlanDocument:{props:['editable'],template:'<div :data-editable="editable" />'},SafetyPlanSigning:true,ClinicalDocumentCopy:true}}});
 await flushPromises();await wrapper.get('nav button').trigger('click');await flushPromises();
 expect(wrapper.find('safety-plan-signing-stub').exists()).toBe(false);
 expect(wrapper.get('[data-editable]').attributes('data-editable')).toBe('false');
 expect(wrapper.text()).not.toContain('Complete the fields below');wrapper.unmount();
});
