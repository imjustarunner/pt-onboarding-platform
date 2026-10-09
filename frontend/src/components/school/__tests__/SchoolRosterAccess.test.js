import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ClientListGrid from '../ClientListGrid.vue';
import SchoolClientOverviewPanel from '../SchoolClientOverviewPanel.vue';
import { useAuthStore } from '../../../store/auth';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const active = { id: 1, initials: 'AbCd', identifier_code: '123456', client_status_key: 'being_seen', school_staff_effective_access_state: 'roi', submission_date: '2026-09-01' };
const terminated = { ...active, id: 2, initials: 'EfGh', identifier_code: '234567', client_status_key: 'terminated', client_status_label: 'Terminated', submission_date: '2026-10-01' };
let plugins;
beforeEach(() => {
  vi.clearAllMocks();
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: 7, role: 'school_staff' };
  plugins = [pinia, createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })];
  api.get.mockResolvedValue({ data: {} });
});
const roster = (props = {}) => mount(ClientListGrid, {
  props: { organizationSlug: 'test-school', clientsOverride: [active, terminated], ...props },
  global: { plugins, stubs: { SchoolClientOverviewPanel: true } }
});

describe('school roster', () => {
  it('uses the selected label mode, including mixed-case initials', async () => {
    const wrapper = roster({ clientLabelMode: 'codes' });
    expect(wrapper.find('.initials-btn').text()).toBe('123456');
    await wrapper.setProps({ clientLabelMode: 'initials' });
    expect(wrapper.find('.initials-btn').text()).toBe('AbCd');
    await wrapper.setProps({ clientLabelMode: 'codes' });
    expect(wrapper.find('.initials-btn').text()).toBe('123456');
    wrapper.unmount();
  });
  it('defaults to active clients, offers one terminated checkbox, and searches terminated clients last', async () => {
    const wrapper = roster();
    expect(wrapper.findAll('.client-row')).toHaveLength(1);
    const terminatedControls = wrapper.findAll('label').filter(x => x.text().includes('Show terminated'));
    expect(terminatedControls).toHaveLength(1);
    await terminatedControls[0].find('input').setValue(true);
    expect(wrapper.findAll('.client-row')).toHaveLength(2);
    expect(wrapper.findAll('.client-row')[1].text()).toContain('Terminated');
    await terminatedControls[0].find('input').setValue(false);
    await wrapper.find('input[type="search"]').setValue('Ab');
    expect(wrapper.findAll('.client-row')).toHaveLength(2);
    expect(wrapper.findAll('.client-row')[1].text()).toContain('Terminated');
    await wrapper.find('input[type="search"]').setValue('');
    expect(wrapper.findAll('.client-row')).toHaveLength(1);
    expect(wrapper.findAll('th').some(x => x.text() === 'Skills')).toBe(false);
    wrapper.unmount();
  });
  it('opens expired clients without greying out the row or displaying collaboration badges', async () => {
    const expired = { ...active, school_staff_effective_access_state: 'expired', school_portal_can_open: false, unread_notes_count: 3 };
    const wrapper = roster({ clientsOverride: [expired] });
    expect(wrapper.find('.client-row').classes()).not.toContain('client-row-locked');
    expect(wrapper.text()).toContain('ROI expired');
    expect(wrapper.find('.unread-badge-comments').exists()).toBe(false);
    await wrapper.find('.initials-btn').trigger('click');
    expect(wrapper.findComponent({ name: 'SchoolClientOverviewPanel' }).exists()).toBe(true);
    wrapper.unmount();
  });
  it('does not mount or fetch collaboration or documents in an expired overview', async () => {
    const wrapper = mount(SchoolClientOverviewPanel, {
      props: { client: { ...active, school_staff_effective_access_state: 'expired' }, schoolOrganizationId: 9 },
      global: { plugins, stubs: { ClientTicketThreadPanel: true, PhiDocumentsPanel: true } }
    });
    await flushPromises();
    expect(wrapper.text()).toContain('ROI expired');
    expect(wrapper.find('.dual').exists()).toBe(false);
    expect(wrapper.find('.sco-own-docs').exists()).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
