import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent } from 'vue';
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: http }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'itsco' }, query: {} }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 1 } }) }));
vi.mock('../../library/LibraryDocumentEditor.vue', () => ({ default: { props: ['modelValue', 'agencyId', 'brandingMode'], template: '<textarea aria-label="Document body" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' } }));
import Editor from '../JobPrehireDocsEditor.vue';
import Settings from '../../admin/HiringPreHireSettings.vue';
let wrapper;
const defaults = [{id:'handbook',title:'Handbook acknowledgement',kind:'company_document',bodyHtml:'<p>Original handbook terms</p>',brandingMode:'organization'}];
beforeEach(() => {
  vi.clearAllMocks();
  http.get.mockImplementation(async url => ({ data:
    url === '/document-templates' ? [{id:3,agency_id:1,name:'Available consent',is_active:true},{id:9,agency_id:2,name:'Other tenant document',is_active:true}]
    : url === '/hiring/settings' ? {settings:{default_prehire_docs:defaults,default_prehire_package_id:10,default_onboarding_package_id:20,portal_workflow:{resources:[{id:'p',title:'Prehire video',phase:'pre_hire',kind:'video',url:'https://example.org/prehire'},{id:'o',title:'Onboarding video',phase:'onboarding',kind:'video',url:'https://example.org/onboarding'}]}}}
    : url === '/onboarding-packages' ? [{id:10,agency_id:1,name:'Prehire collection',package_type:'pre_hire',is_active:true},{id:20,agency_id:1,name:'Employee collection',package_type:'onboarding',is_active:true}]
    : url === '/contracts/library' ? {configs:[]} : [] }));
  http.put.mockResolvedValue({data:{}});
});
afterEach(() => wrapper?.unmount());
const button = text => wrapper.findAll('button').find(b => b.text() === text);
function mountEditor() { wrapper = mount(defineComponent({ components: { Editor }, data:()=>({config:{documents:[]}}), template:'<Editor v-model="config" :agency-id="1" />' })); }
describe('prehire document and resource setup', () => {
  it('shows inherited documents and tenant templates immediately, with an editable branded copy', async () => {
    mountEditor(); await flushPromises();
    expect(wrapper.text()).toContain('Handbook acknowledgement'); expect(wrapper.text()).toContain('Available consent'); expect(wrapper.text()).not.toContain('Other tenant document');
    await button('View / customize for this job').trigger('click');
    await wrapper.get('textarea[aria-label="Document body"]').setValue('<h2>Updated handbook</h2>');
    expect(wrapper.vm.config.documents[0].bodyHtml).toBe('<h2>Updated handbook</h2>');
    expect(defaults[0].bodyHtml).toBe('<p>Original handbook terms</p>');
    expect(wrapper.get('a').attributes('href')).toContain('/itsco/admin/documents/3/edit?agencyId=1');
  });
  it('can exclude an inherited default, paste a document and add a video directly to this job', async () => {
    mountEditor(); await flushPromises();
    await wrapper.get('input[type="checkbox"]').setValue(false);
    expect(wrapper.vm.config.excludedDocumentIds).toEqual(['handbook']);
    await button('Write / paste document').trigger('click');
    await wrapper.get('textarea[aria-label="Document body"]').setValue('<p>I acknowledge the handbook.</p>');
    expect(wrapper.vm.config.documents[0]).toMatchObject({kind:'company_document',bodyHtml:'<p>I acknowledge the handbook.</p>',brandingMode:'organization'});
    await button('Add video').trigger('click');
    expect(wrapper.vm.config.workflow.resources[0]).toMatchObject({phase:'pre_hire',kind:'video'});
    expect(wrapper.text()).not.toContain('Form W-4');
  });
  it('uploads a document directly as receipt-only, without a signature template', async () => {
    mountEditor(); await flushPromises();
    await button('Upload for receipt acknowledgment').trigger('click');
    http.post.mockResolvedValueOnce({data:{filePath:'prehire/notice.pdf',fileName:'notice.pdf',mimeType:'application/pdf'}});
    const input=wrapper.get('input[type="file"]');
    Object.defineProperty(input.element,'files',{value:[new File(['notice'],'notice.pdf',{type:'application/pdf'})]});
    await input.trigger('change');await flushPromises();
    expect(http.post).toHaveBeenCalledWith('/hiring/prehire-doc-files',expect.any(FormData),expect.objectContaining({params:{agencyId:1}}));
    expect(wrapper.vm.config.documents[0]).toMatchObject({kind:'receipt',filePath:'prehire/notice.pdf'});
    expect(wrapper.text()).toContain('without signing');
  });
  it('attaches an existing template once and marks it included', async () => {
    mountEditor(); await flushPromises(); await button('Include document').trigger('click');
    expect(wrapper.vm.config.documents[0].templateId).toBe(3); expect(button('Included').attributes('disabled')).toBeDefined();
  });
  it('separates prehire and onboarding while preserving settings across the switch', async () => {
    wrapper = mount(Settings, { props:{scopedAgencyId:1}, global:{stubs:{OnboardingPackageManagement:true,HirePackageContents:true}} }); await flushPromises();
    expect(wrapper.text()).toContain('Default Pre-Hire Package'); expect(wrapper.text()).not.toContain('Default Onboarding Package');
    expect(wrapper.text()).toContain('Prehire video'); expect(wrapper.text()).not.toContain('Onboarding video');
    await button('Onboarding').trigger('click');
    expect(wrapper.text()).toContain('Default Onboarding Package'); expect(wrapper.text()).not.toContain('Default Pre-Hire Package');
    expect(wrapper.text()).toContain('Onboarding video'); expect(wrapper.text()).not.toContain('Default Employment Contract');
    await button('Save settings').trigger('click'); await flushPromises();
    expect(http.put).toHaveBeenCalledWith('/hiring/settings', expect.objectContaining({default_prehire_package_id:10,default_onboarding_package_id:20,portal_workflow:expect.objectContaining({resources:expect.arrayContaining([expect.objectContaining({id:'p'}),expect.objectContaining({id:'o'})])})}), expect.anything());
  });
});
