import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach} from 'vitest';
import ClientExchangeAuditPanel from '../ClientExchangeAuditPanel.vue';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));vi.mock('../../../services/api',()=>({default:mocks}));
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

const auditFixture = () => ({canReview:true,providers:[
  {userId:7,name:'Provider One',matched:false,canRequest:true,status:'not_match',checks:[{field:'age',label:'Client age',status:'fail',reason:'Client age: 8. Provider age ranges: Adults.',canWaive:true,fingerprint:'age-current'},{field:'insurance',status:'pass',reason:'Accepted',canWaive:false}],views:0},
  {userId:8,name:'Provider Two',matched:true,canRequest:true,status:'match',checks:[{field:'age',label:'Client age',status:'pass',reason:'Age supported'},{field:'insurance',status:'pass',reason:'Accepted'}],views:0}
]});
it('shows per-parameter counts with the names of every passing provider',async()=>{
  mocks.get.mockResolvedValue({data:auditFixture()});const wrapper=mount(ClientExchangeAuditPanel,{props:{listingId:9}});await flushPromises();
  const count=wrapper.find('button[aria-label="Client age: 1 pass"]');expect(count.exists()).toBe(true);await count.trigger('click');
  expect(count.element.parentElement.textContent).toContain('Provider Two');expect(count.element.parentElement.textContent).not.toContain('Provider One');
  const insurance=wrapper.find('button[aria-label="Insurance acceptance: 2 pass"]');await insurance.trigger('click');
  expect(insurance.element.parentElement.textContent).toContain('Provider One');expect(insurance.element.parentElement.textContent).toContain('Provider Two');
});
it('saves a scoped waiver with a required reason and refreshes the audit',async()=>{
  mocks.get.mockResolvedValue({data:auditFixture()});mocks.post.mockResolvedValue({data:{saved:true}});
  const wrapper=mount(ClientExchangeAuditPanel,{props:{listingId:9}});await flushPromises();
  await wrapper.findAll('button').find(b=>b.text()==='Waive this failure').trigger('click');
  const save=wrapper.findAll('button').find(b=>b.text()==='Save waiver');expect(save.attributes('disabled')).toBeDefined();
  await wrapper.find('textarea').setValue('Support confirmed age coverage');await wrapper.find('form').trigger('submit');await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/client-exchange/listings/9/waivers',{providerUserId:7,field:'age',fingerprint:'age-current',reason:'Support confirmed age coverage'});
  expect(wrapper.emitted('changed')).toHaveLength(1);
});
it('previews the signed email and sends only after the staff member selects Send',async()=>{
  mocks.get.mockResolvedValue({data:auditFixture()});mocks.post.mockResolvedValueOnce({data:{providerUserId:7,to:'provider@example.test',subject:'Shared client',text:'Your support team has shared a client.\nStaff Signature',previousShareCount:0}}).mockResolvedValueOnce({data:{share:{status:'sent'}}});
  const wrapper=mount(ClientExchangeAuditPanel,{props:{listingId:9}});await flushPromises();
  await wrapper.findAll('button').find(b=>b.text()==='Share with provider').trigger('click');await flushPromises();
  expect(mocks.post).toHaveBeenCalledTimes(1);expect(mocks.post.mock.calls[0][0]).toContain('/shares/preview');
  expect(wrapper.find('pre').text()).toContain('Staff Signature');expect(wrapper.emitted('changed')).toBeUndefined();
  await wrapper.findAll('button').find(b=>b.text()==='Send email with my signature').trigger('click');await flushPromises();
  expect(mocks.post).toHaveBeenLastCalledWith('/client-exchange/listings/9/shares',expect.objectContaining({providerUserId:7,expectedShareCount:0,requestKey:expect.any(String)}));
  expect(wrapper.find('[role="status"]').text()).toContain('accepted the message');
});
