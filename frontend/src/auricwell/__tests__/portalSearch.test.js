import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {lettersFit,narrowingLimits} from '../../utils/letterMatch';
const get = vi.hoisted(() => vi.fn());
vi.mock('../../services/api', () => ({ default: { get, post: vi.fn() } }));
import Portal from '../Portal.vue';
const client = { id: 41, full_name: 'Test Client', agency_id: 2, agency_name: 'ITSCO', agency_slug: 'itsco', agency_icon: '/assets/branding/itsco.png' };
let wrapper;
beforeEach(() => { vi.useFakeTimers(); get.mockReset(); get.mockResolvedValue({ data: { clients: [client] } }); });
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
function page(actor) {
  wrapper = mount(Portal, {
    props: { agency: { id: 2, name: 'ITSCO' }, actor, slug: 'itsco' },
    global: { stubs: { ClientPortalOverview: { template: '<button class="share" @click="$emit(\'share-assessments\')">Share</button>' }, PortalMeasures: { template: '<section id="portal-measures">Measures</section>' } } }
  });
}
it('matches misplaced letters and starts a scoped search while typing', async () => {
  expect(lettersFit('tset', 'Test Client')).toBe(true);
  expect(lettersFit('zzz', 'Test Client')).toBe(false);
  expect(narrowingLimits([{ name: 'Ada' }, { name: 'Bea' }], [{ label: 'Practice: ITSCO', test: item => item.name === 'Ada' }, { label: 'Status: Inactive', test: () => false }])).toEqual([{ label: 'Status: Inactive', count: 1 }]);
  const filters = { filterAgencyId: 'all', status: 'all', sort: 'name', order: 'asc', page: 1 };
  page({ id: 9, role: 'provider' });
  await flushPromises();
  await wrapper.get('input').setValue('tset');
  await vi.advanceTimersByTimeAsync(200);
  await flushPromises();
  expect(get).toHaveBeenCalledWith('/auricwell-preview/directory', { params: { agencyId: 2, scope: 'mine', search: 'tset', ...filters } });
  expect(wrapper.text()).toContain('ITSCO');
  expect(wrapper.text()).toContain('Clients assigned to you.');
  wrapper.unmount();
  page({ id: 8, role: 'support' });
  await flushPromises();
  await wrapper.get('input').setValue('auq');
  await vi.advanceTimersByTimeAsync(200);
  await flushPromises();
  expect(get).toHaveBeenLastCalledWith('/auricwell-preview/directory', { params: { agencyId: 2, scope: 'practice', search: 'auq', ...filters } });
  expect(wrapper.text()).toContain('practices assigned to you');
});
it('names the filter that hides other matches and switches client results to a list', async () => {
  get.mockResolvedValue({ data: { clients: [client], total: 1, practices: [{ id: 377, name: 'The Inner Strength Institute' }], statuses: ['Active'], limitedBy: [{ key: 'practice', count: 3 }] } });
  page({ id: 1, role: 'super_admin' });
  await flushPromises();
  expect(wrapper.text()).toContain('All clients.');
  await wrapper.get('[aria-label="Practice"]').setValue('377');
  await flushPromises();
  expect(get).toHaveBeenLastCalledWith('/auricwell-preview/directory', expect.objectContaining({ params: expect.objectContaining({ scope: 'practice', filterAgencyId: '377' }) }));
  expect(wrapper.text()).toContain('Practice: The Inner Strength Institute');
  expect(wrapper.text()).toContain('3 without this filter');
  await wrapper.get('[aria-label="Client layout"] button:last-child').trigger('click');
  expect(wrapper.get('.client-results').classes()).toContain('list');
});
it('keeps assessments on the portal page', async () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  page({ id: 1, role: 'super_admin' });
  await wrapper.get('input').setValue('test');
  await vi.advanceTimersByTimeAsync(200);
  await flushPromises();
  await wrapper.get('.client-results button').trigger('click');
  expect(wrapper.get('#portal-measures').text()).toContain('Measures');
  await wrapper.get('.share').trigger('click');
  expect(open).not.toHaveBeenCalled();
  open.mockRestore();
});
