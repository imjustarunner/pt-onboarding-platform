import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import Entry from '../../../views/FundThredEntryView.vue';
import LeadForm from '../FundThredLeadForm.vue';
import Website from '../../../views/public/FundThredWebsite.vue';
import api from '../../../services/api';
const state=vi.hoisted(()=>({auth:null,route:null}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>state.auth}));
vi.mock('vue-router',()=>({useRoute:()=>state.route}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const global={stubs:{RouterLink:{props:['to'],template:'<a :href="typeof to===\'string\'?to:to.path"><slot/></a>'}}};
let wrapper;
beforeEach(()=>{vi.clearAllMocks();state.auth=reactive({isAuthenticated:false,user:null});state.route=reactive({params:{},query:{plan:'growth',interval:'annual',bundle:'plotline,conversa,invalid'}});document.head.innerHTML='<title>PlotTwistHQ</title><meta name="description" content="Original description"><link rel="icon" href="/original.svg">';});
afterEach(()=>{wrapper?.unmount();wrapper=null;vi.unstubAllGlobals();});
describe('FundThred product journeys',()=>{
  it('keeps the new page identity when an outgoing page unmounts after it',()=>{
    wrapper=mount(Entry,{global});const incoming=mount(Entry,{global});wrapper.unmount();wrapper=incoming;
    expect(document.title).toBe('Your organizations | FundThred');expect(document.querySelector('link[rel=icon]').getAttribute('href')).toContain('fundthred');
    wrapper.unmount();wrapper=null;expect(document.title).toBe('PlotTwistHQ');expect(document.querySelector('link[rel=icon]').getAttribute('href')).toBe('/original.svg');
  });
  it('does not request finance data before signing in',async()=>{
    wrapper=mount(Entry,{global});await flushPromises();expect(api.get).not.toHaveBeenCalled();expect(wrapper.text()).toContain('Sign in to FundThred');
  });
  it('shows only returned organizations and clears records if access is revoked',async()=>{
    state.auth.isAuthenticated=true;state.auth.user={id:1,role:'admin'};
    api.get.mockResolvedValue({data:{organizations:[{agency_id:6,slug:'mh4kidz',name:'MH4Kidz',role:'manager'}]}});
    wrapper=mount(Entry,{global});await flushPromises();expect(wrapper.find('a[href="/mh4kidz/finance-operations"]').exists()).toBe(true);
    api.get.mockRejectedValue({response:{data:{error:{message:'Access revoked'}}}});state.auth.user={id:2};await flushPromises();expect(wrapper.text()).not.toContain('MH4Kidz');expect(wrapper.text()).toContain('Access revoked');
  });
  it('discards an old account response after sign out',async()=>{
    state.auth.isAuthenticated=true;state.auth.user={id:1};let resolve;
    api.get.mockReturnValue(new Promise(r=>resolve=r));wrapper=mount(Entry,{global});state.auth.isAuthenticated=false;state.auth.user=null;await flushPromises();resolve({data:{organizations:[{name:'Private organization'}]}});await flushPromises();expect(wrapper.text()).not.toContain('Private organization');
  });
  it('preserves the idempotency key on retry and sends only supported bundles',async()=>{
    const fetch=vi.fn().mockRejectedValueOnce(new TypeError('Offline')).mockResolvedValueOnce({ok:true,json:async()=>({id:'request-123'})});vi.stubGlobal('fetch',fetch);
    wrapper=mount(LeadForm,{global});await wrapper.find('form').trigger('submit');await flushPromises();expect(wrapper.find('[role=alert]').text()).toContain('not been confirmed');expect(wrapper.find('[role=status]').exists()).toBe(false);
    await wrapper.find('form').trigger('submit');await flushPromises();
    expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetch.mock.calls[1][1].headers['Idempotency-Key']);
    const payload=JSON.parse(fetch.mock.calls[1][1].body);expect(payload.goals).toContain('growth · annual · Bundle: plotline, conversa');expect(payload.services).toEqual(['operations','people']);expect(payload.goals).not.toContain('invalid');expect(wrapper.find('[role=status]').text()).toContain('request-123');
  });
  it('updates public metadata between pages and restores the previous brand on exit',async()=>{
    wrapper=mount(Website,{global});expect(document.title).toContain('FundThred');expect(document.querySelector('link[rel=icon]').getAttribute('href')).toContain('fundthred');
    state.route.params.section='pricing';await flushPromises();expect(document.querySelector('link[rel=canonical]').href).toBe('https://plottwisthq.com/fundthred/pricing');
    wrapper.unmount();wrapper=null;expect(document.querySelector('meta[name=description]').content).toBe('Original description');expect(document.querySelector('link[rel=icon]').getAttribute('href')).toBe('/original.svg');expect(document.querySelector('link[rel=canonical]')).toBeNull();
  });
});
