import { expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Gallery from '../ClientDocumentsGallery.vue';
import api from '../../../../services/api';

vi.mock('../../../../services/api', () => ({ default: { get: vi.fn() } }));

it('labels session materials and disables unavailable downloads without calling the open endpoint', async () => {
  api.get.mockImplementation(async url => ({ data: url.endsWith('/chart-artifacts') ? { artifacts: [
    { id: 'phi-1', kind: 'session_material', kindLabel: 'Session material', title: 'Pending worksheet', viewKey: 'phi-1', available: false },
    { id: 'phi-2', kind: 'session_material', kindLabel: 'Session material', title: 'Released worksheet', viewKey: 'phi-2', available: true }
  ] } : {} }));
  const wrapper = mount(Gallery, { props: { clientId: 42 } });
  await flushPromises();
  const cards = wrapper.findAll('.cdg-card');
  expect(cards[0].text()).toContain('Session material');
  expect(cards[0].text()).not.toContain('Signed form');
  expect(cards[0].find('button').attributes('disabled')).toBeDefined();
  expect(cards[1].find('button').attributes('disabled')).toBeUndefined();
  await cards[0].find('button').trigger('click');
  expect(api.get.mock.calls.every(([url]) => url.endsWith('/chart-artifacts') || url.endsWith('/records-copy-blocks'))).toBe(true);
  wrapper.unmount();
});
