import {it,expect,vi,beforeEach,afterEach} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';import Flow from '../KioskCheckInFlow.vue';import Inbox from '../ClientCheckinSubmissions.vue';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),patch:vi.fn()}}));vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:7}})}));import api from '../../../services/api';
const forms=[{id:'connection',title:'Working together',fields:[{id:'heard',label:'I feel heard',type:'select',required:false,options:[{value:'yes',label:'Yes'}]}]},{id:'progress',title:'How care is helping',fields:[{id:'better',label:'I notice improvement',type:'text',required:false}]}];
let wrapper;beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();});afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
it('keeps the direct appointment open for optional feedback and finishes after saving/skipping',async()=>{
 api.post.mockResolvedValueOnce({data:{ok:true,notification:{inApp:true},submission:{forms}}}).mockResolvedValueOnce({data:{ok:true}});
 wrapper=mount(Flow,{props:{provider:{id:7,firstName:'Jordan'},locationId:1,directSlot:{eventId:9,startAt:'2026-09-30 15:00:00',appointmentStartAt:'2026-09-30T21:00:00Z'}}});
 await wrapper.get('input[value=caregiver]').setValue();await wrapper.get('.actions .primary').trigger('click');await flushPromises();
 expect(wrapper.find('form').exists()).toBe(true);expect(wrapper.emitted('checked-in')).toBeUndefined();expect(wrapper.text()).toContain('optional');
 await wrapper.get('form select').setValue('yes');await wrapper.get('form').trigger('submit');await wrapper.findAll('form button').find(b=>b.text()==='Skip this questionnaire').trigger('click');await flushPromises();
 expect(api.post.mock.calls[1][1]).toMatchObject({answers:{connection:{heard:'yes'}},skippedFormIds:['progress']});expect(wrapper.emitted('checked-in')).toHaveLength(1);
});
it('can skip both questionnaires without entering any answers',async()=>{
 api.post.mockResolvedValueOnce({data:{ok:true,notification:{inApp:true},submission:{forms}}}).mockResolvedValueOnce({data:{ok:true}});
 wrapper=mount(Flow,{props:{provider:{id:7},locationId:1,directSlot:{eventId:9,startAt:'2026-09-30 15:00:00'}}});await wrapper.get('input[value=adult_self]').setValue();await wrapper.get('.actions .primary').trigger('click');await flushPromises();
 await wrapper.findAll('form button').find(b=>b.text()==='Skip questionnaires & finish').trigger('click');await flushPromises();expect(api.post.mock.calls[1][1]).toMatchObject({answers:{},skippedFormIds:['connection','progress']});expect(wrapper.emitted('checked-in')).toHaveLength(1);
});
it('groups dates, preserves respondent labels, and bulk-attaches only selected visits',async()=>{
 const rows=[1,2].map(id=>({id,agency_id:2,scheduled_start_at:`2026-09-${id===1?'22':'29'}T22:00:00Z`,location_name:'Windchime',timezone:'America/Denver',series:{key:'series',label:'Tuesday · 4:00 PM'},forms_json:{respondentType:id===1?'caregiver':'adult_self',forms},client_id:null}));
 api.get.mockImplementation(async url=>({data:url.endsWith('/clients')?{clients:[{id:9,full_name:'Synthetic Client'}]}:url.endsWith('/sessions')?{sessions:[]}:{submissions:rows}}));api.patch.mockResolvedValue({data:{ok:true}});
 wrapper=mount(Inbox,{props:{createClientTo:'/onboarding'},global:{stubs:{RouterLink:true}}});await flushPromises();expect(wrapper.findAll('article')).toHaveLength(1);await wrapper.get('.visit').trigger('click');expect(wrapper.text()).toContain('Dependent / caregiver response');
 await wrapper.findAll('button').find(b=>b.text()==='Select unattached visits').trigger('click');await wrapper.get('.attachment input').setValue('Synthetic');await vi.advanceTimersByTimeAsync(300);await flushPromises();await wrapper.get('select[aria-label="Client to attach"]').setValue(9);await flushPromises();
 await wrapper.findAll('button').find(b=>b.text()==='Attach selected visits to client').trigger('click');await flushPromises();expect(api.patch).toHaveBeenCalledWith('/kiosk/client-checkins/series-attachment',{ids:[1,2],clientId:9});
});

it('offers tappable scores, advances after the third answer, and keeps answers editable before finishing',async()=>{
 const {default:VisitForms}=await import('../KioskVisitForms.vue');
 const {officeFeedbackForms}=await import('../../../../../backend/src/services/officeFeedbackForms.js');
 const items=officeFeedbackForms('caregiver');wrapper=mount(VisitForms,{props:{forms:items}});
 expect(wrapper.find('select').exists()).toBe(false);expect(wrapper.findAll('.rating button')).toHaveLength(33);
 for(let i=0;i<3;i++)await wrapper.findAll('.rating')[i].findAll('button')[8].trigger('click');
 expect(wrapper.text()).toContain('Questionnaire 2 of 2');expect(wrapper.emitted('submit')).toBeUndefined();
 await wrapper.findAll('button').find(b=>b.text()==='Back').trigger('click');
 expect(wrapper.findAll('.rating button[aria-pressed=true]').map(b=>b.text())).toEqual(['8','8','8']);
 await wrapper.findAll('.rating')[0].findAll('button')[9].trigger('click');expect(wrapper.text()).toContain('Questionnaire 1 of 2');
 await wrapper.get('form').trigger('submit');
 for(let i=0;i<3;i++)await wrapper.findAll('.rating')[i].findAll('button')[6].trigger('click');
 expect(wrapper.text()).toContain('Review your feedback');expect(wrapper.emitted('submit')).toBeUndefined();
 await wrapper.get('form').trigger('submit');expect(wrapper.emitted('submit')[0][0].answers[items[0].id].heard).toBe('9');
});
