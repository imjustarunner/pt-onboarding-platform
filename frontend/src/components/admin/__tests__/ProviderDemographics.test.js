// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ProviderInfoTab from '../ProviderInfoTab.vue';
import { fieldKeysForSubTab, fieldGroupsForSubTab } from '../../../constants/clinicalProfileLayout.js';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 9, role: 'admin' } }) }));
const fields = [
  { id: 1, field_key: 'date_of_birth', field_label: 'Birthdate', field_type: 'date', value: '1998-10-09', hasValue: true, category_key: 'credentialing' },
  { id: 2, field_key: 'provider_birthdate', field_label: 'Birthdate', field_type: 'date', value: '1998-10-09', hasValue: true },
  { id: 3, field_key: 'gender', field_label: 'Gender', field_type: 'text', value: 'Woman', hasValue: true }
];
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async (url) => ({ data: url.endsWith('/user-info') ? fields : [] }));
  api.post.mockResolvedValue({ data: {} });
});
const render = (tab) => mount(ProviderInfoTab, { props: {
  userId: 12, embedded: true, ensureEmptyFields: true, clinicalFilter: true,
  panelTitle: tab, fieldKeys: fieldKeysForSubTab(tab), fieldGroups: fieldGroupsForSubTab(tab)
}, global: { stubs: { StaffClientComfortPreferencesModal: true } } });
describe('demographics profile editor', () => {
  it('shows one birthdate, saves only the visible canonical field, and never loads the directory', async () => {
    const wrapper = render('demographics');
    await flushPromises();
    expect(wrapper.findAll('input[type=date]')).toHaveLength(1);
    expect(wrapper.get('input[type=date]').element.value).toBe('1998-10-09');
    await wrapper.get('input[type=date]').setValue('1998-10-10');
    await wrapper.get('.embedded-header button').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/users/12/user-info', { agencyId: null, values: [{ fieldDefinitionId: 1, value: '1998-10-10' }] });
    expect(wrapper.text()).not.toContain('Latinx');
    expect(api.get.mock.calls.some(([url]) => url.includes('provider-directories'))).toBe(false);
    wrapper.unmount();
  });
  it.each(['all_fields', 'administrative', 'personal_bio'])('does not duplicate birthdate in %s', async (tab) => {
    const wrapper = render(tab);
    await flushPromises();
    expect(wrapper.findAll('input[type=date]')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('Latinx');
    wrapper.unmount();
  });
  it('does not overwrite birthdate when saving All Profile Fields', async () => {
    const wrapper = render('all_fields');
    await flushPromises();
    await wrapper.get('.embedded-header button').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/users/12/user-info', {
      agencyId: null, values: [{ fieldDefinitionId: 3, value: 'Woman' }]
    });
    wrapper.unmount();
  });
});
