import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import OutreachHubView from '../OutreachHubView.vue';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../services/api.js', () => ({ default: api }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 } }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 1, role: 'admin' } }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {}, params: {} }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../caseload-hub/CaseloadHubEventsView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../caseload-hub/CaseloadHubCalendarView.vue', () => ({ default: { template: '<div />' } }));

const school = { id: 20, name: 'Southmoor Elementary School', district_name: 'Denver Public Schools', outreach_stage: 'not_started', contacts: [], notes: [],
  feed: [{ id: 'note-1', entry_type: 'note', title: 'Note', body: 'They already have a DPS community partner.', trip_id: 2, trip_title: 'September visit', occurred_at: '2026-09-22T14:00:00Z' }] };
const school2 = { ...school, id: 21, name: 'Another school', feed: [] };
const trips = [{ id: 2, title: 'September visit', status: 'completed', planned_date: '2026-09-22', stops: [{ id: 3, outreach_school_id: 20, school_name: school.name, attendance_status: 'attended' }] }];
const clickText = (wrapper, text) => wrapper.findAll('button').find(button => button.text() === text).trigger('click');

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset();
  api.get.mockImplementation(async url => ({ data: url === '/outreach/trips' ? { trips }
    : url === '/outreach/schools' ? { schools: [school, school2] }
      : url === '/outreach/schools/20' ? { school }
        : url === '/outreach/schools/21' ? { school: school2 } : {} }));
  api.post.mockImplementation(async (url, payload) => ({ data: url === '/outreach/trips/preview'
    ? { schools: [school, school2].filter(row => !payload.excludeIds.includes(row.id)) } : {} }));
});

describe('trip planning history', () => {
  it('reviews school history before adding a stop, then keeps notes visible after adding', async () => {
    const wrapper = mount(OutreachHubView, { global: { stubs: { RouterLink: true } } });
    await flushPromises(); await clickText(wrapper, 'Trips'); await flushPromises();
    await wrapper.get('[aria-label="View notes and past trips for Southmoor Elementary School"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.ohub-route-stop')).toHaveLength(0);
    expect(wrapper.get('.otse').text()).toContain('They already have a DPS community partner.');
    expect(wrapper.get('.otse').text()).toContain('September visit');
    expect(wrapper.get('.otse').text()).toContain('Attended');
    expect(wrapper.findAll('.otse form')).toHaveLength(0);
    await clickText(wrapper, 'Add to trip'); await flushPromises();
    expect(wrapper.findAll('.ohub-route-stop')).toHaveLength(1);
    expect(wrapper.get('.otse').text()).toContain('They already have a DPS community partner.');
    expect(wrapper.findAll('.otse form').length).toBeGreaterThan(0);
    expect(wrapper.find('[aria-label="Add Southmoor Elementary School to trip"]').exists()).toBe(false);
    expect(api.post.mock.calls.every(([url]) => url === '/outreach/trips/preview')).toBe(true);
    wrapper.unmount();
  });
  it('ignores a late school response after another school has been selected', async () => {
    let finishFirst;
    const original = api.get.getMockImplementation();
    api.get.mockImplementation(url => url === '/outreach/schools/20' ? new Promise(resolve => { finishFirst = resolve; }) : original(url));
    const wrapper = mount(OutreachHubView, { global: { stubs: { RouterLink: true } } });
    await flushPromises(); await clickText(wrapper, 'Trips'); await flushPromises();
    await wrapper.get('[aria-label="View notes and past trips for Southmoor Elementary School"]').trigger('click');
    await wrapper.get('[aria-label="View notes and past trips for Another school"]').trigger('click');
    await flushPromises(); finishFirst({ data: { school } }); await flushPromises();
    expect(wrapper.get('.otse h2').text()).toBe('Another school');
    wrapper.unmount();
  });
});
