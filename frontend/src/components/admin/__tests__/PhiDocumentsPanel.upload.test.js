import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { role: 'admin' } }) }));
import Panel from '../PhiDocumentsPanel.vue';
let wrapper;
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue({ data: [] }); api.post.mockResolvedValue({ data: {} }); });
afterEach(() => wrapper?.unmount());
async function select(files) {
  wrapper = mount(Panel, { props: { clientId: 30, section: 'files', ownOnly: true } }); await flushPromises();
  const input = wrapper.find('input[type=file]'); Object.defineProperty(input.element, 'files', { value: files });
  await input.trigger('change'); await flushPromises();
}
it('uploads a 16 MB packet as its original multipart file', async () => {
  const file = new File(['synthetic'], 'packet.pdf', { type: 'application/pdf' }); Object.defineProperty(file, 'size', { value: 16 * 1024 * 1024 });
  await select([file]);
  expect(wrapper.text()).toContain('25 MB per file');
  expect(api.post).toHaveBeenCalledTimes(1); expect(api.post.mock.calls[0][0]).toBe('/phi-documents/clients/30/upload');
  expect(api.post.mock.calls[0][1].get('file').name).toBe('packet.pdf');
});
it('rejects an oversized selection before uploading any of its files', async () => {
  const small = new File(['synthetic'], 'small.pdf', { type: 'application/pdf' });
  const large = new File(['synthetic'], 'large.pdf', { type: 'application/pdf' }); Object.defineProperty(large, 'size', { value: 26 * 1024 * 1024 });
  await select([small, large]);
  expect(api.post).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('No files were uploaded.');
});
