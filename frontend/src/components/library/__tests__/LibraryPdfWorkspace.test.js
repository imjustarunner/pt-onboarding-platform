import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('../../documents/PDFDocumentFillEditor.vue', () => ({ default: { name: 'PDFDocumentFillEditor', props: ['modelValue', 'fieldValues'], emits: ['update:modelValue', 'update:fieldValues', 'fields-detected', 'ready'], template: '<div class="editor-stub">On-page PDF</div>' } }));
vi.mock('../../../services/library', () => ({ fetchLibraryPdf: vi.fn(), saveLibraryPdfCopy: vi.fn() }));
import Workspace from '../LibraryPdfWorkspace.vue';
import { fetchLibraryPdf, saveLibraryPdfCopy } from '../../../services/library';
const resource = { id: 1, agencyId: 2, name: 'Safety worksheet', resourceType: 'file', fileType: 'pdf', version: 3 };
let wrapper;
beforeEach(() => { vi.clearAllMocks(); URL.createObjectURL = vi.fn(() => 'blob:private-pdf'); URL.revokeObjectURL = vi.fn(); fetchLibraryPdf.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' })); });
afterEach(() => { wrapper?.unmount(); wrapper = null; });
async function open() {
  wrapper = mount(Workspace, { props: { resource }, global: { stubs: { AdaptiveSignatureCapture: true } } });
  await flushPromises(); const editor = wrapper.findComponent({ name: 'PDFDocumentFillEditor' });
  editor.vm.$emit('fields-detected', 0); editor.vm.$emit('ready', true); await flushPromises(); return editor;
}
it('fetches PDF content with its agency, keeps the source unchanged, and emits the saved personal copy', async () => {
  const editor = await open(); expect(fetchLibraryPdf).toHaveBeenCalledWith(1, 2, expect.any(AbortSignal));
  editor.vm.$emit('update:modelValue', [{ kind: 'text', page: 1, text: 'Sample answer' }]); await flushPromises();
  const copy = { ...resource, id: 2, scope: 'personal', privatePdf: true }; saveLibraryPdfCopy.mockResolvedValue(copy);
  await wrapper.findAll('button').find(b => b.text() === 'Save filled copy').trigger('click');
  await wrapper.findAll('button').find(b => b.text() === 'Save my copy').trigger('click'); await flushPromises();
  expect(saveLibraryPdfCopy).toHaveBeenCalledWith(1, expect.objectContaining({ agencyId: 2, expectedVersion: 3, entries: [{ kind: 'text', page: 1, text: 'Sample answer' }] }));
  expect(wrapper.emitted('copied')[0]).toEqual([copy]); expect(wrapper.vm.prepareToLeave()).toBe(true);
});
it('preserves unsaved entries when saving fails and confirms before leaving', async () => {
  const editor = await open(); editor.vm.$emit('update:fieldValues', { Name: 'Sample Person' }); await flushPromises();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false); expect(wrapper.vm.prepareToLeave()).toBe(false); expect(confirm).toHaveBeenCalled();
  saveLibraryPdfCopy.mockRejectedValue(new Error('Save unavailable'));
  await wrapper.findAll('button').find(b => b.text() === 'Save filled copy').trigger('click');
  await wrapper.findAll('button').find(b => b.text() === 'Save my copy').trigger('click'); await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('Save unavailable'); expect(editor.props('fieldValues')).toEqual({ Name: 'Sample Person' }); expect(wrapper.emitted('copied')).toBeUndefined(); confirm.mockRestore();
});
it('does not download an unfilled original when there are unsaved answers', async () => {
  const editor = await open(); editor.vm.$emit('update:fieldValues', { Name: 'Sample Person' }); await flushPromises();
  await wrapper.findAll('button').find(b => b.text() === 'Download PDF').trigger('click'); expect(wrapper.get('[role="alert"]').text()).toContain('Save your filled copy first');
});
it('revokes its private blob and aborts the request when closed', async () => {
  await open(); wrapper.unmount(); wrapper = null; expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-pdf'); expect(fetchLibraryPdf.mock.calls[0][2].aborted).toBe(true);
});
