import { afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Modal from '../StartConversationModal.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
let wrapper;
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks(); });
it('opens the full group directory and preserves the selected channel', async () => {
  api.get.mockImplementation(async url => ({ data: url.includes('start-directory') ? { sections: { groups: [{ personKey: 'group:42@2', groupId: 42, agencyId: 2, displayName: 'Denver', kinds: ['group', 'channel'] }] } } : {} }));
  wrapper = mount(Modal, { props: { agencyId: 2, initialChip: 'groups' } });
  await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/messages/hub/start-directory', expect.objectContaining({ params: expect.objectContaining({ perSection: 40 }) }));
  await wrapper.findAll('button').find(b => b.text().includes('Denver')).trigger('click');
  expect(wrapper.emitted('open-group')[0][0]).toMatchObject({ groupId: 42, kinds: ['group', 'channel'] });
});
