import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import OverviewTodaySchedule from '../OverviewTodaySchedule.vue';

vi.mock('../../../store/branding', () => ({
  useBrandingStore: () => ({ getOrganizationOwnIconUrl: () => null })
}));

describe('OverviewTodaySchedule meeting rejoin', () => {
  it('shows Join for an in-progress platform meeting and emits the selected item', async () => {
    const meeting = {
      id: 'sched-team_meeting-42',
      kind: 'team_meeting',
      title: 'Meeting',
      timeLabel: '7:00 AM – 8:00 AM',
      status: 'in_progress',
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
