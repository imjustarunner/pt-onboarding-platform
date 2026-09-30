import {it,expect,vi,beforeEach,afterEach} from 'vitest';import {reactive} from 'vue';import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({route:null}));vi.mock('vue-router',()=>({useRoute:()=>m.route}));vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
import api from '../../../services/api';import View from '../../../views/provider/OfficeCheckinResponsesView.vue';
let wrapper;beforeEach(()=>{vi.resetAllMocks();m.route=reactive({params:{submissionId:'30'}});});afterEach(()=>wrapper?.unmount());
const visit={id:30,scheduledStartAt:'2026-09-30T22:00:00Z',completedAt:'done',location:'Synthetic Office',timezone:'America/Denver',respondentType:'caregiver',serviceType:'counseling',score:{connection:8,progress:null},forms:[{id:'connection',title:'Connection',fields:[{id:'heard',label:'I feel heard',options:[{value:'8',label:'8'}]}]},{id:'progress',title:'Progress',fields:[]}],answers:{connection:{heard:'8'}},skippedFormIds:['progress']};
it('opens the exact linked receipt with answers, respondent and skipped status',async()=>{
 api.get.mockResolvedValue({data:{visit}});wrapper=mount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();expect(api.get).toHaveBeenCalledWith('/kiosk/client-checkins/30/responses',{skipGlobalLoading:true});expect(wrapper.text()).toContain('Guardian / dependent report');expect(wrapper.text()).toContain('Skipped by respondent');expect(wrapper.text()).toContain('8.0');expect(wrapper.text()).toContain('I feel heard');
});
it('does not retain a previous visit when an unauthorized link is opened',async()=>{
 api.get.mockResolvedValueOnce({data:{visit}}).mockRejectedValueOnce(new Error('Not owner'));wrapper=mount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();m.route.params.submissionId='31';await flushPromises();expect(wrapper.find('[role=alert]').exists()).toBe(true);expect(wrapper.text()).not.toContain('I feel heard');expect(wrapper.text()).not.toContain('Synthetic Office');
});
