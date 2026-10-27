import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach} from 'vitest';
import ClientExchangeAuditPanel from '../ClientExchangeAuditPanel.vue';
const mocks=vi.hoisted(()=>({get:vi.fn()}));vi.mock('../../../services/api',()=>({default:mocks}));
beforeEach(()=>vi.clearAllMocks());
it('distinguishes match, delivery, and tracked views with historical limits',async()=>{
  mocks.get.mockResolvedValue({data:{matchesEvaluatedAt:'2026-10-27T10:00:00Z',views:{total:3,unique_viewers:2},run:{evaluated_at:'2026-10-22T12:00:00Z'},providers:[{userId:7,name:'Provider One',matched:true,checks:[{field:'age',status:'pass',reason:'Age supported'}],emailDelivery:{status:'skipped',reason:'Opted out'},smsDelivery:{status:'sent'},views:2},{userId:8,name:'Provider Two',matched:false,checks:[{field:'format',status:'fail',reason:'Intake closed'}],views:0}]}});
  const wrapper=mount(ClientExchangeAuditPanel,{props:{listingId:9}});await flushPromises();
  expect(wrapper.text()).toContain('1 currently matched');expect(wrapper.text()).toContain('Opted out');expect(wrapper.text()).toContain('Intake closed');expect(wrapper.text()).toContain('Earlier views were not tracked');
});
it('discards a stale audit when the selected client changes',async()=>{
  let resolveOld;mocks.get.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValueOnce({data:{providers:[],views:{total:2}}});
  const wrapper=mount(ClientExchangeAuditPanel,{props:{listingId:9}});await wrapper.setProps({listingId:10});await flushPromises();resolveOld({data:{providers:[{userId:7,name:'Wrong Client Provider',checks:[]}]}});await flushPromises();expect(wrapper.text()).not.toContain('Wrong Client Provider');
});
