import { mount,flushPromises } from '@vue/test-utils';
import { beforeEach,describe,it,expect,vi } from 'vitest';
import SupervisionDocumentationPanel from '../SupervisionDocumentationPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn(),post:vi.fn(),patch:vi.fn()}}));
const settings={policy:{version:2,cosignTiming:'before_submission',cosignDueDays:7,nonBillableReview:'all',noteTypes:[]},canManage:true,canAttest:true,noteTypes:['TERMINATION','TREATMENT_PLAN']};
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:structuredClone(settings)});api.put.mockResolvedValue({data:{ok:true}});});
describe('supervisee documentation controls',()=>{
  it('lets the separate clinical supervisor review notes but not cosign or change the billing supervisor policy',async()=>{
    api.get.mockImplementation(url=>Promise.resolve({data:url.endsWith('/documentation-policy')?{...settings,canManage:false,canAttest:false,canReview:true,policy:{...settings.policy,supervisorUserId:9,supervisors:[{id:9,name:'Billing Supervisor'}]}}:url.endsWith('/document-reviews')?{documents:[{id:4,type:'note',title:'Progress',noteType:'PROGRESS'}]}:{content:'Shared clinical content',contentHash:'source'}}));
    const w=mount(SupervisionDocumentationPanel,{props:{agencyId:1,providerId:7}});await flushPromises();
    expect(w.text()).toContain('Billing Supervisor');expect(w.find('fieldset').attributes('disabled')).toBeDefined();expect(w.text()).not.toContain('Save supervision policy');
    await w.findAll('button').find(b=>b.text()==='Refresh documents').trigger('click');await flushPromises();await w.findAll('button').find(b=>b.text()==='Open').trigger('click');await flushPromises();
    expect(w.text()).toContain('Shared clinical content');expect(w.text()).toContain('Record clinical review');expect(w.text()).not.toContain('Cosign this note');expect(w.find('option[value="rendering_provider_oversight"]').exists()).toBe(false);w.unmount();
  });
  it('turns individual non-service types off without changing other types or mandatory amendments',async()=>{
    api.get.mockResolvedValue({data:{...structuredClone(settings),noteTypes:['TERMINATION','CONTACT_NOTE','TREATMENT_PLAN']}});
    const w=mount(SupervisionDocumentationPanel,{props:{agencyId:1,providerId:7}});await flushPromises();
    const toggles=w.findAll('.types input');expect(toggles).toHaveLength(3);expect(toggles.every(t=>t.element.checked)).toBe(true);
    await toggles[1].setValue(false);await w.find('textarea').setValue('Contact notes no longer need discretionary review');await w.find('form').trigger('submit');await flushPromises();
    expect(api.put).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({policy:expect.objectContaining({nonBillableReview:'selected',noteTypes:['TERMINATION','TREATMENT_PLAN']})}));
    expect(w.text()).toContain('Amendments and addenda always require supervisor sign-off.');w.unmount();
  });
  it('saves policy against its version and tenant, without financial fields',async()=>{
    const w=mount(SupervisionDocumentationPanel,{props:{agencyId:1,providerId:7}});await flushPromises();await w.find('select').setValue('after_submission');await w.find('textarea').setValue('Approved permitted deferred review workflow');await w.find('form').trigger('submit');await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/supervision-sessions/supervisee/7/documentation-policy',expect.objectContaining({agencyId:1,version:2,policy:expect.objectContaining({cosignTiming:'after_submission'})}));expect(w.text()).not.toContain('Billed amount');w.unmount();
  });
  it('shows a supervisee read-only controls and no ability to attest on a supervisor’s behalf',async()=>{
    api.get.mockResolvedValue({data:{...settings,canManage:false,canAttest:false}});const w=mount(SupervisionDocumentationPanel,{props:{agencyId:1,providerId:7}});await flushPromises();
    expect(w.find('fieldset').attributes('disabled')).toBeDefined();expect(w.text()).not.toContain('Schedule review block');expect(w.text()).not.toContain('Save supervision policy');w.unmount();
  });
  it('hides clinical controls when access is denied',async()=>{
    api.get.mockRejectedValue({response:{status:403}});const w=mount(SupervisionDocumentationPanel,{props:{agencyId:1,providerId:7}});await flushPromises();expect(w.find('section').exists()).toBe(false);w.unmount();
  });
});
