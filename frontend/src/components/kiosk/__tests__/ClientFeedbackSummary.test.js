import {it,expect,vi,afterEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {defineComponent,toRef} from 'vue';
import Summary from '../ClientFeedbackSummary.vue';
import Caseload from '../CaseloadFeedbackSummary.vue';
import {useClientFeedbackSummaries} from '../../../composables/useClientFeedbackSummaries.js';
vi.mock('../../../services/api',()=>({default:{post:vi.fn()}}));
import api from '../../../services/api';
let wrapper;afterEach(()=>{wrapper?.unmount();vi.resetAllMocks();});
const metric=(current,change)=>({current,average:current,count:3,sixWeekAverage:current,sixWeekCount:2,change,currentAt:'2026-09-30T15:00:00Z',fromAt:'2026-09-01T15:00:00Z',toAt:'2026-09-30T15:00:00Z'});
const group=(id,current,change)=>({key:String(id),clientId:id,providerId:7,providerName:'Synthetic Provider',serviceType:'counseling',respondentType:'adult_self',metrics:{connection:metric(current,change),progress:metric(5,-3)}});
it('shows scores and signed change without confusing unavailable history with zero',()=>{
 wrapper=mount(Summary,{props:{summaries:[group(1,10,2),{...group(2,0,0),respondentType:'caregiver'},group(3,null,null)]}});
 expect(wrapper.text()).toContain('10.0/10');expect(wrapper.text()).toContain('+2');expect(wrapper.text()).toContain('-3');expect(wrapper.text()).toContain('6w change 0');expect(wrapper.text()).toContain('Not enough history');expect(wrapper.text()).toContain('Dependent / caregiver');
});
it('weights each client equally and excludes missing deltas in caseload averages',()=>{
 wrapper=mount(Caseload,{props:{byClient:{1:[group(1,10,2)],2:[group(2,6,null)]}}});expect(wrapper.text()).toContain('Current 8.0/10');expect(wrapper.text()).toContain('6w change +2');expect(wrapper.text()).toContain('2 scored clients; 1 with change');
});
it('clears scores on profile changes and ignores a previous profile response',async()=>{
 let old;api.post.mockImplementationOnce(()=>new Promise(resolve=>old=resolve)).mockResolvedValueOnce({data:{summaries:[group(2,9,2)]}});
 const Harness=defineComponent({props:['clients','providerId'],setup(props){return useClientFeedbackSummaries(toRef(props,'clients'),toRef(props,'providerId'));},template:'<div>{{JSON.stringify(byClient)}}</div>'});
 wrapper=mount(Harness,{props:{clients:[{id:1}],providerId:7}});await wrapper.setProps({clients:[{id:2}],providerId:8});await flushPromises();old({data:{summaries:[group(1,2,-3)]}});await flushPromises();expect(wrapper.vm.byClient[1]).toBeUndefined();expect(wrapper.vm.byClient[2][0].metrics.connection.current).toBe(9);expect(api.post.mock.calls[1][1]).toEqual({clientIds:[2],providerId:8});
});

it('shows a checked-in appointment and disables another arrival while retaining day information',async()=>{
 const {default:Card}=await import('../KioskProviderCard.vue');wrapper=mount(Card,{props:{provider:{id:7,firstName:'Synthetic',currentSlot:{startAt:'2026-09-30 08:00:00',checkedIn:true}},mode:'current'}});
 expect(wrapper.get('.choose').attributes('disabled')).toBeDefined();expect(wrapper.get('.choose').text()).toContain('Checked in');await wrapper.get('.choose').trigger('click');expect(wrapper.emitted('select')).toBeUndefined();await wrapper.setProps({mode:'today'});expect(wrapper.get('.choose').attributes('disabled')).toBeUndefined();expect(wrapper.get('.choose').text()).toContain('More info');
});
