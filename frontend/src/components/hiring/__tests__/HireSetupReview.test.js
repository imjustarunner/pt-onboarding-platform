import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import HireStepReview from '../HireStepReview.vue';
import Preview from '../HireSetupDocumentPreview.vue';
import { builtInHireDocument } from '../../../navigation/hireDocuments.js';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../documents/PDFPreview.vue', () => ({ default: { name: 'PDFPreview', props: ['pdfUrl'], template: '<div class="pdf-preview-stub" />' } }));
import api from '../../../services/api';
let wrapper;
beforeEach(() => { vi.clearAllMocks(); URL.createObjectURL = vi.fn(() => 'blob:preview'); URL.revokeObjectURL = vi.fn(); });
afterEach(() => wrapper?.unmount());
it('requires each step to be reviewed and invalidates only the changed item', async () => {
  const steps = [{ key: 'one', title: 'Secure authorization', instructions: 'Sign the secure form' }, { key: 'two', title: 'Identogo', instructions: 'Read the instructions' }];
  wrapper = mount(HireStepReview, { props: { steps } });
  expect(wrapper.emitted('reviewed').at(-1)).toEqual([false]);
  await wrapper.get('.review-actions .primary').trigger('click');
  expect(wrapper.get('h3').text()).toBe('Identogo');
  expect(wrapper.emitted('reviewed').at(-1)).toEqual([false]);
  await wrapper.get('.review-actions .primary').trigger('click');
  expect(wrapper.emitted('reviewed').at(-1)).toEqual([true]);
  await wrapper.setProps({ steps: [steps[0], { ...steps[1], instructions: 'Updated instructions' }] });
  expect(wrapper.emitted('reviewed').at(-1)).toEqual([false]);
  expect(wrapper.text()).toContain('1 of 2 candidate steps reviewed');
});
it('opens the saved job document inline with a local loading state and releases the preview on close', async () => {
  api.get.mockResolvedValue({ data: new Blob(['pdf'], { type: 'application/pdf' }) });
  wrapper = mount(Preview, { props: { title: 'Identogo', agencyId: 2, jobId: 3, documentId: 'identogo' } });
  expect(api.get).not.toHaveBeenCalled();
  await wrapper.get('button').trigger('click'); await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/hiring/packet-preview/document', expect.objectContaining({ params: expect.objectContaining({ agencyId: 2, jobId: 3, documentId: 'identogo' }), skipGlobalLoading: true, responseType: 'blob' }));
  expect(wrapper.getComponent({ name: 'PDFPreview' }).props('pdfUrl')).toBe('blob:preview');
  await wrapper.get('button').trigger('click'); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});
it('does not display a stale preview after its source changes during loading', async () => {
  let resolveFirst;
  api.get.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValueOnce({ data: new Blob(['new'], { type: 'application/pdf' }) });
  wrapper = mount(Preview, { props: { title: 'First', agencyId: 2, templateId: 1 } });
  await wrapper.get('button').trigger('click'); await wrapper.setProps({ title: 'Second', templateId: 2 }); await flushPromises();
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  resolveFirst({ data: new Blob(['old'], { type: 'application/pdf' }) }); await flushPromises();
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1); expect(wrapper.getComponent({ name: 'PDFPreview' }).attributes('aria-label')).toBe('Second preview');
});
it('deduplicates only built-in forms and keeps fingerprint instructions as a distinct document', () => {
  expect(builtInHireDocument({ document_name: 'Hiring: Authorization for Background Check' })).toBe('background');
  expect(builtInHireDocument({ title: 'Workplace handbook · review' })).toBe('handbook');
  expect(builtInHireDocument({ title: 'Identogo' })).toBeNull();
  expect(builtInHireDocument({ title: 'Background check instructions' })).toBeNull();
});
