import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../../store/branding', () => ({ useBrandingStore: () => ({}) }));
vi.mock('../../../composables/useProviderUpdateSession', () => ({ useProviderUpdateSession: () => ({ start: vi.fn(), activeSeconds: { value: 0 }, paused: { value: false }, timeError: { value: '' } }) }));
import api from '../../../services/api';
import Dashboard from '../ProviderUpdateDashboard.vue';

beforeEach(() => vi.clearAllMocks());
it.each(['Counselor & Clinical Practice Assistant', 'Facilitator', null])('uses the saved staff label or a neutral fallback: %s', async displayRole => {
  api.get.mockResolvedValue({ data: { recipient: { id: 1, firstName: 'Aunya', lastName: 'Albinana', previewOnly: true, displayRole }, sections: [], agency: { name: 'ITSCO' } } });
  const wrapper = mount(Dashboard, { props: { token: 'preview-test' }, global: { stubs: { ProviderUpdateHelp: true, ProviderUpdatePagePanel: true } } });
  await flushPromises();
  expect(wrapper.get('.pu-user-role').text()).toBe(displayRole || 'Team member');
  expect(wrapper.text()).not.toContain('External Staff');
  wrapper.unmount();
});
