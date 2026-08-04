import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MeetingSessionExitPanel from '../MeetingSessionExitPanel.vue';

describe('MeetingSessionExitPanel', () => {
  it('prominently identifies who closed a team meeting and when', () => {
    const wrapper = mount(MeetingSessionExitPanel, {
      props: {
        variant: 'host-ended',
        canRejoin: false,
        closedByName: 'Morgan Admin',
        closedAt: '2026-08-04T13:38:00Z'
      }
    });

    expect(wrapper.get('h2').text()).toBe('Team meeting was closed');
    expect(wrapper.get('.mse__closure').text()).toContain('Team meeting was closed by Morgan Admin.');
    expect(wrapper.get('.mse__closure').text()).toContain('2026');
    expect(wrapper.find('button.btn-primary').text()).toBe('Back to my schedule');
    expect(wrapper.text()).not.toContain('Rejoin meeting');
  });
});
