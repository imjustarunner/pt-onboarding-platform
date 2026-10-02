import {describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import PostListingModal from '../PostListingModal.vue';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:mock}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:10}})}));
describe('internal referral choices',()=>{
 it.each(['exchange','provider'])('sends family services to %s with the additional-services purpose',async destination=>{
  mock.get.mockResolvedValue({data:{summary:{},providers:[{id:12,first_name:'Sam',last_name:'Therapist'}]}});mock.post.mockResolvedValue({data:{}});
  const w=mount(PostListingModal,{props:{agencyId:2,lockClient:true,presetClientId:3}});await flushPromises();
  await w.findAll('select')[0].setValue('additional_service');await w.findAll('select')[1].setValue('family');await w.findAll('select')[2].setValue(destination);
  if(destination==='provider')await w.findAll('select')[3].setValue('12');
  expect(w.text()).toContain('The current therapist stays assigned');
  await w.findAll('button').find(b=>b.text()==='Send referral').trigger('click');await flushPromises();
  expect(mock.post).toHaveBeenLastCalledWith('/client-exchange/listings',expect.objectContaining({referralKind:'additional_service',serviceType:'family',targetProviderUserId:destination==='provider'?12:null,clientId:3}));
  expect(w.emitted('posted')).toHaveLength(1);w.unmount();
 });
});
