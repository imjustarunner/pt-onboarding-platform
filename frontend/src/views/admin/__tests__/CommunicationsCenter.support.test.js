import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { shallowMount,flushPromises } from '@vue/test-utils';
import Center from '../CommunicationsCenterView.vue';
const mocks=vi.hoisted(()=>({push:vi.fn(),replace:vi.fn(async()=>{}),get:vi.fn()}));
vi.mock('vue-router',()=>({useRoute:()=>({path:'/admin/communications',params:{},query:{mode:'support'}}),useRouter:()=>({push:mocks.push,replace:mocks.replace})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:7,role:'admin'}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2,name:'ITSCO'},userAgencies:[{id:2}]})}));
vi.mock('../../../store/sessionLock',()=>({useSessionLockStore:()=>({})}));
vi.mock('../../../services/api',()=>({default:{get:mocks.get}}));
vi.mock('../../../services/startupRequests',()=>({getStartupData:async()=>({data:{kpis:{openTickets:2},tickets:{open:2,recent:[{id:745,subject:'Packet upload',status:'open',priority:'medium'}]}}})}));
let wrapper;
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();mocks.get.mockResolvedValue({data:{}});});
afterEach(()=>wrapper?.unmount());
async function render(){wrapper=shallowMount(Center,{global:{stubs:{RouterLink:true}}});await flushPromises();}
it('prioritizes tickets, keeps review collapsed, opens tickets in place, and makes the KPI actionable',async()=>{
 await render();
 expect(wrapper.findAll('.cc-grid-main h3')[0].text()).toBe('Support tickets');
 expect(wrapper.find('communication-review-queue-stub').exists()).toBe(false);
 await wrapper.findAll('.cc-kpi')[0].trigger('click');await flushPromises();
 expect(wrapper.findComponent({name:'TicketDeskView'}).props()).toMatchObject({initialStatus:'open',syncRoute:false,agencyId:2});
 await wrapper.get('.cc-ticket-summary').trigger('click');await flushPromises();
 expect(wrapper.findComponent({name:'TicketDetailModal'}).props()).toMatchObject({ticketId:745,agencyId:2});
 expect(mocks.push).not.toHaveBeenCalled();
});
it('moves and remembers panels without changing ticket data',async()=>{
 await render();await wrapper.get('[aria-label="Move tickets later"]').trigger('click');
 expect(wrapper.findAll('.cc-grid-main h3')[0].text()).toBe('Escalations');
 expect(JSON.parse(localStorage.getItem('conversa-support-panels'))).toEqual(['escalations','tickets','activity']);
});
