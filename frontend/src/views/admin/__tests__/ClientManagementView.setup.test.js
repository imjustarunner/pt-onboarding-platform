import { expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as Vue from 'vue';
import { parse, compileScript, babelParse, walkIdentifiers } from '@vue/compiler-sfc';

it('binds every Vue runtime helper used by Client Management setup', () => {
  const source = fs.readFileSync(fileURLToPath(import.meta.url).replace(/__tests__\/[^/]+$/, 'ClientManagementView.vue'), 'utf8');
  const { descriptor } = parse(source);
  const compiled = compileScript(descriptor, { id: 'client-management-setup' });
  const ast = babelParse(descriptor.scriptSetup.content, { sourceType: 'module' });
  const missing = new Set();
  const known = Object.fromEntries(Object.keys(compiled.bindings).map(name => [name, 1]));
  walkIdentifiers(ast, node => {
    if (typeof Vue[node.name] === 'function') missing.add(node.name);
  }, false, [], known);
  expect([...missing]).toEqual([]);
});

const apiMock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),delete:vi.fn()}));
vi.mock('../../../services/api',()=>({default:apiMock}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:10,role:'support'},isAuthenticated:true})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'synthetic'},query:{},path:'/synthetic/admin/clients',meta:{}}),useRouter:()=>({push:vi.fn(),replace:vi.fn(),hasRoute:()=>false})}));
import ClientManagement from '../ClientManagementView.vue';
import { useAgencyStore } from '../../../store/agency';
it('mounts and loads the client dashboard without runtime setup errors',async()=>{
 localStorage.clear();sessionStorage.clear();apiMock.get.mockImplementation(async url=>({data:String(url).startsWith('/clients?')?{items:[],total:0}:url==='/agencies/2'?{id:2,name:'Synthetic agency',portal_url:'synthetic',organization_type:'agency'}:[]}));
 const pinia=createPinia();setActivePinia(pinia);const agency=useAgencyStore(pinia);agency.userAgencies=[{id:2,name:'Synthetic agency',portal_url:'synthetic',organization_type:'agency'}];agency.agencies=agency.userAgencies;agency.currentAgency=agency.userAgencies[0];
 const wrapper=shallowMount(ClientManagement,{global:{plugins:[pinia],stubs:{RouterLink:true}}});
 try{await flushPromises();expect(wrapper.get('h1').text()).toBe('Client Management');expect(wrapper.find('.client-mgmt-page').exists()).toBe(true);expect(apiMock.get.mock.calls.some(([url])=>String(url).startsWith('/clients?'))).toBe(true);}finally{wrapper.unmount();}
});

it('restores the visible client list after a longer chart visit while the refresh is pending',async()=>{
 localStorage.clear();sessionStorage.clear();let refresh;
 apiMock.get.mockImplementation(async url=>({data:String(url).startsWith('/clients?')?{items:[{id:1,agency_id:2,initials:'CACHE',full_name:'CACHE Client',status:'ACTIVE'}],total:1}:[]}));
 const pinia=createPinia();setActivePinia(pinia);const agency=useAgencyStore(pinia);agency.userAgencies=[{id:2,name:'Synthetic agency',portal_url:'synthetic',organization_type:'agency'}];agency.agencies=agency.userAgencies;agency.currentAgency=agency.userAgencies[0];
 const mountView=()=>shallowMount(ClientManagement,{global:{plugins:[pinia],stubs:{RouterLink:true}}});
 const first=mountView();await flushPromises();expect(first.text()).toContain('CACHE');first.unmount();
 const now=Date.now();const time=vi.spyOn(Date,'now').mockReturnValue(now+10*60*1000);
 apiMock.get.mockImplementation(url=>String(url).startsWith('/clients?')?new Promise(resolve=>{refresh=resolve}):Promise.resolve({data:[]}));
 const returned=mountView();try{await flushPromises();expect(returned.text()).toContain('CACHE');expect(returned.find('.loading').exists()).toBe(false);expect(refresh).toBeTypeOf('function');refresh({data:{items:[],total:0}});await flushPromises();}finally{returned.unmount();time.mockRestore();}
});

async function assignmentDirectory({assigned=false}={}) {
 localStorage.clear();sessionStorage.clear();vi.clearAllMocks();
 const client={id:71,agency_id:2,initials:'SYN',full_name:'Synthetic Client',status:'ACTIVE',client_type:'clinical'};
 const service={id:201,service_kind:'counseling',label:'Counseling',is_active:1,provider_user_id:0,organization_id:0};
 const currentClient=()=>({...client,provider_id:null,provider_name:assigned?'Michael Synthetic':null,directory_provider_id:assigned?501:null,assigned_service_id:201});
 const currentService=()=>({...service,provider_user_id:assigned?501:0,provider_name:assigned?'Michael Synthetic':null});
 apiMock.get.mockImplementation(async url=>({data:
  String(url).startsWith('/clients?')?{items:[currentClient()],total:1}:
  url==='/clients/71/service-enrollments'?{services:[currentService()],availableServiceKinds:['counseling']}:
  url==='/office-clients/providers'?{providers:[{id:501,name:'Michael Synthetic',agencyIds:[2]}]}:
  url==='/agencies/2'?{id:2,name:'Synthetic agency',portal_url:'synthetic',organization_type:'agency'}:[]}));
 apiMock.post.mockImplementation(async()=>{assigned=true;return {data:{services:[currentService()]}};});
 const pinia=createPinia();setActivePinia(pinia);const agency=useAgencyStore(pinia);
 agency.userAgencies=[{id:2,name:'Synthetic agency',portal_url:'synthetic',organization_type:'agency'}];agency.agencies=agency.userAgencies;agency.currentAgency=agency.userAgencies[0];
 const wrapper=shallowMount(ClientManagement,{global:{plugins:[pinia],stubs:{RouterLink:true,ClientQuickLook:false,ClientServiceEnrollments:false}}});
 await flushPromises();return wrapper;
}

it('assigns directly from the directory provider column and refreshes the list and side panel from the saved service',async()=>{
 const wrapper=await assignmentDirectory();
 try {
  expect(wrapper.get('.cm-provider-assign').text()).toBe('Unassigned');
  await wrapper.get('.cm-provider-assign').trigger('click');await flushPromises();
  expect(wrapper.get('[role=dialog]').text()).toContain('Synthetic agency');
  const editor=wrapper.getComponent({name:'ClientServiceEnrollments'});
  expect(editor.props()).toMatchObject({clientId:71,agencyId:2,startAssigning:true});
  editor.getComponent({name:'ProviderSearchSelect'}).vm.$emit('update:modelValue',501);await flushPromises();
  await editor.get('.service-assignment').trigger('submit');await flushPromises();
  expect(apiMock.post).toHaveBeenCalledWith('/clients/71/service-enrollments',expect.objectContaining({agencyId:2,serviceId:201,serviceKind:'counseling',providerUserId:501}));
  expect(apiMock.put).not.toHaveBeenCalled();
  expect(wrapper.get('.cm-provider-assign').text()).toBe('Michael Synthetic');
  await wrapper.get('.cm-provider-dialog-header button').trigger('click');
  await wrapper.get('.client-row').trigger('click');await flushPromises();
  expect(wrapper.get('.cm-drawer-provider').text()).toBe('Michael Synthetic');
 } finally {wrapper.unmount();}
});

it('opens the same service assignment editor directly from the side panel clinician field',async()=>{
 const wrapper=await assignmentDirectory({assigned:true});
 try {
  await wrapper.get('.client-row').trigger('click');await flushPromises();
  await wrapper.get('.cm-drawer-provider').trigger('click');await flushPromises();
  expect(wrapper.get('[role=dialog]').exists()).toBe(true);
  expect(wrapper.getComponent({name:'ClientServiceEnrollments'}).props()).toMatchObject({clientId:71,agencyId:2});
  expect(wrapper.getComponent({name:'ProviderSearchSelect'}).props('options').map(provider=>provider.id)).toEqual([501]);
 } finally {wrapper.unmount();}
});

it('refreshes a pinned side panel when a directory reload returns a changed provider',async()=>{
 const wrapper=await assignmentDirectory();
 try {
  await wrapper.get('.client-row').trigger('click');await flushPromises();
  expect(wrapper.get('.cm-drawer-provider').text()).toContain('Unassigned');
  const originalGet=apiMock.get.getMockImplementation();
  apiMock.get.mockImplementation(async(...args)=>{
   const result=await originalGet(...args);
   if(String(args[0]).startsWith('/clients?'))result.data.items[0].provider_name='Michael Synthetic';
   return result;
  });
  await wrapper.vm.$.setupState.fetchClients({background:true});await flushPromises();
  expect(wrapper.get('.cm-drawer-provider').text()).toBe('Michael Synthetic');
 } finally {wrapper.unmount();}
});
