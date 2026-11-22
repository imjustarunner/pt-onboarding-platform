import{afterEach,beforeEach,it,expect,vi}from'vitest';import{shallowMount,flushPromises}from'@vue/test-utils';import{createPinia}from'pinia';import Panel from'../ClientDetailPanel.vue';
const m=vi.hoisted(()=>({get:vi.fn(),push:vi.fn(),route:{params:{organizationSlug:'auricwell-qa-demo'},query:{},path:'/auricwell-qa-demo/admin/clients'}}));vi.mock('../../../services/api',()=>({default:{get:m.get,put:vi.fn(),post:vi.fn().mockResolvedValue({data:{}}),defaults:{baseURL:'/api'}}}));vi.mock('vue-router',()=>({onBeforeRouteLeave:vi.fn(),useRoute:()=>m.route,useRouter:()=>({push:m.push,replace:vi.fn()})}));let w;
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();localStorage.setItem('user',JSON.stringify({id:1434,role:'support'}));m.get.mockResolvedValue({data:[]});m.push.mockResolvedValue();window.alert=vi.fn();Element.prototype.scrollIntoView=vi.fn();});afterEach(()=>w?.unmount());
async function open(client={id:2542,agency_id:450,client_type:'school',status:'PACKET'}){w=shallowMount(Panel,{props:{client,agencyId:450},global:{plugins:[createPinia()],stubs:{ClientChartShell:{template:'<div><slot/></div>'}}}});await flushPromises();w.vm.myAgencies=[{id:450}];await flushPromises();}
it('turns the actual Overview secure action into an exact-client secure composer route',async()=>{await open();const overview=w.findComponent({name:'ClientOverviewHub'});expect(overview.props('canSendSecureMessage')).toBe(true);overview.vm.$emit('secure-message');await flushPromises();expect(m.push).toHaveBeenCalledWith({path:'/auricwell-qa-demo/messages',query:{view:'hub',channel:'secure',secureRecipient:'client',secureClientId:'2542',agencyId:'450'}});});
it('does not retain the earlier client ID when the chart changes',async()=>{await open();await w.setProps({client:{id:2543,agency_id:450,client_type:'school',status:'PACKET'}});await flushPromises();w.vm.myAgencies=[{id:450}];await flushPromises();await w.vm.openClientSecureMessage();expect(m.push.mock.calls.at(-1)[0].query.secureClientId).toBe('2543');});
it('blocks a school staff role from opening family secure compose via the chart action',async()=>{localStorage.setItem('user',JSON.stringify({id:1465,role:'school_staff'}));await open();await w.vm.openClientSecureMessage();expect(w.vm.canOpenClientSecureMessage).toBe(false);expect(m.push).not.toHaveBeenCalled();});
it('blocks an unrelated agency from the chart action',async()=>{await open();w.vm.myAgencies=[{id:999}];await flushPromises();await w.vm.openClientSecureMessage();expect(m.push).not.toHaveBeenCalled();});

it('opens Email client with the verified client contact and chart filing selected', async () => {
  await open({id:2542,agency_id:450,client_type:'clinical',status:'ACTIVE',email:'client@example.test'});
  m.get.mockResolvedValueOnce({data:{person:{personKey:'client:2542@450',clientId:2542,agencyId:450,email:'client@example.test'}}});
  const compose = vi.fn(event => event.preventDefault());
  window.addEventListener('open-email-composer', compose, {once:true});
  try {
    await w.vm.onProfileQuickAction({id:'email-client'});
    expect(m.get).toHaveBeenCalledWith('/messages/hub/people/client%3A2542%40450',expect.objectContaining({params:{agencyId:450}}));
    expect(compose.mock.calls[0][0].detail).toMatchObject({mode:'new',clientId:2542,agencyId:450,to:'client@example.test'});
  } finally {
    window.removeEventListener('open-email-composer',compose);
  }
});
