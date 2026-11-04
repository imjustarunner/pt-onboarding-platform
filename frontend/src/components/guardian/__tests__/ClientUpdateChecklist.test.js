import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Checklist from '../ClientUpdateChecklist.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../GuardianClientDetails.vue',()=>({default:{template:'<div>Current client information</div>'}}));
vi.mock('../FamilyNotificationChoices.vue',()=>({default:{name:'ScopedPreferences',props:{agencyId:[Number,String],clientId:[Number,String],profiles:{type:Array,default:()=>[]}},template:'<div>Preferences {{agencyId}}:{{clientId}}:{{profiles.length}}</div>'}}));
vi.mock('../GuardianPlanProgressPanel.vue',()=>({default:{template:'<div>Plan</div>'}}));
vi.mock('../GuardianPaymentInsuranceTab.vue',()=>({default:{template:'<div>Billing</div>'}}));
vi.mock('../../billing/InsuranceCardTasks.vue',()=>({default:{template:'<div>Insurance</div>'}}));
let wrapper;
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{assigned:true,items:[{id:10,type:'information',title:'Review current information',detail:'Check your information.'}]}});});
afterEach(()=>wrapper?.unmount());
it('shows the held state without presenting selected documents or confirmation actions',async()=>{api.get.mockResolvedValue({data:{enabled:false,assigned:false,items:[]}});wrapper=mount(Checklist,{props:{agencyId:2,clientId:5}});await flushPromises();expect(wrapper.text()).toContain('not currently available');expect(wrapper.find('button').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();});
it('clears previous profile items while a newly selected profile is loading',async()=>{wrapper=mount(Checklist,{props:{agencyId:2,clientId:5}});await flushPromises();expect(wrapper.text()).toContain('Review current information');let finish;api.get.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await wrapper.setProps({clientId:6});expect(wrapper.text()).not.toContain('Review current information');finish({data:{assigned:false,items:[]}});await flushPromises();expect(wrapper.text()).toContain('No pending selected updates');});
it('ignores a confirmation reply for the previous profile',async()=>{let finish;api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));wrapper=mount(Checklist,{props:{agencyId:2,clientId:5}});await flushPromises();await wrapper.get('input[type=checkbox]').setValue(true);await wrapper.findAll('button').find(b=>b.text()==='Save confirmation').trigger('click');api.get.mockResolvedValue({data:{assigned:false,items:[]}});await wrapper.setProps({clientId:6});await flushPromises();finish({data:{assigned:true,items:[{id:99,title:'Old profile reply'}]}});await flushPromises();expect(wrapper.text()).not.toContain('Old profile reply');expect(api.post).toHaveBeenCalledWith('/client-updates/clients/5/items/10/confirm',{agencyId:2});});

it('keeps notification choices on the selected profile instead of editing every linked child',async()=>{api.get.mockResolvedValue({data:{assigned:true,items:[{id:11,type:'notifications',title:'Review notification choices'}]}});wrapper=mount(Checklist,{props:{agencyId:2,clientId:5,profiles:[{client_id:5,agency_id:2},{client_id:6,agency_id:2}]}});await flushPromises();expect(wrapper.text()).toContain('Preferences 2:5:0');});
