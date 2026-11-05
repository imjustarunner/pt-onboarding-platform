import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, shallowMount } from '@vue/test-utils';
import Sidebar from '../UnifiedInboxSidebar.vue';
import List from '../UnifiedConversationList.vue';
import Thread from '../UnifiedConversationThread.vue';
import { isTicketedGroup } from '../../../utils/groupEmailPresentation';

vi.mock('../../../services/api', () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 }, userAgencies: [] }) }));

const payroll = { id: 21, kind: 'shared', is_ticketed_group: true, group_key: 'payroll', display_name: 'Payroll', from_email: 'payroll@example.org' };
const personal = { id: 31, kind: 'personal', identity_key: 'personal_5', display_name: 'My inbox', from_email: 'sam@example.org' };
let wrapper;
afterEach(() => wrapper?.unmount());

describe('Group Email ownership workflow', () => {
  it('keeps a non-SSO personal group mailbox outside department navigation', async () => {
    wrapper = mount(Sidebar, { props: { inboxes: [{ id: null, display_name: 'All inboxes' }, { id: 'group_email', kind: 'virtual', is_ticketed_group: true }, payroll, personal] }, global: { stubs: { PersonalMessageDeliverySettings: true } } });
    const groupNav = wrapper.get('nav[aria-label="Department group email"]');
    expect(groupNav.text()).toBe('Payroll');
    expect(wrapper.get('select').text()).toContain('My inbox');
    expect(wrapper.get('select').text()).not.toContain('Payroll');
    await groupNav.get('button').trigger('click');
    expect(wrapper.emitted('update:selectedInboxId')).toEqual([[21]]);
    expect(isTicketedGroup({ ...personal, is_ticketed_group: true })).toBe(false);
    expect(isTicketedGroup({ ...payroll, is_ticketed_group: '0' })).toBe(false);
  });

  it('preserves separate department tickets for the same provider thread', () => {
    wrapper = shallowMount(List, { props: { conversations: [
      { ...payroll, id: 1, agency_id: 2, channel: 'email', external_thread_id: 'thread-1', support_ticket_id: 7, ticket_replied: true },
      { ...payroll, id: 2, group_key: 'billing', agency_id: 2, channel: 'email', external_thread_id: 'thread-1', support_ticket_id: 8, is_unread: true }
    ] } });
    expect(wrapper.findAll('.uc-list-items > li')).toHaveLength(2);
    expect(wrapper.text()).toContain('Ticket #7');
    expect(wrapper.text()).toContain('Replied');
    expect(wrapper.text()).toContain('Available to claim');
  });

  it('offers a claim and an agency-scoped ticket link while keeping email read only', async () => {
    const conversation = { ...payroll, id: 41, agency_id: 2, channel: 'email', support_ticket_id: 7, can_claim_ticket: true, ticket_status: 'open', inbox_from_email: payroll.from_email };
    wrapper = mount(Thread, { props: { detail: { conversation, messages: [], context: {} }, agencyId: 2, organizationSlug: 'agency-two' } });
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.text()).toContain('unread until claimed');
    expect(wrapper.findAll('button').some(button => ['Mark unread', 'Archive', 'Snooze'].includes(button.text()))).toBe(false);
    await wrapper.findAll('button').find(button => button.text() === 'Claim ticket').trigger('click');
    expect(wrapper.emitted('claim-ticket')).toHaveLength(1);
    expect(wrapper.get('a').attributes('href')).toBe('/agency-two/tickets?ticketId=7&agencyId=2');
    await wrapper.get('a').trigger('click');
    expect(wrapper.emitted('open-ticket')).toEqual([[7]]);
    await wrapper.setProps({ detail: { conversation: { ...conversation, ticket_claimed_by_user_id: 5, ticket_replied: true }, messages: [], context: {} } });
    expect(wrapper.findAll('button').some(button => button.text() === 'Claim ticket')).toBe(false);
    expect(wrapper.text()).toContain('Replied');
  });
});
