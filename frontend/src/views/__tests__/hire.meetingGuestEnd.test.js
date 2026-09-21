// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
vi.mock('../../store/auth', () => ({ useAuthStore: () => ({ user: null }) }));
import SupervisionVideoRoom from '../../components/supervision/SupervisionVideoRoom.vue';
import VideoSessionRoom from '../../components/video/VideoSessionRoom.vue';

describe('interview guest end signal', () => {
  it('passes the video signal through the shared room to the interview page', async () => {
    const room = shallowMount(SupervisionVideoRoom, { props: { token: 'test-token', vonageSessionId: 'test-session', applicationId: 'test-project' }, global: { stubs: { VideoSessionRoom: { name: 'VideoSessionRoom', inheritAttrs: false, template: '<div />' } } } });
    const payload = { interviewGuestEnded: true, headline: 'Your interview has ended' };
    room.findComponent(VideoSessionRoom).vm.$emit('interview-guest-ended', payload);
    expect(room.emitted('interview-guest-ended')).toEqual([[payload]]);
    expect(room.emitted('meeting-ended')).toBeUndefined();
    room.unmount();
  });
});
