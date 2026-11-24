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
const authMock=vi.hoisted(()=>({user:{id:10,role:'support'},isAuthenticated:true}));
vi.mock('../../../services/api',()=>({default:apiMock}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>authMock}));
vi.mock('vue-router',()=>({onBeforeRouteLeave:vi.fn(),useRoute:()=>({params:{organizationSlug:'synthetic'},query:{},path:'/synthetic/admin/clients',meta:{}}),useRouter:()=>({push:vi.fn(),replace:vi.fn(),hasRoute:()=>false})}));
import ClientManagement from '../ClientManagementView.vue';
import { useAgencyStore } from '../../../store/agency';
import { clearClientManagementWorkspaces } from '../../../utils/clientManagementWorkspace';
const creationLaunchCases=['admin','support','super_admin'].flatMap(role=>
 ['All Clients','New Enrollments','Client Exchange','Possible duplicates','Inactive'].map(tab=>({role,tab})));
it.each(creationLaunchCases)('opens the office records dialog for $role from $tab',async({role,tab})=>{
 localStorage.clear();sessionStorage.clear();clearClientManagementWorkspaces();vi.clearAllMocks();authMock.user.role=role;
 apiMock.get.mockImplementation(async url=>({data:
  String(url).startsWith('/clients?')?{items:[],total:0}:
  url==='/clients/creation-draft'?{revision:0,value:null}:
  url==='/office-clients/providers'?{providers:[]}:
  url==='/agencies/2'?{id:2,name:'Synthetic agency',portal_url:'synthetic',organization_type:'agency'}:[]}));
 apiMock.put.mockResolvedValue({data:{revision:1}});
 const pinia=createPinia();setActivePinia(pinia);const agency=useAgencyStore(pinia);
 agency.userAgencies=[{id:2,name:'Synthetic agency',portal_url:'synthetic',organization_type:'agency'}];agency.agencies=agency.userAgencies;agency.currentAgency=agency.userAgencies[0];
 const wrapper=shallowMount(ClientManagement,{attachTo:document.body,global:{plugins:[pinia],stubs:{RouterLink:true,ClientRecordsCreateModal:false,Teleport:false}}});
 try {
  await flushPromises();await wrapper.findAll('.cm-view-tab').find(button=>button.text().trim().startsWith(tab)).trigger('click');
  await wrapper.findAll('button').find(button=>button.text()==='+ Add client from TherapyNotes').trigger('click');await flushPromises();
  expect(document.body.querySelector('[role=dialog] h2')?.textContent).toBe('Add client from TherapyNotes');
  expect(apiMock.get).toHaveBeenCalledWith('/clients/creation-draft',expect.objectContaining({headers:{'X-Agency-Id':'2'}}));
  expect(document.body.querySelector('.create-records-modal select')?.value).toBe('2');
  expect(wrapper.get('.cm-view-tab.active').text()).toContain(tab);
  const dialog=document.body.querySelector('.create-records-modal');
  const otherTab=tab==='All Clients'?'New Enrollments':'All Clients';
  await wrapper.findAll('.cm-view-tab').find(button=>button.text().trim().startsWith(otherTab)).trigger('click');await flushPromises();
  expect(document.body.querySelector('.create-records-modal')).toBe(dialog);
  expect(apiMock.get.mock.calls.filter(([url])=>url==='/clients/creation-draft')).toHaveLength(1);
  await wrapper.findAll('.cm-view-tab').find(button=>button.text().trim().startsWith(tab)).trigger('click');
  document.body.querySelector('.create-records-modal header button').click();await flushPromises();
  expect(document.body.querySelector('.create-records-modal')).toBeNull();
  await wrapper.findAll('.cm-header-actions button').find(button=>button.text()==='+ Add client').trigger('click');await flushPromises();
  expect(document.body.querySelector('[role=dialog] h2')?.textContent).toBe('Add client from TherapyNotes');
  document.body.querySelector('.create-records-modal header button').click();await flushPromises();
  await wrapper.findAll('.cm-header-actions button').find(button=>button.text()==='Add client for selected updates').trigger('click');
  expect(wrapper.getComponent({name:'ClientUpdateModal'}).props('open')).toBe(true);
 } finally {wrapper.unmount();clearClientManagementWorkspaces();authMock.user.role='support';}
});
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

async function assignmentDirectory({assigned=false,recordsImport}={}) {
 localStorage.clear();sessionStorage.clear();vi.clearAllMocks();
 const client={id:71,agency_id:2,initials:'SYN',full_name:'Synthetic Client',status:'ACTIVE',client_type:'clinical',onboarding_docs_json:{recordsImport}};
 const service={id:201,service_kind:'counseling',label:'Counseling',is_active:1,provider_user_id:0,organization_id:0};
 const currentClient=()=>({...client,provider_id:null,provider_name:assigned?'Michael Synthetic':null,directory_provider_id:assigned?501:null,assigned_service_id:201});
 const currentService=()=>({...service,provider_user_id:assigned?501:0,provider_name:assigned?'Michael Synthetic':null});
 apiMock.get.mockImplementation(async url=>({data:
  String(url).startsWith('/clients?')?{items:[currentClient()],total:1}:
  url==='/clients/71/service-enrollments'?{services:[currentService()],availableServiceKinds:['counseling']}:
  url==='/office-clients/providers'?{providers:[{id:501,name:'Michael Synthetic',agencyIds:[2],assignmentServicesByAgency:{2:['counseling']}}]}:
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

it('keeps row actions in one readable menu and removes completed records setup',async()=>{
 const wrapper=await assignmentDirectory({recordsImport:{status:'complete'}});try{
 expect(wrapper.find('.actions-cell > button').exists()).toBe(false);const menu=wrapper.get('details.cm-row-actions');expect(menu.findAll('button').some(button=>button.text()==='Bring up to date')).toBe(false);expect(menu.text()).toContain('Follow-up task');expect(menu.text()).toContain('Demo: off — turn on');
 const statusCalls=apiMock.put.mock.calls.length;
 await menu.findAll('button').find(button=>button.text()==='Mark inactive / final follow-up').trigger('click');
 const dialog=wrapper.findComponent({name:'ClientTerminationDialog'});expect(dialog.exists()).toBe(true);
 expect(dialog.props('agencyId')).toBe(2);expect(dialog.props('clientId')).toBeGreaterThan(0);
 expect(apiMock.put.mock.calls.length).toBe(statusCalls);
 dialog.vm.$emit('close');await flushPromises();expect(wrapper.findComponent({name:'ClientTerminationDialog'}).exists()).toBe(false);
 }finally{wrapper.unmount();}
});
it('keeps a pending records import available inside the row menu',async()=>{
 const wrapper=await assignmentDirectory({recordsImport:{status:'pending'}});try{expect(wrapper.get('details.cm-row-actions').text()).toContain('Bring up to date');expect(wrapper.find('.actions-cell > button').exists()).toBe(false);}finally{wrapper.unmount();}
});
