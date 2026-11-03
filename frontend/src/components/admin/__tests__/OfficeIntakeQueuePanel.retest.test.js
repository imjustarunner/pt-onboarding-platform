import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { get: m.get } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'demo' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 450 } }) }));
vi.mock('../../../composables/useClientDisplayMode', () => ({ useClientDisplayMode: () => ({ getClientLabel: c => c.fullName, getAvatarLetters: () => 'QA' }) }));
import Panel from '../OfficeIntakeQueuePanel.vue';

describe('new enrollment saved preferences', () => {
  it.each([['flexible', 'Flexible'], ['2pm', '2pm'], ['after 4:15 PM on school days', 'after 4:15 PM on school days']])('preserves legacy time answer %s until structured times are saved', async (saved, displayed) => {
    const client = { id: 2319, fullName: 'Synthetic Adult', clientType: 'office',
      intakePreferences: { preferredDays: ['Monday'], preferredTimeOfDay: saved, timezone: 'America/Denver' } };
    m.get.mockImplementation(async url => ({ data: url.endsWith('pending-office-clients') ? { clients: [client] } : url === '/users' || url.endsWith('/notes') ? [] : {} }));
    const w = mount(Panel, { global: { stubs: { QuickPostClientToExchange: true, ClientDisplayModeToggle: true, RouterLink: true } } });
    await flushPromises();
    await w.find('.oiq-card').trigger('click');
    await flushPromises();
    expect(w.text()).toContain(`Preferred times: ${displayed}`);
    expect(w.text()).toContain('Days: Monday');
    expect(w.text()).toContain('Time zone: America/Denver');
    w.unmount();
  });
  it('shows the stored calendar DOB and structured scheduling windows when opened', async () => {
    const client = { id: 2319, fullName: 'Synthetic Adult', dateOfBirth: '1990-04-04T00:00:00.000Z', clientType: 'office',
      intakePreferences: { preferredModality: 'in_person', preferredLocation: 'Colorado Springs', preferredTimeOfDay: 'flexible',
        exchangeSchedule: { days: ['Monday', 'Tuesday'], periods: ['afternoon'], timezone: 'America/Denver',
          windows: [{ day: 'Monday', start: '14:00', end: '15:30' }] } } };
    m.get.mockImplementation(async url => ({ data: url.endsWith('pending-office-clients') ? { clients: [client] } : url === '/users' || url.endsWith('/notes') ? [] : {} }));
    const w = mount(Panel, { global: { stubs: { QuickPostClientToExchange: true, ClientDisplayModeToggle: true, RouterLink: true } } });
    await flushPromises();
    await w.find('.oiq-card').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Apr 4, 1990');
    expect(w.text()).not.toContain('1990-04-04T');
    expect(w.text()).toContain('Colorado Springs');
    expect(w.text()).toContain('Monday');
    expect(w.text()).toContain('Preferred times: Afternoon');
    expect(w.text()).not.toContain('Flexible');
    expect(w.text()).toContain('2:00 PM');
    expect(w.text()).toContain('3:30 PM');
    expect(w.text()).toContain('America/Denver');
    w.unmount();
  });
});
