import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Sender from '../ConversaSender.vue';
import Mailbox from '../ConversaMailbox.vue';
import ConversationList from '../../unifiedInbox/UnifiedConversationList.vue';

vi.mock('../../../store/agency', () => ({
  useAgencyStore: () => ({
    currentAgency: { id: 2, name: 'Receiving Practice', logo_url: '/assets/practice.svg' },
    userAgencies: [{ id: 3, name: 'Other Practice', logo_url: '/assets/other.svg' }]
  })
}));

describe('Conversa sender and organization identity', () => {
  it('keeps sender name, address, and explicit sending organization visible', () => {
    const wrapper = mount(Sender, { props: { name: 'Sarah Mitchell', address: 'sarah@example.test', organization: { name: 'Sending Practice', logo_url: '/assets/sender.svg' } } });
    expect(wrapper.text()).toContain('Sarah Mitchell');
    expect(wrapper.text()).toContain('sarah@example.test');
    expect(wrapper.text()).toContain('Sending Practice');
    expect(wrapper.find('img').attributes('src')).toBe('/assets/sender.svg');
    wrapper.unmount();
  });

  it('falls back to initials when a logo fails and recovers when the organization changes', async () => {
    const wrapper = mount(Sender, { props: { organization: { name: 'First Practice', logo_url: '/assets/missing.svg' } } });
    await wrapper.find('img').trigger('error');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.conversa-sender__avatar').text()).toBe('FP');
    await wrapper.setProps({ organization: { name: 'Other Practice', logo_url: '/assets/other.svg' } });
    expect(wrapper.find('img').attributes('src')).toBe('/assets/other.svg');
    wrapper.unmount();
  });

  it('uses the conversation organization rather than the active organization for mailbox context', async () => {
    const wrapper = mount(Mailbox, { props: { conversation: { agency_id: 3, inbox_display_name: 'Support', inbox_from_email: 'support@example.test' } } });
    expect(wrapper.text()).toContain('Via Other Practice · Support');
    expect(wrapper.text()).not.toContain('Receiving Practice');
    expect(wrapper.find('img').attributes('src')).toBe('/assets/other.svg');
    await wrapper.setProps({ conversation: { agency_id: 999, inbox_display_name: 'External mailbox' } });
    expect(wrapper.text()).toBe('Via External mailbox');
    expect(wrapper.find('img').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens conversations by keyboard and keeps email distinct from secure messaging', async () => {
    const wrapper = mount(ConversationList, { props: { conversations: [
      { id: 10, agency_id: 2, channel: 'email', primary_participant_name: 'External Sender', subject: 'Follow-up', inbox_display_name: 'Care' },
      { id: 20, agency_id: 3, channel: 'secure', primary_participant_name: 'Care Team', subject: 'Plan' }
    ] } });
    const rows = wrapper.findAll('.uc-list-items > li');
    expect(rows[0].text()).toContain('External Sender');
    expect(rows[0].text()).toContain('Via Receiving Practice');
    expect(rows[0].find('.conversa-badge').text()).toBe('Email');
    expect(rows[1].find('.conversa-badge').text()).toBe('Secure message');
    await rows[0].trigger('keydown', { key: 'Enter' });
    await rows[1].trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('select')).toEqual([[10], [20]]);
    wrapper.unmount();
  });
});
