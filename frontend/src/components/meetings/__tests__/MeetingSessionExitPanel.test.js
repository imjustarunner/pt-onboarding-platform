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
    expect(wrapper.find('button.btn-primary').text()).toBe('Back to portal');
    expect(wrapper.text()).not.toContain('Rejoin meeting');
  });
});


it('offers rejoin after a solo timeout and keeps ending the meeting an explicit host action', async () => {
  const wrapper=mount(MeetingSessionExitPanel,{props:{variant:'alone-timeout',canRejoin:true,canEndMeeting:true}});
  expect(wrapper.text()).toContain('meeting has not been marked complete');
  expect(wrapper.emitted('end-meeting')).toBeUndefined();
  await wrapper.findAll('button').find(b=>b.text()==='End meeting for everyone').trigger('click');
  expect(wrapper.emitted('end-meeting')).toHaveLength(1);
  await wrapper.setProps({canEndMeeting:false});
  expect(wrapper.text()).not.toContain('End meeting for everyone');
  wrapper.unmount();
});
