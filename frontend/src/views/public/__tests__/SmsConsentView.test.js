import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const state=vi.hoisted(()=>({route:{},get:vi.fn(),post:vi.fn()}));
vi.mock('vue-router',()=>({useRoute:()=>state.route}));
vi.mock('../../../services/api',()=>({default:{get:state.get,post:state.post}}));
import View from '../SmsConsentView.vue';
beforeEach(()=>{vi.clearAllMocks();state.route={params:{},query:{},meta:{smsConsentExample:true},hash:''};state.get.mockResolvedValue({data:{example:true,disclosure:{brandName:'Next Level Up',purposes:[]}}});});
describe('brand-specific reviewer consent page',()=>{
 it.each(['nlu','tisi','itsco','auricwell'])('loads %s instead of hardcoding ITSCO',async(slug)=>{
  state.route.params.brandSlug=slug;state.route.query={program:'operations',audience:'staff'};
  const w=mount(View,{global:{stubs:{SmsConsentForm:true}}});await flushPromises();
  expect(state.get).toHaveBeenCalledWith(`/sms-numbers/consent-example/${slug}`,expect.objectContaining({params:{program:'operations',audience:'staff',billing:undefined},skipAuthRedirect:true}));
  expect(state.post).not.toHaveBeenCalled();w.unmount();
 });
 it('shows a failed public example rather than a wrong brand or a silent login redirect',async()=>{
  state.route.params.brandSlug='unknown';state.get.mockRejectedValue({response:{data:{error:{message:'Unknown messaging brand'}}}});
  const w=mount(View);await flushPromises();expect(w.get('[role=alert]').text()).toBe('Unknown messaging brand');w.unmount();
 });
});
