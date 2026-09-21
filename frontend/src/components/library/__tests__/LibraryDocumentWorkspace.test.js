import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Workspace from '../LibraryDocumentWorkspace.vue';
import { updateLibraryResource, copyLibraryDocument } from '../../../services/library.js';
vi.mock('../../../services/library.js', () => ({ updateLibraryResource: vi.fn(), copyLibraryDocument: vi.fn(), exportLibraryDocument: vi.fn(), fetchLibraryResource: vi.fn() }));
vi.mock('../LibraryDocumentEditor.vue', () => ({ default: { props: ['modelValue', 'readonly'], template: '<textarea aria-label="body" :disabled="readonly" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' } }));
const resource = { id: 3, agencyId: 2, name: 'Safety plan', bodyHtml: '<p>Original</p>', version: 4, brandingMode: 'organization', canEdit: true, scope: 'personal' };
let wrapper;
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
const button = label => wrapper.findAll('button').find(b => b.text() === label);
const mountEditor = (patch = {}) => { wrapper = mount(Workspace, { props: { resource: { ...resource, ...patch } } }); return wrapper; };
describe('library document persistence', () => {
  it('autosaves with the loaded version and explicit agency', async () => {
    updateLibraryResource.mockResolvedValue({ ...resource, version: 5 });
    mountEditor(); await wrapper.get('textarea').setValue('<p>Filled in</p>');
    await vi.advanceTimersByTimeAsync(1000); await flushPromises();
    expect(updateLibraryResource).toHaveBeenCalledWith(3, expect.objectContaining({ bodyHtml: '<p>Filled in</p>', agencyId: 2, expectedVersion: 4 }));
    expect(wrapper.text()).toContain('All changes saved');
  });
  it('serializes edits made while a save is in flight', async () => {
    let resolveFirst;
    updateLibraryResource.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValueOnce({ ...resource, version: 6 });
    mountEditor(); await wrapper.get('textarea').setValue('First'); await vi.advanceTimersByTimeAsync(1000);
    await wrapper.get('textarea').setValue('Second');
    resolveFirst({ ...resource, version: 5 }); await flushPromises();
    expect(updateLibraryResource.mock.calls.map(call => call[1].expectedVersion)).toEqual([4, 5]);
    expect(updateLibraryResource.mock.calls[1][1].bodyHtml).toBe('Second');
    expect(wrapper.get('textarea').element.value).toBe('Second');
  });
  it('blocks navigation after a conflict and preserves unsaved edits in a private copy', async () => {
    updateLibraryResource.mockRejectedValue({ response: { status: 409, data: { error: { message: 'Document changed elsewhere' } } } });
    copyLibraryDocument.mockResolvedValue({ ...resource, id: 20 });
    mountEditor(); await wrapper.get('textarea').setValue('My unsaved work'); await vi.advanceTimersByTimeAsync(1000);
    expect(await wrapper.vm.prepareToLeave()).toBe(false);
    expect(wrapper.get('textarea').element.value).toBe('My unsaved work');
    await button('Keep my edits in a personal copy').trigger('click'); await flushPromises();
    expect(copyLibraryDocument).toHaveBeenCalledWith(3, expect.objectContaining({ bodyHtml: 'My unsaved work', agencyId: 2 }));
    expect(wrapper.emitted('copied')[0][0].id).toBe(20);
    expect(await wrapper.vm.prepareToLeave()).toBe(true);
  });
  it('retains a failed save and retries with the same version', async () => {
    updateLibraryResource.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...resource, version: 5 });
    mountEditor(); await wrapper.get('textarea').setValue('Keep this'); await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.text()).toContain('Not saved');
    await button('Retry save').trigger('click'); await flushPromises();
    expect(updateLibraryResource.mock.calls.map(call => call[1].expectedVersion)).toEqual([4, 4]);
    expect(wrapper.text()).toContain('All changes saved');
  });
  it('does not expose an editable body or title to a view-only recipient', () => {
    mountEditor({ canEdit: false });
    expect(wrapper.get('textarea').attributes('disabled')).toBeDefined();
    expect(wrapper.find('input[aria-label="Document name"]').exists()).toBe(false);
    expect(button('Make my copy')).toBeDefined();
    expect(updateLibraryResource).not.toHaveBeenCalled();
  });
});
