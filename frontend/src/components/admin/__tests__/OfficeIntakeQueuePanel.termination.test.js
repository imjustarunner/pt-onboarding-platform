import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'demo' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 } }) }));
vi.mock('../../../composables/useClientDisplayMode', () => ({ useClientDisplayMode: () => ({ getClientLabel: client => client.fullName, getAvatarLetters: () => 'QA' }) }));
import Panel from '../OfficeIntakeQueuePanel.vue';

let wrapper;
let clients;
beforeEach(() => {
  vi.clearAllMocks();
  clients = [{ id: 51, fullName: 'Example Client', clientType: 'school' }, { id: 52, fullName: 'Another Client', clientType: 'clinical' }];
  api.get.mockImplementation(async url => ({ data:
    url.endsWith('pending-office-clients') ? { clients: [...clients] } :
    url.endsWith('termination-providers') ? { providers: [{ id: 37, first_name: 'Former', last_name: 'Provider', is_active: 0 }] } :
    url === '/users' || url.endsWith('/notes') ? [] : {}
  }));
  api.post.mockImplementation(async url => {
    if (url === '/clients/51/terminate') clients = clients.filter(client => client.id !== 51);
    return { data: { id: 51, status: 'ARCHIVED' } };
  });
});
afterEach(() => wrapper?.unmount());

async function openTermination() {
  wrapper = mount(Panel, { attachTo: document.body, global: { stubs: { Teleport: true, QuickPostClientToExchange: true, ClientDisplayModeToggle: true } } });
  await flushPromises();
  await wrapper.get('.oiq-card').trigger('click');
  await flushPromises();
  await wrapper.get('.oiq-btn--terminate').trigger('click');
  await flushPromises();
}

describe('New Enrollments termination', () => {
  it('provides one action and saves even when every detail is unknown', async () => {
    await openTermination();
    expect(wrapper.get('[role="dialog"]').text()).toContain('Example Client');
    expect(wrapper.findAll('[required]')).toHaveLength(0);
    expect(wrapper.get('#termination-date').element.value).toBe('');
    await wrapper.get('[role="dialog"]').trigger('submit');
    await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/clients/51/terminate', { termination_reason: null, termination_last_provider_id: null, termination_date: null }, { headers: { 'X-Agency-Id': '2' } });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.findAll('.oiq-card')).toHaveLength(1);
    expect(wrapper.get('.oiq-card').text()).toContain('Another Client');
    expect(wrapper.get('[role="status"]').text()).toContain('Example Client marked as terminated and moved to Inactive.');
  });

  it('saves a selected reason, custom details, former provider, and exact date', async () => {
    await openTermination();
    expect(wrapper.get('#termination-provider').text()).toContain('Former Provider (inactive)');
    await wrapper.get('#termination-reason').setValue('Other');
    await wrapper.get('#termination-details').setValue('Family moved away');
    await wrapper.get('#termination-provider').setValue('37');
    await wrapper.get('#termination-date').setValue('2025-03-02');
    await wrapper.get('[role="dialog"]').trigger('submit');
    await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/clients/51/terminate', { termination_reason: 'Other: Family moved away', termination_last_provider_id: 37, termination_date: '2025-03-02' }, { headers: { 'X-Agency-Id': '2' } });
  });

  it('keeps the client and entered details available after a failed save', async () => {
    await openTermination();
    api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'Withdraw the available referral first.' } } } });
    await wrapper.get('#termination-details').setValue('Unable to reach family');
    await wrapper.get('[role="dialog"]').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Withdraw the available referral first.');
    expect(wrapper.get('#termination-details').element.value).toBe('Unable to reach family');
    expect(wrapper.findAll('.oiq-card')).toHaveLength(2);
    expect(wrapper.get('.oiq-detail').text()).toContain('Example Client');
    await wrapper.get('[role="dialog"]').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('allows cancellation without changing the client', async () => {
    await openTermination();
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.findAll('.oiq-card')).toHaveLength(2);
  });

  it('can save without a provider when provider loading fails', async () => {
    const get = api.get.getMockImplementation();
    api.get.mockImplementation(url => url.endsWith('termination-providers') ? Promise.reject(new Error('Unavailable')) : get(url));
    await openTermination();
    expect(wrapper.get('[role="dialog"]').text()).toContain('Providers could not be loaded');
    await wrapper.get('[role="dialog"]').trigger('submit');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/clients/51/terminate', expect.objectContaining({ termination_last_provider_id: null }), { headers: { 'X-Agency-Id': '2' } });
  });

  it('prevents duplicate saves and cancellation while the request is pending', async () => {
    await openTermination();
    let finish;
    api.post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await wrapper.get('[role="dialog"]').trigger('submit');
    await wrapper.get('[role="dialog"]').trigger('submit');
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    finish({ data: { id: 51 } });
    await flushPromises();
  });
});
