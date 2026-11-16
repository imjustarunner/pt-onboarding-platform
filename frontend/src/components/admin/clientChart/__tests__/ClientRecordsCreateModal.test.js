import { beforeEach,expect,it,vi } from 'vitest';
import { defineComponent } from 'vue';
import { mount,flushPromises } from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),routeLeave:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:m}));vi.mock('../../../../store/auth',()=>({useAuthStore:()=>({user:{id:10,role:'support'}})}));vi.mock('vue-router',()=>({onBeforeRouteLeave:m.routeLeave}));
import Modal from '../ClientRecordsCreateModal.vue';
const Panel=defineComponent({name:'ClientEhrBringUpToDatePanel',props:['clientId','initialTexts'],emits:['imported'],setup(_props,{expose}){expose({prepareLeave:()=>true});},template:'<div data-import-panel><button data-finish @click="$emit(\'imported\')">Finish client import</button></div>'});
const mountModal=()=>mount(Modal,{props:{agencies:[{id:2,name:'Agency'}],initialAgencyId:2},global:{stubs:{Teleport:true,ClientEhrBringUpToDatePanel:Panel}}});
let assigned=false;
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();assigned=false;m.get.mockImplementation(async url=>({data:url==='/clients/creation-draft'?{revision:0,value:null}:url.includes('affiliated-organizations')?[{id:4,name:'Office',organization_type:'clinical'},{id:5,name:'School',organization_type:'school'}]:url.includes('provider-scheduling')?[{id:9,first_name:'Pat',last_name:'Provider'}]:{id:12,provider_id:assigned?9:null}}));m.put.mockImplementation(async url=>{if(url.endsWith('/provider'))assigned=true;return{data:{revision:1}};});m.post.mockImplementation(async url=>({data:url.includes('preview')?{parsed:{fullName:'Ekko Loisel',dateOfBirth:'2010-02-03'}}:{id:12,agency_id:2,organization_id:4}}));});
it('fills pasted demographics and generates spaced initials without asking for identity re-entry',async()=>{
 const w=mountModal();await flushPromises();expect(w.find('input[placeholder="YYYY-YYYY"]').exists()).toBe(false);const affiliation=w.findAll('select')[2];expect(affiliation.findAll('option').some(o=>o.text()==='School')).toBe(false);await w.get('textarea').setValue('Legal Name\nEkko Loisel\nDate of Birth\n2/3/2010');await w.findAll('button').find(b=>b.text()==='Read demographics').trigger('click');await flushPromises();
 expect(w.get('.cr-identity').text()).toContain('Ekk Loi');expect(w.get('.cr-identity').text()).toContain('2010-02-03');
 await w.findAll('button').find(b=>b.text().includes('Create chart and')).trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/clients',expect.objectContaining({full_name:'Ekko Loisel',date_of_birth:'2010-02-03',client_type:'clinical',school_year:null}),expect.anything());expect(w.find('[data-import-panel]').exists()).toBe(true);w.unmount();
});
it('ignores backdrop clicks and saves the encrypted-server draft before an explicit close',async()=>{
 const w=mountModal();await flushPromises();await w.get('textarea').setValue('Synthetic pasted chart');await w.get('.create-records-backdrop').trigger('click');expect(w.emitted('close')).toBeUndefined();await w.findAll('button').find(b=>b.text()==='Save draft & close').trigger('click');await flushPromises();expect(w.emitted('close')).toHaveLength(1);expect(m.put).toHaveBeenCalledWith('/clients/creation-draft',expect.objectContaining({value:expect.objectContaining({form:expect.objectContaining({demographics:'Synthetic pasted chart'})})}),expect.anything());expect(JSON.stringify({...localStorage})).not.toContain('Synthetic');w.unmount();
});
it('keeps provider and office selections for the next client and clears the previous patient identity',async()=>{
 const w=mountModal();await flushPromises();const providerSelect=w.findAll('select').find(select=>select.findAll('option').some(o=>o.text()==='Pat Provider'));await providerSelect.setValue('9');await w.get('textarea').setValue('Legal Name\nEkko Loisel');await w.findAll('button').find(b=>b.text()==='Read demographics').trigger('click');await flushPromises();await w.findAll('button').find(b=>b.text().includes('Create chart and')).trigger('click');await flushPromises();await w.get('[data-finish]').trigger('click');await flushPromises();expect(w.text()).toContain('Client saved and assigned');await w.findAll('button').find(b=>b.text()==='Add next client for Pat Provider').trigger('click');await flushPromises();expect(w.get('textarea').element.value).toBe('');expect(w.findAll('select').find(select=>select.findAll('option').some(o=>o.text()==='Pat Provider')).element.value).toBe('9');expect(w.text()).not.toContain('Ekko Loisel');w.unmount();
});

it('invalidates the old identity as soon as a different demographics paste is entered and blocks creation when rereading fails',async()=>{
 const w=mountModal();await flushPromises();await w.get('textarea').setValue('Legal Name\nEkko Loisel');await w.findAll('button').find(b=>b.text()==='Read demographics').trigger('click');await flushPromises();expect(w.get('.cr-identity').text()).toContain('Ekko Loisel');
 await w.get('textarea').setValue('Unrecognized different chart');expect(w.get('.cr-identity').text()).not.toContain('Ekko Loisel');expect(w.findAll('button').find(b=>b.text().includes('Create chart and')).attributes('disabled')).toBeDefined();
 m.post.mockRejectedValueOnce(Error('Parser unavailable'));await w.findAll('button').find(b=>b.text()==='Read demographics').trigger('click');await flushPromises();expect(m.post.mock.calls.some(([url])=>url==='/clients')).toBe(false);w.unmount();
});
