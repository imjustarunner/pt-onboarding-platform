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
