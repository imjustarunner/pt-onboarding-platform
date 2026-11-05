import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Days from '../ProviderSchoolDays.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'itsco' } }) }));
const school = (id, name, days) => ({ schoolOrganizationId: id, schoolName: name, days });
const roster = [
  { id: 1, first_name: 'Alex', last_name: 'Assigned', title: 'Counselor', preferences: { school: true }, schoolAssignments: [school(10, 'Cedar', ['Monday', 'Wednesday']), school(11, 'Maple', ['Friday'])] },
  { id: 2, first_name: 'Blair', last_name: 'NoSchools', schoolAssignments: [], preferences: { school: true } },
  { id: 3, first_name: 'Casey', last_name: 'Covered', schoolAssignments: [school(10, 'Cedar', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])], preferences: { school: true } },
  { id: 4, first_name: 'Drew', last_name: 'SchoolOff', schoolAssignments: [school(11, 'Maple', ['Friday'])], preferences: { school: false } }
];
const routerStub = { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' };
const render = async (props = {}) => {
  const wrapper = mount(Days, { props: { agencyId: 2, ...props }, global: { stubs: { RouterLink: routerStub } } });
  await flushPromises();
  return wrapper;
};
const click = (wrapper, text) => wrapper.findAll('button').find(button => button.text() === text).trigger('click');
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue({ data: structuredClone(roster) }); });

describe('Provider Days', () => {
  it('shows five weekdays and all current schools, hiding providers with no schools even when searched', async () => {
    const wrapper = await render();
    expect(api.get).toHaveBeenCalledWith('/availability/admin/providers', expect.objectContaining({ params: { agencyId: 2, includePreferences: true } }));
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(5);
    expect(wrapper.findAll('tbody tr')).toHaveLength(3);
    expect(wrapper.text()).toContain('Alex Assigned');
    expect(wrapper.text()).toContain('Maple');
    expect(wrapper.text()).not.toContain('Blair NoSchools');
    await wrapper.find('input[type="search"]').setValue('Blair');
    expect(wrapper.findAll('tbody tr')).toHaveLength(0);
    await click(wrapper, 'Show providers with no school assignments');
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.text()).toContain('Blair NoSchools');
    await click(wrapper, 'Hide providers with no school assignments');
    expect(wrapper.text()).not.toContain('Blair NoSchools');
  });

  it('filters gaps across every assigned school, excludes school-care-off providers, and allows zero-count days', async () => {
    const wrapper = await render();
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs[0].attributes('aria-label')).toBe('Available Monday: 0 providers');
    expect(tabs[0].attributes('disabled')).toBeUndefined();
    await tabs[0].trigger('click');
    expect(wrapper.text()).toContain('No matching providers are available Monday');
    await tabs[1].trigger('click');
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.find('tbody').text()).toContain('Alex Assigned');
    expect(wrapper.find('tbody').text()).not.toContain('SchoolOff');
    expect(wrapper.find('tbody tr').findAll('td').filter(cell => cell.classes('available'))).toHaveLength(2);
    await click(wrapper, 'All provider days');
    expect(wrapper.findAll('tbody tr')).toHaveLength(3);
  });

  it('offers direct provider messages and schedules scoped to the agency without sending anything', async () => {
    const wrapper = await render();
    expect(JSON.parse(wrapper.find('[aria-label="Message Alex Assigned"]').attributes('data-to'))).toEqual({ path: '/itsco/messages', query: { view: 'workspace', tab: 'dms', agencyId: '2', openChatWith: '1', openChatWithName: 'Alex Assigned' } });
    expect(JSON.parse(wrapper.find('[aria-label="View schedule for Alex Assigned"]').attributes('data-to')).query).toMatchObject({ agencyId: '2', scheduleViewAs: '1' });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('uses agency-neutral links from school portals and searches provider titles and assigned schools', async () => {
    const wrapper = await render({ organizationSlug: '' });
    expect(JSON.parse(wrapper.find('[aria-label="Message Alex Assigned"]').attributes('data-to')).path).toBe('/messages');
    await wrapper.find('input').setValue('counselor');
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    await wrapper.find('input').setValue('maple');
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
  });

  it('resets the opt-in and filters on agency changes and rejects stale roster responses', async () => {
    const wrapper = await render();
    await click(wrapper, 'Show providers with no school assignments');
    let stale;
    api.get.mockImplementationOnce(() => new Promise(resolve => { stale = resolve; }));
    await wrapper.setProps({ agencyId: 3 });
    api.get.mockResolvedValueOnce({ data: [{ ...roster[0], first_name: 'Current' }] });
    await wrapper.setProps({ agencyId: 4 });
    await flushPromises();
    stale({ data: [{ ...roster[1], first_name: 'Stale' }] });
    await flushPromises();
    expect(wrapper.text()).toContain('Current Assigned');
    expect(wrapper.text()).not.toContain('Stale');
    expect(wrapper.find('button[aria-pressed]').attributes('aria-pressed')).toBe('false');
  });

  it('shows a failed load with a working retry and never presents failure as availability', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'));
    const wrapper = await render();
    expect(wrapper.find('[role="alert"]').text()).toContain('Could not load');
    expect(wrapper.find('table').exists()).toBe(false);
    await click(wrapper, 'Try again');
    await flushPromises();
    expect(wrapper.findAll('tbody tr')).toHaveLength(3);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
