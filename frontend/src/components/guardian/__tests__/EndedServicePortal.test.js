import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('vue-router',()=>({useRoute:()=>({query:{}})}));
vi.mock('@stripe/stripe-js/pure',()=>({loadStripe:vi.fn()}));
import api from '../../../services/api';
import Portal from '../EndedServicePortal.vue';
import Ledger from '../../billing/FamilyLedgerPanel.vue';
import {endedServiceAccess} from '../../../utils/servicePortalAccess';
let w;
const props={clientId:8,agencyId:2,service:{id:3,label:'Counseling',provider_name:'Michael'},access:{limited:true,status:'discontinued',statusLabel:'Discontinued services'}};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{sessions:[{id:1,startAt:'2026-01-01T16:00:00Z',providerName:'Michael',status:'completed',modality:'IN_PERSON'}],total:1}});});
afterEach(()=>{w?.unmount();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('shows service status and history with no booking, onboarding, join, or care-request controls',async()=>{
 w=shallowMount(Portal,{props,global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.text()).toContain('Discontinued services');expect(w.text()).toContain('Your other active services are unchanged');expect(w.text()).toContain('completed');
 expect(w.findAll('button').map(b=>b.text())).toEqual(['Download full session history (CSV)']);
 expect(api.get).toHaveBeenCalledWith('/guardian-portal/clients/8/session-history',{skipGlobalLoading:true});
});
it('keeps the existing billing workspace and its financial permissions instead of exposing another client’s invoices',async()=>{
 w=shallowMount(Portal,{props:{...props,panel:'billing'},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.findComponent(Ledger).props()).toMatchObject({agencyId:2,clientId:8});expect(api.get).not.toHaveBeenCalled();
});
it('ignores a delayed history response after switching clients',async()=>{
 let old;api.get.mockImplementationOnce(()=>new Promise(done=>{old=done})).mockResolvedValueOnce({data:{sessions:[],total:0}});
 w=shallowMount(Portal,{props,global:{stubs:{RouterLink:true}}});await w.setProps({clientId:9});await flushPromises();old({data:{sessions:[{id:1,startAt:'2026-01-01',providerName:'Private prior client',status:'completed'}]}});await flushPromises();
 expect(w.text()).not.toContain('Private prior client');
});
it('keeps another active service open while restricting the ended selection',()=>{
 expect(endedServiceAccess({}, {is_active:0,service_status:'completed'})).toMatchObject({limited:true,status:'completed'});
 expect(endedServiceAccess({}, {is_active:1,service_status:'active'}).limited).toBe(false);
 expect(endedServiceAccess({client_status_key:'terminated'}, {is_active:1,service_status:'active'})).toMatchObject({limited:true,status:'terminated'});
 expect(endedServiceAccess({}, {is_active:0,service_status:'terminated',portal_status:'discontinued',portal_status_label:'Discontinued services',closure_reason:'discontinued_contact',client_end_reason:'Unable to re-establish contact.'})).toMatchObject({limited:true,status:'discontinued',statusLabel:'Discontinued services',reason:'Unable to re-establish contact.'});
});

it('downloads full history through the authenticated API and releases the local file URL',async()=>{
 const create=vi.fn(()=> 'blob:history'),revoke=vi.fn(),click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 class TestURL extends URL {static createObjectURL=create;static revokeObjectURL=revoke;}
 vi.stubGlobal('URL',TestURL);api.get.mockImplementation(async url=>({data:url.endsWith('/download')?new Blob(['Reference,Status']):{sessions:[],total:0}}));
 w=shallowMount(Portal,{props,global:{stubs:{RouterLink:true}}});await flushPromises();await w.get('button').trigger('click');await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/guardian-portal/clients/8/session-history/download',{responseType:'blob',skipGlobalLoading:true});expect(click).toHaveBeenCalledTimes(1);expect(revoke).toHaveBeenCalledWith('blob:history');
});
it('provides billing and records support for the selected agency without restarting care',async()=>{
 api.post.mockResolvedValue({data:{id:5}});w=shallowMount(Portal,{props:{...props,panel:'help'},global:{stubs:{RouterLink:true}}});await flushPromises();
 await w.get('textarea').setValue('Please send a receipt.');await w.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/support-tickets',expect.objectContaining({clientId:8,agencyId:2,topic:'billing',question:'Please send a receipt.'}));expect(w.text()).toContain('This does not restart services');
});
