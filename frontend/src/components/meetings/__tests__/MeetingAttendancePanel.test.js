import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MeetingAttendancePanel from '../MeetingAttendancePanel.vue';

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../../services/api', () => ({ default: apiMock }));

describe('MeetingAttendancePanel', () => {
  it('shows departed attendees with recorded time instead of hiding them as absent',async()=>{
    apiMock.get.mockResolvedValue({data:{meetingCompletedAt:'2026-09-21T23:06:00Z',participants:[{userId:7,name:'Attended person',isPresent:false,totalMinutes:59.3,segmentCount:3},{userId:8,name:'Absent person',isPresent:false,totalMinutes:0}]}});
    const wrapper=mount(MeetingAttendancePanel,{props:{eventId:42},global:{stubs:{MeetingParticipantsDetails:true}}});await flushPromises();
    expect(wrapper.text()).toContain('Attended person');expect(wrapper.text()).toContain('59.3m');expect(wrapper.text()).not.toContain('No attendance recorded');expect(wrapper.text()).toContain('1 did not attend');wrapper.unmount();
  });

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
      global: {stubs:{MeetingParticipantsDetails:true}},
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
      global: {stubs:{MeetingParticipantsDetails:true}},
      props: { eventId: 42, trackingEnabled: false }
    });
    await flushPromises();

    expect(wrapper.emitted('tracking-status')?.at(-1)).toEqual([true]);
    wrapper.unmount();
  });
});
