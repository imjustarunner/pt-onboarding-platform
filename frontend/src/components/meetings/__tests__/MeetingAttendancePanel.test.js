import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MeetingAttendancePanel from '../MeetingAttendancePanel.vue';

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../../services/api', () => ({ default: apiMock }));

describe('MeetingAttendancePanel', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.get.mockResolvedValue({
      data: {
        attendanceTrackingEnabled: false,
        timingTracked: false,
        participants: [{ userId: 7, name: 'Alex Participant', isPresent: true, totalMinutes: null }],
        copyNamesCsv: 'Alex Participant',
        copyNamesWithTimeCsv: ''
      }
    });
  });

  it('shows live participants without implying their time is tracked', async () => {
    const wrapper = mount(MeetingAttendancePanel, {
      props: { eventId: 42, trackingEnabled: false }
    });
    await flushPromises();

    expect(wrapper.get('h4').text()).toContain('Participants');
    expect(wrapper.get('.map__live-only').text()).toContain('attendance time is not being tracked');
    expect(wrapper.text()).toContain('Alex Participant');
    expect(wrapper.text()).toContain('In room');
    expect(wrapper.text()).not.toContain('Copy with time');
    expect(wrapper.find('.map__mins').exists()).toBe(false);
    expect(wrapper.emitted('tracking-status')?.at(-1)).toEqual([false]);

    wrapper.unmount();
  });

  it('pushes server-confirmed tracking activation to the meeting view', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        attendanceTrackingEnabled: true,
        timingTracked: true,
        participants: [{ userId: 7, name: 'Alex Participant', isPresent: true, totalMinutes: 1.25 }]
      }
    });
    const wrapper = mount(MeetingAttendancePanel, {
      props: { eventId: 42, trackingEnabled: false }
    });
    await flushPromises();

    expect(wrapper.emitted('tracking-status')?.at(-1)).toEqual([true]);
    wrapper.unmount();
  });
});
