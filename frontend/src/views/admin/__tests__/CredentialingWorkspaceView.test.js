import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import CredentialingWorkspaceView from '../CredentialingWorkspaceView.vue';
import api from '../../../services/api';
const router=vi.hoisted(()=>({push:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),patch:vi.fn()}}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:99,name:'PlotTwistCo'}})}));
vi.mock('vue-router',()=>({useRoute:()=>({query:{},params:{organizationSlug:'plottwistco'}}),useRouter:()=>router}));
const data=()=>({organizations:[{id:1,name:'Inner Strength',canViewBilling:false,color_palette:{primary:'#23564f'}},{id:2,name:'Second Agency',canViewBilling:false}],records:[{agencyId:1,subjectType:'provider',credentialId:5,providerId:9,subjectName:'Test Provider',payerDefinitionId:7,payerName:'Test Payer',billingGroupNpiId:11,status:'in_review',version:2},{agencyId:2,subjectType:'group',credentialId:6,subjectName:'Second Group',payerDefinitionId:8,payerName:'Another Payer',status:'active',version:0}],groups:[{id:11,agencyId:1,npi:'1234567893',officeId:4}],payers:[{id:7,agencyId:1,name:'Test Payer',payerId:'TEST',version:0}],enrollments:[{agencyId:1,payerId:'TEST',groupNpi:'1234567893',officeId:4,type:'era',status:'requested'}],claimCounts:[{agencyId:1,payerId:'TEST',groupNpi:'1234567893',providerId:9,status:'rejected',count:3},{agencyId:2,payerId:'TEST',groupNpi:'1234567893',providerId:9,status:'paid',count:100}],capabilities:{electronicEnrollment:true,claimLinkage:true}});
const button=(w,text)=>w.findAll('button').find(b=>b.text()===text);
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async url=>({data:url.endsWith('/history')?{items:[]}:data()}));api.patch.mockResolvedValue({data:{saved:true}});});
describe('credentialing workspace',()=>{
  it('starts across authorized agencies, then brands and loads the selected tenant',async()=>{
    const w=mount(CredentialingWorkspaceView);await flushPromises();expect(w.text()).toContain('PlotTwistCo');expect(w.text()).toContain('Second Group');expect(api.get.mock.calls[0][1].params).toEqual({});
    await w.find('[data-testid="credential-scope"]').setValue('1');await flushPromises();expect(api.get).toHaveBeenLastCalledWith('/agencies/credentialing/workspace',{params:{agencyId:'1'}});expect(w.attributes('style')).toContain('#23564f');w.unmount();
  });
  it('shows claims, ERA and eligibility separately and isolates agency claim counts without financial controls',async()=>{
    const w=mount(CredentialingWorkspaceView);await flushPromises();await button(w,'Review').trigger('click');await flushPromises();
    const detail=w.find('[role="dialog"]');expect(detail.text()).toContain('ERA enrollment');expect(detail.text()).toContain('requested');expect(detail.text()).toContain('Claims enrollment');expect(detail.text()).toContain('Not recorded');expect(detail.text()).toContain('3 claims linked');expect(detail.text()).toContain('rejected: 3');expect(detail.text()).not.toContain('100');expect(detail.text()).not.toContain('Open agency billing workspace');w.unmount();
  });
  it('does not present missing mapping or unavailable claim tracking as a zero',async()=>{
    api.get.mockResolvedValue({data:{...data(),capabilities:{claimLinkage:false,electronicEnrollment:false}}});const w=mount(CredentialingWorkspaceView);await flushPromises();await button(w,'Review').trigger('click');await flushPromises();expect(w.find('[role="dialog"]').text()).toContain('Claim linkage unavailable');expect(w.text()).not.toContain('0 claims linked');w.unmount();
  });
  it('saves evidence with the server version and refreshes the workspace',async()=>{
    const w=mount(CredentialingWorkspaceView);await flushPromises();await button(w,'Review').trigger('click');await flushPromises();await w.find('input[minlength="5"]').setValue('Payer portal confirmation');await w.find('form').trigger('submit.prevent');await flushPromises();
    expect(api.patch).toHaveBeenCalledWith('/agencies/1/credentialing/workflow/provider/5',expect.objectContaining({version:2,status:'in_review',billingGroupNpiId:11,evidenceReference:'Payer portal confirmation'}));expect(w.find('[role="dialog"]').exists()).toBe(false);expect(w.text()).toContain('audit history');w.unmount();
  });
  it('keeps edit errors visible and does not claim a stale write succeeded',async()=>{
    api.patch.mockRejectedValue({response:{data:{error:{message:'Another credentialer changed this record.'}}}});const w=mount(CredentialingWorkspaceView);await flushPromises();await button(w,'Review').trigger('click');await w.find('form').trigger('submit.prevent');await flushPromises();expect(w.find('[role="alert"]').text()).toContain('Another credentialer');expect(w.find('[role="dialog"]').exists()).toBe(true);w.unmount();
  });
  it('routes enrollment editing to the selected agency while preserving management branding',async()=>{
    const w=mount(CredentialingWorkspaceView);await flushPromises();await w.find('[data-testid="credential-scope"]').setValue('1');await flushPromises();await button(w,'Add / manage enrollment').trigger('click');expect(router.push).toHaveBeenCalledWith({path:'/plottwistco/admin/credentialing/records',query:{agencyId:'1',panel:'payer-credentialing'}});w.unmount();
  });
  it('ignores stale scope responses and clears records when access is denied',async()=>{
    const w=mount(CredentialingWorkspaceView);await flushPromises();let resolve;api.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));await w.find('[data-testid="credential-scope"]').setValue('1');await flushPromises();api.get.mockRejectedValueOnce({response:{status:403}});await w.find('[data-testid="credential-scope"]').setValue('2');await flushPromises();resolve({data:data()});await flushPromises();expect(w.text()).not.toContain('Test Provider');expect(w.text()).not.toContain('Second Group');expect(w.find('[role="alert"]').exists()).toBe(true);w.unmount();
  });
  it('open work metric filters all pending states rather than just in-review applications',async()=>{
    api.get.mockResolvedValue({data:{...data(),records:[...data().records,{...data().records[0],credentialId:9,subjectName:'Missing Application',status:'not_started'}]}});const w=mount(CredentialingWorkspaceView);await flushPromises();await w.findAll('.cw-metrics button')[1].trigger('click');expect(w.text()).toContain('Missing Application');expect(w.text()).toContain('Test Provider');expect(w.text()).not.toContain('Second Group');w.unmount();
  });
});
