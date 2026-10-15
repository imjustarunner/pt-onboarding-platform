import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent } from 'vue';
const http = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: http }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'itsco' }, query: {} }) }));
import Editor from '../JobHirePackagesEditor.vue';
let wrapper, shared, requests;
const resource = (id, phase) => ({ id, phase, title: id, kind: 'link', required: true, url: 'https://example.test/' + id });
const clone = v => JSON.parse(JSON.stringify(v));
beforeEach(() => {
  vi.clearAllMocks();
  shared = { phases: { pre_hire: { packageId: 3, revision: 'pre1', workflow: { resources: [resource('precheck','pre_hire')] }, documents: [], training: {} }, onboarding: { packageId: 4, revision: 'onb1', workflow: { resources: [resource('orientation','onboarding')] }, documents: [], training: { moduleIds: [9], guideRequirements: {} } } }, guides: [{ key: 'provider-guide', title: 'Provider guide' }] };
  http.get.mockImplementation(async url => ({ data: url === '/hiring/package-defaults' ? clone(shared) : url === '/onboarding-packages' ? [{ id:3, name:'Shared prehire',package_type:'pre_hire',agency_id:2 },{id:4,name:'Shared onboarding',package_type:'onboarding',agency_id:2},{id:5,name:'Clinical onboarding',package_type:'onboarding',agency_id:2}]
    : url === '/document-templates' ? [{id:7,name:'Form I-9',agency_id:2},{id:90,name:'Other agency',agency_id:3}]
    : url === '/modules' ? [{id:9,title:'Privacy training',agency_id:2},{id:10,title:'Clinical training',agency_id:2},{id:99,title:'Other agency training',agency_id:9}]
    : url === '/tracks' ? [{id:20,name:'New provider training',agency_id:2}] : {} }));
  http.put.mockImplementation(async (url, input) => { const phase = url.split('/').pop(); shared.phases[phase] = { ...clone(input), revision: 'saved' }; return { data: clone(shared) }; });
});
afterEach(() => wrapper?.unmount());
const button = name => wrapper.findAll('button').find(b => b.text() === name);
async function setup(config = {documents:[]}) {
  wrapper = mount(defineComponent({ components:{ Editor }, data:()=>({config}), template:'<Editor v-model="config" :agency-id="2" />' }), { global:{ stubs:{ HirePackageContents: true, JobPrehireDocsEditor: true } } });
  await flushPromises();
}
describe('job package default editor', () => {
  it('keeps both phase drafts and labels inherited versus job-only requirements', async () => {
    await setup(); expect(wrapper.text()).toContain('precheck'); expect(wrapper.text()).not.toContain('orientation');
    await button('Add video').trigger('click'); await wrapper.get('.resource-editor input:not([type=checkbox])').setValue('Job welcome');
    await button('Onboarding').trigger('click'); expect(wrapper.text()).toContain('orientation');
    await wrapper.get('.package-label select').setValue('5');
    await button('Pre-hire').trigger('click'); expect(wrapper.get('.resource-editor input:not([type=checkbox])').element.value).toBe('Job welcome');
    expect(wrapper.vm.config.onboardingPackageId).toBe(5); expect(http.put).not.toHaveBeenCalled();
  });
  it('excludes or customizes a shared item only for the current job and can restore inheritance', async () => {
    await setup(); await button('Onboarding').trigger('click');
    await wrapper.get('.inherited-row input').setValue(false); expect(wrapper.vm.config.workflow.excludedResourceIds).toEqual(['orientation']);
    await button('Customize for this job').trigger('click'); await wrapper.get('.resource-editor input:not([type=checkbox])').setValue('Job orientation');
    expect(shared.phases.onboarding.workflow.resources[0].title).toBe('orientation');
    expect(wrapper.vm.config.workflow.excludedResourceIds).toEqual([]);
    await button('Use all-jobs version').trigger('click'); expect(wrapper.vm.config.workflow.resources).toEqual([]);
  });
  it('adds the approved I9 and training to all jobs with an explicit phase-scoped save', async () => {
    await setup(); await button('Onboarding').trigger('click'); await button('All jobs').trigger('click');
    await button('Add Form I-9 for all jobs').trigger('click');
    const row = wrapper.findAll('.training-row').find(r => r.text().includes('Clinical training'));
    await row.get('input').setValue(true);
    await wrapper.get('select[aria-label="Provider guide requirement"]').setValue('required');
    await button('Save onboarding defaults for all jobs').trigger('click'); await flushPromises();
    expect(http.put).toHaveBeenCalledWith('/hiring/package-defaults/onboarding', expect.objectContaining({ revision:'onb1', workflow:{resources:expect.arrayContaining([expect.objectContaining({id:'i9',templateId:7})])},training:expect.objectContaining({moduleIds:[9,10],guideRequirements:{'provider-guide':true}}) }), {params:{agencyId:2}});
    expect(wrapper.vm.config.workflow).toBeUndefined(); expect(shared.phases.pre_hire.revision).toBe('pre1');
    expect(wrapper.text()).not.toContain('Other agency training');
  });
  it('sets training exceptions for one job without changing the shared enrollment defaults', async () => {
    await setup(); await button('Onboarding').trigger('click');
    await wrapper.findAll('.training-row').find(r => r.text().includes('Privacy training')).get('input').setValue(false);
    await wrapper.findAll('.training-row').find(r => r.text().includes('Clinical training')).get('input').setValue(true);
    await wrapper.get('select[aria-label="Provider guide requirement"]').setValue('excluded');
    expect(wrapper.vm.config.onboardingTraining).toMatchObject({excludedModuleIds:[9],moduleIds:[10],guideRequirements:{'provider-guide':false}});
    expect(shared.phases.onboarding.training.moduleIds).toEqual([9]); expect(http.put).not.toHaveBeenCalled();
  });
  it('promotes a job-only step to a shared default and removes the local copy so it inherits future changes', async () => {
    await setup({documents:[],workflow:{resources:[resource('local','onboarding')]}}); await button('Onboarding').trigger('click');
    await button('Use for all jobs').trigger('click'); await flushPromises();
    expect(shared.phases.onboarding.workflow.resources.map(r=>r.id)).toEqual(['orientation','local']);
    expect(wrapper.vm.config.workflow.resources).toEqual([]); expect(wrapper.text()).toContain('Onboarding defaults saved for all jobs');
  });
  it('preserves shared edits after an error and while switching processes', async () => {
    await setup(); await button('Onboarding').trigger('click'); await button('All jobs').trigger('click'); await button('Add Form I-9 for all jobs').trigger('click');
    await button('Pre-hire').trigger('click'); await button('Onboarding').trigger('click');
    http.put.mockRejectedValueOnce({ response:{data:{error:{message:'Another person changed defaults. Reload before saving.'}}} });
    await button('Save onboarding defaults for all jobs').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('Another person changed defaults'); expect(wrapper.text()).toContain('Form I-9 added');
    expect(wrapper.findComponent(Editor).vm.sharedDirty).toBe(true);
  });
});
