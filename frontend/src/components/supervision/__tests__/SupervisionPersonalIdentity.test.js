import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ isAuthenticated: true, user: { id: 999, first_name: 'Different', last_name: 'Account', profile_photo_url: '/different.jpg' } }) }));
import SupervisionVideoRoom from '../SupervisionVideoRoom.vue';
import { saveSupervisionAccess } from '../../../utils/supervisionInvitationAccess';
describe('personal invitation display identity', () => {
  it('uses the link recipient name and photo rather than another signed-in account', () => {
    saveSupervisionAccess({ sessionId: 29, token: 'scoped', expiresAt: Date.now() + 60000 });
    const wrapper = mount(SupervisionVideoRoom, { props: { sessionId: 29, token: 'video', vonageSessionId: 'room', applicationId: 'app', localDisplayName: 'Rachel Example', localRoleLabel: 'Supervisee' }, global: { stubs: { VideoSessionRoom: true } } });
    const video = wrapper.findComponent({ name: 'VideoSessionRoom' });
    expect(video.props('localName')).toBe('You · Supervisee · Rachel Example');
    expect(video.props('localProfilePhotoUrl')).toBe(''); wrapper.unmount();
  });
});
