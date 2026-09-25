import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import Panel from '../EligibilityAutomationPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
const data=()=>({policy:null,clients:[{id:101,initials:'AA',eligible:1,primary_insurer_name:'Synthetic payer'}],nextAfter:null,totals:{enrolled:0},usage:[],recent:[],offices:[{id:8,name:'Office',practice_npi:'1306688650'}],accountLimit:null,workerEnabled:false,connectionReady:false});
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:data()});api.put.mockResolvedValue({data:{revision:1}});});
describe('eligibility automation panel',()=>{
 it('shows deployment and account gates without implying live verification',async()=>{const w=mount(Panel,{props:{agencyId:1}});await flushPromises();expect(w.text()).toContain('Deployment activation required');expect(w.text()).toContain('Not configured');expect(w.text()).toContain('Paused');expect(api.put).not.toHaveBeenCalled();w.unmount();});
 it('binds enrollment to selected clients and the current billing agency',async()=>{const w=mount(Panel,{props:{agencyId:1}});await flushPromises();await w.find('[aria-label="Select client 101"]').setValue(true);await w.findAll('select')[1].setValue('8');await w.findAll('button').find(b=>b.text().startsWith('Enroll selected')).trigger('click');await flushPromises();expect(api.put).toHaveBeenCalledWith('/medical-billing/eligibility-automation/clients',{agencyId:1,clientIds:[101],officeId:8,enabled:true});w.unmount();});
 it('drops stale results and clears financial information when scope access fails',async()=>{let resolveOld;api.get.mockImplementationOnce(()=>new Promise(r=>{resolveOld=r;}));const w=mount(Panel,{props:{agencyId:1}});api.get.mockRejectedValue({response:{data:{error:{message:'Access denied'}}}});await w.setProps({agencyId:2});await flushPromises();resolveOld({data:data()});await flushPromises();expect(w.text()).toContain('Access denied');expect(w.text()).not.toContain('Synthetic payer');expect(w.find('table').exists()).toBe(false);w.unmount();});
});
