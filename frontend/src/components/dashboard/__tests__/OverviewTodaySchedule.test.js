import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import OverviewTodaySchedule from '../OverviewTodaySchedule.vue';

vi.mock('../../../store/branding', () => ({
  useBrandingStore: () => ({ getOrganizationOwnIconUrl: () => null })
}));

describe('OverviewTodaySchedule meeting rejoin', () => {
  it('keeps navigation available but never presents a pending or failed request as an empty day', async () => {
    const wrapper = mount(OverviewTodaySchedule, { props: { loading: true } });
    expect(wrapper.text()).toContain('Loading today’s schedule');
    expect(wrapper.text()).not.toContain('0 appointments');
    expect(wrapper.text()).not.toContain('No appointments');
    expect(wrapper.get('.ov-card-head button').text()).toBe('View Full Schedule');
    await wrapper.setProps({ loading: false, error: 'Schedule unavailable' });
    expect(wrapper.text()).not.toContain('No appointments');
    await wrapper.get('.card-status button').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
    wrapper.unmount();
  });

  it('shows Join for an in-progress platform meeting and emits the selected item', async () => {
    const meeting = {
      id: 'sched-team_meeting-42',
      kind: 'team_meeting',
      title: 'Meeting',
      timeLabel: '7:00 AM – 8:00 AM',
      status: 'in_progress',
      startMs: Date.now() - 60000,
      endMs: Date.now() + 60000,
      joinUrl: '/join/team-meeting/host-token'
    };
    const wrapper = mount(OverviewTodaySchedule, {
      props: { items: [meeting] }
    });

    const join = wrapper.find('.ov-join-btn');
    expect(join.exists()).toBe(true);
    await join.trigger('click');
    expect(wrapper.emitted('join')).toEqual([[meeting]]);
  });

  it('drops elapsed appointments even when the appointment status is scheduled', () => {
    const now = Date.now();
    const wrapper = mount(OverviewTodaySchedule, { props: { items: [
      { id: 1, title: 'Past appointment', status: 'scheduled', startMs: now - 7200000, endMs: now - 3600000 },
      { id: 2, title: 'Next appointment', status: 'scheduled', startMs: now + 3600000, endMs: now + 7200000 }
    ] } });
    expect(wrapper.text()).toContain('Next appointment');
    expect(wrapper.text()).not.toContain('Past appointment');
    wrapper.unmount();
  });

  it('does not offer rejoin after a meeting is completed', () => {
    const wrapper = mount(OverviewTodaySchedule, {
      props: {
        items: [{
          id: 'sched-team_meeting-43',
          kind: 'team_meeting',
          title: 'Meeting',
          timeLabel: '6:00 AM – 7:00 AM',
          status: 'completed',
          joinUrl: '/join/team-meeting/participant-token'
        }]
      }
    });

    expect(wrapper.find('.ov-join-btn').exists()).toBe(false);
  });
});
