import { mount,flushPromises } from '@vue/test-utils';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const {api,route,router}=vi.hoisted(()=>({api:{get:vi.fn(),post:vi.fn(),put:vi.fn()},route:{query:{agencyId:'2',document:'agreement-1'}},router:{replace:vi.fn()}}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('vue-router',()=>({useRoute:()=>route,useRouter:()=>router}));
import View from '../OrganizationAgreementsView.vue';
let wrapper,record,actor;
const parties={practice:{legalName:'Example Practice LLC',address:'100 Example Street',noticeContact:'privacy@example.com',hipaaRole:'Covered entity'},operator:{legalName:'Technology LLC',address:'200 Example Street',noticeContact:'security@example.com',hipaaRole:'Business associate'}};
const button=text=>wrapper.findAll('button').find(b=>b.text()===text);
beforeEach(()=>{
 vi.clearAllMocks();route.query={agencyId:'2',document:'agreement-1'};route.params={};actor={id:'22',name:'Sam Practice',operator:false};
 record={id:'agreement-1',kind:'agreement',revision:4,reviewHash:'exact-saved-hash',data:{title:'Business Associate Agreement',status:'issued',effectiveDate:'2026-11-03',body:'Exact agreement text',terms:'Completed schedules',parties:structuredClone(parties),contentHash:'issued-content-hash',signers:[{accountId:'11',capacity:'Technology operator'},{accountId:'22',capacity:'Organization owner'}],signatures:[]}};
 api.get.mockImplementation(async url=>({data:url.endsWith('/organizations')?{organizations:[{id:2,name:'Example Practice'}]}:{organization:{id:2,name:'Example Practice'},actor,signers:[{id:'11',name:'Alex Operator',operator:true,organization:false},{id:'22',name:'Sam Practice',operator:false,organization:true}],documents:[structuredClone(record)]}}));
 api.post.mockImplementation(async()=>({data:record}));
});
afterEach(()=>wrapper?.unmount());
async function open(){wrapper=mount(View,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});await flushPromises();}
describe('organization agreement workspace',()=>{
 it('opens the organization from its scoped route when no agency query is supplied',async()=>{
  route.query={};route.params={organizationSlug:'example-practice'};
  const original=api.get.getMockImplementation();api.get.mockImplementation(async url=>url.endsWith('/organizations')?{data:{organizations:[{id:13,name:'Example Independent Practice',slug:'example-practice'}]}}:original(url));
  await open();expect(api.get).toHaveBeenCalledWith('/organization-agreements/13');
 });
 it('creates the chosen management agreement type and uses business contact fields',async()=>{
  record.data.status='draft';record.data.type='management_agreement';record.data.title='Management Services Agreement';
  await open();const picker=wrapper.find('.archive-list select');await picker.setValue('management_agreement');await button('+ Prepare draft').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/organization-agreements/2/agreements',{type:'management_agreement'},{headers:{'X-Organization-Agreement':'1'}});
  expect(wrapper.text()).toContain('Business notice contact');expect(wrapper.text()).not.toContain('Privacy / incident notice contact');
 });
 it('shows incomplete legal details and blocks approval while still allowing draft editing',async()=>{
  actor={id:'11',name:'Morgan Manager',operator:true};record.data.status='draft';record.data.parties.practice.address='';
  await open();expect(wrapper.text()).toContain('Organization address');expect(wrapper.text()).toContain('You can save the draft');
  await wrapper.find('.approval-panel input').setValue(true);expect(button('Approve exact version').attributes('disabled')).toBeDefined();expect(button('Save draft').attributes('disabled')).toBeUndefined();
 });
 it('shows the exact document and signs only on explicit consent using its issued hash',async()=>{
  await open();expect(api.post).not.toHaveBeenCalled();expect(wrapper.text()).toContain('Exact agreement text');
  const panel=wrapper.find('.signing-panel');await panel.find('input[type=text], input:not([type])').setValue('Sam Practice');expect(button('Sign this agreement').attributes('disabled')).toBeDefined();await panel.find('input[type=checkbox]').setValue(true);await panel.trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/organization-agreements/2/agreements/agreement-1/sign',{name:'Sam Practice',consent:true,contentHash:'issued-content-hash'},{headers:{'X-Organization-Agreement':'1'}});
 });
 it('does not offer a signature action to an unassigned administrator',async()=>{
  actor={...actor,id:'99'};await open();expect(wrapper.find('.signing-panel').exists()).toBe(false);expect(wrapper.text()).toContain('awaiting its designated representatives');expect(api.post).not.toHaveBeenCalled();
 });
 it('requires explicit exact-version operator approval and disables approval when draft fields change',async()=>{
  actor={id:'11',name:'Alex Operator',operator:true};record.data.status='draft';delete record.data.contentHash;await open();
  expect(button('Approve exact version').attributes('disabled')).toBeDefined();await wrapper.find('.approval-panel input').setValue(true);expect(button('Approve exact version').attributes('disabled')).toBeUndefined();await button('Approve exact version').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/organization-agreements/2/agreements/agreement-1/approve',{legalApproved:true,reviewHash:'exact-saved-hash'},{headers:{'X-Organization-Agreement':'1'}});
  await wrapper.find('.party-grid input').setValue('Changed legal party');expect(button('Approve exact version').attributes('disabled')).toBeDefined();expect(wrapper.text()).toContain('Unsaved changes');
 });
 it('keeps uploaded originals visibly unverified without electronic signatures',async()=>{
  record={id:'agreement-1',kind:'agreement_upload',revision:1,data:{title:'Scanned original',status:'uploaded_unverified',name:'original.pdf',hash:'original-hash'}};await open();expect(wrapper.text()).toContain('Uploaded · unverified');expect(wrapper.text()).toContain('have not yet been verified');expect(wrapper.find('.signing-panel').exists()).toBe(false);expect(button('Download original PDF')).toBeTruthy();expect(api.post).not.toHaveBeenCalled();
 });
});
