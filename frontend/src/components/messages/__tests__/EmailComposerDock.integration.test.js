import { afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Dock from '../EmailComposerDock.vue';
import { openEmailComposer } from '../../../utils/emailComposerWindow';
const mock = vi.hoisted(() => ({ api: vi.fn(), router: { currentRoute: { value: { params: {} } } } }));
vi.mock('../../../services/api', () => ({ default: mock.api }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {}, meta: {} }), useRouter: () => mock.router }));
let wrapper;
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); });
it('opens a real editable new draft in the dock and saves recipients and text', async () => {
  mock.api.mockImplementation(async ({ method, url, data }) => {
    if (url.endsWith('/sender')) return { data: { fromEmail: 'messages@example.org' } };
    if (method === 'get') throw new Error('Inbox provisioning must not block composing');
    if (method === 'post') return { data: { draft: { id: 'new-draft', agency_id: 2, state: 'editing', version: 1, mode: 'new', draft: { ...data.draft } } } };
    return { data: { version: 2 } };
  });
  wrapper = mount(Dock, { attachTo: document.body, props: { ownerId: 5 } });
  openEmailComposer(mock.router, { mode: 'new', agencyId: 2 });
  for (let i = 0; i < 20 && !wrapper.find('textarea').exists(); i++) { await new Promise(r => setTimeout(r, 50)); await flushPromises(); }
  expect(wrapper.find('textarea').exists()).toBe(true);
  expect(mock.api.mock.calls.some(([c]) => c.url.includes('/inboxes'))).toBe(false);
  await wrapper.get('textarea').setValue('Ready to write');
  await wrapper.get('input[inputmode="email"]').setValue('person@example.org');
  await wrapper.get('[aria-label="Minimize draft"]').trigger('click');
  await flushPromises();
  expect(mock.api).toHaveBeenCalledWith(expect.objectContaining({ method: 'put', data: expect.objectContaining({ draft: expect.objectContaining({ to: 'person@example.org', text: 'Ready to write' }) }) }));
});
it('lets the user close a draft while the opening request is stalled', async () => {
  mock.api.mockImplementation(() => new Promise(() => {}));
  wrapper = mount(Dock, { attachTo: document.body, props: { ownerId: 5 } });
  openEmailComposer(mock.router, { mode: 'new', agencyId: 2 });
  await flushPromises();
  const close = wrapper.get('[aria-label="Save and close draft"]');
  expect(close.attributes('disabled')).toBeUndefined();
  await close.trigger('click');await flushPromises();
  expect(wrapper.find('.dock-panel').exists()).toBe(false);
});
