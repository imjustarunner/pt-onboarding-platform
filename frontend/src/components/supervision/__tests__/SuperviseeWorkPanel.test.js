import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SuperviseeWorkPanel from '../SuperviseeWorkPanel.vue';
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'demo' } }) }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
import api from '../../../services/api';
describe('supervisee workspace panels', () => {
  beforeEach(() => api.get.mockReset());
  it('loads real count badges quietly without rendering an empty panel', async () => {
    api.get.mockResolvedValue({ data: { tasks: 4, work: 2 } });
    const wrapper = mount(SuperviseeWorkPanel, { props: { agencyId: 450, providerId: 81, mode: 'counts' } });
    await flushPromises();
    expect(wrapper.emitted('counts')[0][0]).toEqual({ tasks: 4, work: 2 });
    expect(wrapper.find('section').exists()).toBe(false);
    expect(api.get.mock.calls[0][1].skipGlobalLoading).toBe(true);
  });
  it('keeps zero observed time separate from no measurement and shows rank coverage', async () => {
    api.get.mockResolvedValue({ data: { windowDays: 90, reply: { averageHours: 0, samples: 8, band: 'Top 5%', cohortSize: 20 }, notes: { averageHours: null, samples: 0 }, replyCoverage: 'Secure only', noteCoverage: 'Signed notes only' } });
    const wrapper = mount(SuperviseeWorkPanel, { props: { agencyId: 450, providerId: 81, mode: 'performance' } }); await flushPromises();
    expect(wrapper.text()).toContain('0 min'); expect(wrapper.text()).toContain('Not measured'); expect(wrapper.text()).toContain('Top 5%'); expect(wrapper.text()).toContain('Signed notes only');
  });
  it('reuses a loaded tab but clears data when provider changes', async () => {
    api.get.mockResolvedValue({ data: { items: [{ id: 1, title: 'DEMO task', status: 'pending' }], total: 1 } });
    const wrapper = mount(SuperviseeWorkPanel, { props: { agencyId: 450, providerId: 81, mode: 'tasks' } }); await flushPromises();
    await wrapper.setProps({ mode: 'work' }); await flushPromises(); await wrapper.setProps({ mode: 'tasks' }); await flushPromises();
    expect(api.get).toHaveBeenCalledTimes(2);
    await wrapper.setProps({ providerId: 82 }); await flushPromises(); expect(api.get).toHaveBeenCalledTimes(3);
    expect(api.get.mock.calls[2][0]).toContain('/82/workspace');
  });
});
