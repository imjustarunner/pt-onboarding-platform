import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Modal from '../LibraryAddResourceModal.vue';
import { createLibraryBrandedDoc, uploadLibraryResource, createLibraryFolder, addLibraryLink } from '../../../services/library.js';
vi.mock('../../../services/library.js', () => ({ uploadLibraryResource: vi.fn(), uploadLibraryBatch: vi.fn(), addLibraryLink: vi.fn(), createLibraryFolder: vi.fn(), createLibraryBrandedDoc: vi.fn(), suggestLibraryMetadata: vi.fn() }));
vi.mock('../LibraryDocumentEditor.vue', () => ({ default: { props: ['modelValue'], template: '<textarea aria-label="Document body" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' } }));
let wrapper;
beforeEach(() => { vi.clearAllMocks(); wrapper = mount(Modal, { props: { initialMode: 'branded', agencyId: 2 } }); });
afterEach(() => { wrapper.unmount(); vi.restoreAllMocks(); });
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
  wrapper.unmount(); wrapper = mount(Modal, { props: { initialMode: 'upload', agencyId: 7 } });
  const file = new File(['%PDF-1.7'], 'Worksheet.pdf', { type: 'application/pdf' });
  const input = wrapper.get('input[type="file"]'); Object.defineProperty(input.element, 'files', { value: [file] }); await input.trigger('change');
  uploadLibraryResource.mockResolvedValue({id: 30, fileType: 'pdf'});
  await wrapper.findAll('button').find(b => b.text() === 'Add resource').trigger('click'); await flushPromises();
  expect(uploadLibraryResource.mock.calls[0][0].get('agencyId')).toBe('7');
  expect(wrapper.emitted('created')[0][0]).toMatchObject({item:{id:30},shareMode:null});
});
it('creates folders in the selected agency', async () => {
  wrapper.unmount(); wrapper = mount(Modal, { props: { initialMode: 'folder', agencyId: 7 } });
  createLibraryFolder.mockResolvedValue({ id: 31 });
  await wrapper.get('input[placeholder="e.g. Care Documents, Research Articles"]').setValue('My folder');
  await wrapper.find('footer').findAll('button').find(b => b.text() === 'Create folder').trigger('click'); await flushPromises();
  expect(createLibraryFolder).toHaveBeenCalledWith(expect.objectContaining({agencyId:7}));
});
