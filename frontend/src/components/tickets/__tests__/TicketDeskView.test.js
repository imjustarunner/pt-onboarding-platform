import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import TicketDeskView from '../TicketDeskView.vue';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn() },
  auth: { user: null },
  agency: {},
  route: { query: {}, params: {} },
  router: { replace: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('../../../services/api', () => ({ default: mocks.api }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => mocks.agency }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => mocks.router }));

const assignedTicket = {
  id: 101, agency_id: 2, subject: 'Assigned support request',
  created_by_user_id: 99, claimed_by_user_id: 7,
  status: 'open', display_status: 'in_progress', source_channel: 'portal'
};
const otherTicket = { ...assignedTicket, id: 102, subject: 'Another request', claimed_by_user_id: 8 };
let wrapper;
const button = (label) => wrapper.findAll('button').find((b) => b.text() === label);
const queueCalls = () => mocks.api.get.mock.calls.filter(([url]) => url === '/support-tickets');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { id: 7, role: 'super_admin' };
  const tenant = { id: 2, name: 'ITSCO', organization_type: 'agency' };
  Object.assign(mocks.agency, { currentAgency: tenant, agencies: [tenant], userAgencies: [tenant] });
  mocks.route.query = {};
  mocks.api.get.mockImplementation(async (url, options) => {
    if (url === '/support-tickets') {
      const params = options.params;
      let rows = params.mine ? [assignedTicket] : [assignedTicket, otherTicket];
      if (params.displayStatus) rows = rows.filter((t) => t.display_status === params.displayStatus);
      return { data: rows };
    }
    // The current user did not submit either queue ticket.
    if (url === '/support-tickets/mine') return { data: [] };
    if (url === '/support-tickets/metrics') return { data: { open: 0, in_progress: 2, mine: 1 } };
    if (url === '/support-tickets/101/messages') return {
      data: { ticket: assignedTicket, messages: [{ id: 1, body: 'Please help with this request', author_user_id: 99 }] }
    };
    return { data: {} };
  });
});

afterEach(() => wrapper?.unmount());

async function render(props = {}) {
  wrapper = shallowMount(TicketDeskView, { props });
  await flushPromises();
}

describe('TicketDeskView queue navigation', () => {
  it('opens an assigned ticket from My tickets without switching to submitted tickets', async () => {
    await render();
    await button('My tickets').trigger('click');
    await flushPromises();
    expect(queueCalls().at(-1)[1].params).toMatchObject({ agencyId: 2, mine: true });
    expect(mocks.api.get.mock.calls.some(([url]) => url === '/support-tickets/mine')).toBe(false);
    expect(wrapper.findAll('.ticket-row')).toHaveLength(1);
    await wrapper.find('.ticket-row').trigger('click');
    await flushPromises();
    expect(wrapper.find('.detail-id').text()).toBe('Ticket #101');
    expect(wrapper.text()).toContain('Please help with this request');
  });

  it('clears the Open-only filter when switching to My tickets or back to all', async () => {
    mocks.route.query = { status: 'open' };
    await render();
    expect(wrapper.findAll('.ticket-row')).toHaveLength(0);
    await button('My tickets').trigger('click');
    await flushPromises();
    expect(queueCalls().at(-1)[1].params.displayStatus).toBeUndefined();
    expect(wrapper.findAll('.ticket-row')).toHaveLength(1);
    await button('Show all tickets').trigger('click');
    await flushPromises();
    expect(queueCalls().at(-1)[1].params.mine).toBeUndefined();
    expect(wrapper.findAll('.ticket-row')).toHaveLength(2);
  });

  it('loads assigned in-progress tickets from a My tickets link and refreshes metrics', async () => {
    mocks.route.query = { mine: 'true', status: 'in_progress' };
    await render();
    expect(wrapper.findAll('.ticket-row')).toHaveLength(1);
    expect(queueCalls().at(-1)[1].params).toMatchObject({ mine: true, displayStatus: 'in_progress' });
    expect(wrapper.findAll('.metric-value').map((el) => el.text())).toEqual(['0', '2', '0', '0']);
    await button('Refresh').trigger('click');
    await flushPromises();
    expect(mocks.api.get.mock.calls.filter(([url]) => url === '/support-tickets/metrics')).toHaveLength(2);
  });

  it('loads the in-progress queue when its metric is clicked', async () => {
    mocks.route.query = { status: 'open' };
    await render();
    await wrapper.findAll('.metric-card')[1].trigger('click');
    await flushPromises();
    expect(queueCalls().at(-1)[1].params.displayStatus).toBe('in_progress');
    expect(wrapper.findAll('.ticket-row')).toHaveLength(2);
  });

  it('clears an empty status filter while preserving the tenant and assignment scope', async () => {
    mocks.route.query = { mine: 'true', status: 'open' };
    await render();
    await button('Clear filters').trigger('click');
    await flushPromises();
    expect(queueCalls().at(-1)[1].params).toEqual({ limit: 80, agencyId: 2, mine: true });
    expect(wrapper.findAll('.ticket-row')).toHaveLength(1);
  });

  it.each([
    ['school_staff', {}],
    ['super_admin', { mode: 'mine' }]
  ])('keeps submitted-ticket access for %s with %j', async (role, props) => {
    mocks.auth.user.role = role;
    await render(props);
    expect(mocks.api.get).toHaveBeenCalledWith('/support-tickets/mine', expect.any(Object));
    expect(queueCalls()).toHaveLength(0);
  });
});
