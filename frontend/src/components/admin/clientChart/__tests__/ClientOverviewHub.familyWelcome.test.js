import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createPinia,setActivePinia} from 'pinia';
import {useAuthStore} from '../../../../store/auth';
import {useAgencyStore} from '../../../../store/agency';
import api from '../../../../services/api';
import Hub from '../ClientOverviewHub.vue';
vi.mock('../../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
let wrapper,pinia,auth;
const workflow={id:64831,clientId:2561,status:'waiting_parent',initialSentAt:'2026-11-13T13:07:55Z',conversationId:6094,steps:[{id:1,step_key:'initial_email',status:'sent',conversation_id:6094}]};
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();pinia=createPinia();setActivePinia(pinia);auth=useAuthStore();auth.user={id:1433,role:'provider'};useAgencyStore().currentAgency={id:450,slug:'auricwell-qa-demo'};api.get.mockImplementation(async url=>({data:url==='/school-contact-plan'?{eligible:true}:url==='/school-contact-plan/workflows'?[{...workflow}]:{}}));api.post.mockResolvedValue({data:{stopped:true}});});
afterEach(()=>wrapper?.unmount());
function open(){wrapper=mount(Hub,{props:{clientId:2561,client:{id:2561,agency_id:450},canViewMedicalRecord:false},global:{plugins:[pinia],stubs:{ClientCareTimeline:true,RouterLink:{props:['to'],template:'<a :data-to="JSON.stringify(to)"><slot/></a>'}}}});return wrapper;}
it('exposes the real provider welcome workflow and outside-reply stop action in full chart Overview without clinical access',async()=>{
 open();await flushPromises();expect(wrapper.text()).toContain('Family contact plan');const stop=wrapper.findAll('button').find(b=>b.text()==='Record parent reply · Stop follow-ups');expect(stop).toBeDefined();expect(api.get).toHaveBeenCalledWith('/school-contact-plan/workflows',expect.objectContaining({params:{agencyId:450,clientId:2561}}));expect(JSON.parse(wrapper.find('.school-contact-workflow-actions a').attributes('data-to'))).toEqual({path:'/auricwell-qa-demo/messages',query:{conversationId:6094}});
 await stop.trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/school-contact-plan/workflows/64831/parent-replied',{},expect.objectContaining({params:{agencyId:450}}));expect(wrapper.text()).toContain('Automated follow-ups to this family have stopped.');expect(wrapper.findAll('button').some(b=>b.text().includes('Record parent reply'))).toBe(false);
});
it.each(['school_staff','support','admin'])('does not load provider-owned workflows for plain %s',async role=>{auth.user={id:1465,role};open();await flushPromises();expect(api.get.mock.calls.some(([url])=>url.startsWith('/school-contact-plan'))).toBe(false);expect(wrapper.text()).not.toContain('Family contact plan');});
it('honors a server-declined cohort instead of bypassing eligibility from the actor role',async()=>{api.get.mockImplementation(async url=>({data:url==='/school-contact-plan'?{eligible:false}:{}}));open();await flushPromises();expect(api.get.mock.calls.some(([url])=>url==='/school-contact-plan/workflows')).toBe(false);expect(wrapper.text()).not.toContain('Family contact plan');});
