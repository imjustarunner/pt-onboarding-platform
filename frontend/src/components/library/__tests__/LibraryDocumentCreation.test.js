import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { useAuthStore } from '../../../store/auth';
import { LIBRARY_FILE_LIMIT } from '../../../utils/libraryUploads';
import Modal from '../LibraryAddResourceModal.vue';
import { createLibraryBrandedDoc, uploadLibraryResource, createLibraryFolder, addLibraryLink, uploadLibraryBatch } from '../../../services/library.js';
vi.mock('../../../services/library.js', () => ({ uploadLibraryResource: vi.fn(), uploadLibraryBatch: vi.fn(), addLibraryLink: vi.fn(), createLibraryFolder: vi.fn(), createLibraryBrandedDoc: vi.fn(), suggestLibraryMetadata: vi.fn() }));
vi.mock('../LibraryDocumentEditor.vue', () => ({ default: { props: ['modelValue'], template: '<textarea aria-label="Document body" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' } }));
let wrapper;
beforeEach(() => { vi.clearAllMocks(); renderModal({ initialMode: 'branded' }); });
afterEach(() => { wrapper.unmount(); wrapper = null; vi.restoreAllMocks(); });
it('creates a personal document with printable-page branding and opens the saved result', async () => {
  createLibraryBrandedDoc.mockResolvedValue({ id: 12, resourceType: 'branded_doc' });
  await wrapper.get('input[placeholder="e.g. Safety Plan"]').setValue('My document');
  await wrapper.findAll('button').find(b => b.text() === 'Save document').trigger('click'); await flushPromises();
  expect(createLibraryBrandedDoc).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, name: 'My document', brandingMode: 'organization', scope: 'personal' }));
  expect(wrapper.emitted('created')[0][0].item.id).toBe(12);
});
it('keeps a new draft open when discarding is cancelled', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  await wrapper.get('input[placeholder="e.g. Safety Plan"]').setValue('Unsaved draft');
  await wrapper.get('button[aria-label="Close"]').trigger('click');
  expect(wrapper.emitted('close')).toBeUndefined(); expect(wrapper.vm.prepareToLeave()).toBe(false);
});

it('uploads PDFs into the selected agency and keeps distribution optional', async () => {
  renderModal({ initialMode: 'upload', agencyId: 7 });
  const file = new File(['%PDF-1.7'], 'Worksheet.pdf', { type: 'application/pdf' });
  const input = wrapper.get('input[type="file"]'); Object.defineProperty(input.element, 'files', { value: [file] }); await input.trigger('change');
  uploadLibraryResource.mockResolvedValue({id: 30, fileType: 'pdf'});
  await wrapper.findAll('button').find(b => b.text() === 'Add resource').trigger('click'); await flushPromises();
  expect(uploadLibraryResource.mock.calls[0][0].get('agencyId')).toBe('7');
  expect(wrapper.emitted('created')[0][0]).toMatchObject({item:{id:30},shareMode:null});
});
it('creates folders in the selected agency', async () => {
  renderModal({ initialMode: 'folder', agencyId: 7 });
  createLibraryFolder.mockResolvedValue({ id: 31 });
  await wrapper.get('input[placeholder="e.g. Care Documents, Research Articles"]').setValue('My folder');
  await wrapper.find('footer').findAll('button').find(b => b.text() === 'Create folder').trigger('click'); await flushPromises();
  expect(createLibraryFolder).toHaveBeenCalledWith(expect.objectContaining({agencyId:7}));
});

function renderModal(props) {
  wrapper?.unmount();
  const pinia = createPinia();
  useAuthStore(pinia).user = { id: 7, role: 'provider' };
  wrapper = mount(Modal, { props: { agencyId: 2, ...props }, global: { plugins: [pinia] } });
}
async function selectFiles(files) {
  const input = wrapper.get('input[type="file"]');
  Object.defineProperty(input.element, 'files', { value: files, configurable: true });
  await input.trigger('change');
}
async function saveResource() {
  await wrapper.get('footer .btn-primary').trigger('click');
  await flushPromises();
}
it('rejects an oversized PDF before upload and allows a smaller replacement', async () => {
  renderModal({ initialMode: 'upload' });
  const large = new File(['pdf'], 'Too large.pdf', { type: 'application/pdf' });
  Object.defineProperty(large, 'size', { value: LIBRARY_FILE_LIMIT + 1 });
  await selectFiles([large]);
  expect(wrapper.get('.lib-error').text()).toContain('40 MB');
  await saveResource();
  expect(uploadLibraryResource).not.toHaveBeenCalled();
  uploadLibraryResource.mockResolvedValue({ id: 32 });
  await selectFiles([new File(['pdf'], 'Small.pdf', { type: 'application/pdf' })]);
  await saveResource();
  expect(uploadLibraryResource).toHaveBeenCalledTimes(1);
  expect(uploadLibraryResource.mock.lastCall[0].get('scope')).toBe('personal');
});
it('directs employees to a video link instead of uploading a movie', async () => {
  renderModal({ initialMode: 'upload' });
  await selectFiles([new File(['movie'], 'Orientation.MOV', { type: '' })]);
  expect(wrapper.get('.lib-error').text()).toContain('Video link');
  await saveResource();
  expect(uploadLibraryResource).not.toHaveBeenCalled();
  await wrapper.findAll('.lib-modal__tab').find(button => button.text() === 'Video link').trigger('click');
  await wrapper.get('input[placeholder="e.g. Documentation walkthrough"]').setValue('Orientation video');
  await wrapper.get('input[type="url"]').setValue('https://vimeo.com/123456789');
  addLibraryLink.mockResolvedValue({ id: 33, fileType: 'video' });
  await saveResource();
  expect(addLibraryLink).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, name: 'Orientation video', url: 'https://vimeo.com/123456789', linkKind: 'video', scope: 'personal' }));
  expect(wrapper.emitted('created')[0][0]).toMatchObject({ item: { id: 33, fileType: 'video' }, shareMode: null });
});
it('preserves relative folder paths for personal uploads and rejects batches above 50 files', async () => {
  const folder = { id: 18, name: 'My documents', scope: 'personal', ownerUserId: 7 };
  renderModal({ initialMode: 'upload_folder', folders: [folder], defaultFolderId: 18 });
  await selectFiles(Array.from({ length: 51 }, (_, i) => new File(['pdf'], `${i}.pdf`)));
  expect(wrapper.get('.lib-error').text()).toContain('50 files');
  await saveResource();
  expect(uploadLibraryBatch).not.toHaveBeenCalled();
  const file = new File(['pdf'], 'Worksheet.pdf');
  Object.defineProperty(file, 'webkitRelativePath', { value: 'Resources/Worksheets/Worksheet.pdf' });
  await selectFiles([file]);
  uploadLibraryBatch.mockResolvedValue({ created: 1 });
  await saveResource();
  const body = uploadLibraryBatch.mock.lastCall[0];
  expect(body.get('agencyId')).toBe('2');
  expect(body.get('scope')).toBe('personal');
  expect(body.get('folderId')).toBe('18');
  expect(body.getAll('relativePath')).toEqual(['Resources/Worksheets/Worksheet.pdf']);
  expect(body.getAll('files')).toHaveLength(1);
});
it('offers only the employee’s own personal folders and clears an inaccessible default', async () => {
  const folders = [
    { id: 18, name: 'My documents', scope: 'personal', ownerUserId: 7 },
    { id: 19, name: 'Shared with me', scope: 'personal', ownerUserId: 8 },
    { id: 20, name: 'Company forms', scope: 'organization', ownerUserId: 7 }
  ];
  renderModal({ initialMode: 'folder', folders, defaultFolderId: 19 });
  expect(wrapper.get('select').findAll('option').map(option => option.text())).toEqual(['Library root', 'My documents']);
  expect(wrapper.get('select').element.value).toBe('');
  await wrapper.get('input[placeholder="e.g. Care Documents, Research Articles"]').setValue('Worksheets');
  await wrapper.get('select').setValue('18');
  createLibraryFolder.mockResolvedValue({ id: 34 });
  await saveResource();
  expect(createLibraryFolder).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, scope: 'personal', parentFolderId: '18', name: 'Worksheets' }));
});
it('resets the folder when a manager changes from organization to personal scope', async () => {
  renderModal({ initialMode: 'folder', canManage: true, defaultFolderId: 20, folders: [
    { id: 18, name: 'My documents', scope: 'personal', ownerUserId: 7 },
    { id: 20, name: 'Company forms', scope: 'organization', ownerUserId: 7 }
  ] });
  expect(wrapper.get('select').element.value).toBe('20');
  await wrapper.get('input[type="radio"][value="personal"]').setValue();
  expect(wrapper.get('select').element.value).toBe('');
  expect(wrapper.get('select').findAll('option').map(option => option.text())).toEqual(['Library root', 'My documents']);
});

it('opens a dedicated document editor without upload, folder, or link tabs', () => {
  expect(wrapper.get('h2').text()).toBe('New document');
  expect(wrapper.find('.lib-modal__tabs').exists()).toBe(false);
  expect(wrapper.find('textarea[aria-label="Document body"]').exists()).toBe(true);
  renderModal({ initialMode: 'link' });
  expect(wrapper.findAll('.lib-modal__tab').map(button => button.text())).not.toContain('Create branded document');
});
