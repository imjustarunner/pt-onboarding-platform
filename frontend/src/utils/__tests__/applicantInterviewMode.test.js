import { afterEach, describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
const auth = vi.hoisted(() => ({ isAuthenticated: true, user: { id: 90, first_name: 'Stored', last_name: 'Staff', profile_photo_url: '/staff-photo' } }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => auth }));
import { applicantInterviewMode, setApplicantInterviewMode } from '../applicantInterviewMode';
import api from '../../services/api';
import { startLiveMeetingPresence } from '../liveMeetingPresence';
import Room from '../../components/supervision/SupervisionVideoRoom.vue';
import Video from '../../components/video/VideoSessionRoom.vue';
afterEach(() => { setApplicantInterviewMode(false); vi.restoreAllMocks(); });
describe('applicant presentation does not inherit staff identity or session locks', () => {
  it.each(['SESSION_LOCKED','SESSION_EXPIRED','MFA_REQUIRED','ACTIVITY_REVIEW_REQUIRED'])('does not interrupt token-only entry with %s', async code => {
    setApplicantInterviewMode(true);
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const error = { response: { status:403, data:{error:{code}} }, config:{skipAuthRedirect:true,url:'/team-meetings/join-info/'+'a'.repeat(32)} };
    await expect(api.interceptors.response.handlers[0].rejected(error)).rejects.toBe(error);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('restores normal staff session enforcement when leaving applicant mode', async () => {
    setApplicantInterviewMode(true); setApplicantInterviewMode(false); expect(applicantInterviewMode.value).toBe(false);
    const dispatch=vi.spyOn(window,'dispatchEvent');
    const error={response:{status:423,data:{error:{code:'SESSION_LOCKED'}}},config:{skipAuthRedirect:true,url:'/users/me'}};
    await expect(api.interceptors.response.handlers[0].rejected(error)).rejects.toBe(error);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({type:'pt:session-security'}));
  });
  it('uses the server-owned applicant name and never the stored staff photo', () => {
    const w=shallowMount(Room,{props:{token:'token',vonageSessionId:'session',applicationId:'project',localDisplayName:'Jamie Applicant',localRoleLabel:'Applicant'},global:{stubs:{VideoSessionRoom:{name:'VideoSessionRoom',props:['localName','localProfilePhotoUrl'],template:'<div />'}}}});
    expect(w.findComponent(Video).props()).toMatchObject({localName:'You · Applicant · Jamie Applicant',localProfilePhotoUrl:''});w.unmount();
  });
  it('does not renew a stored staff login through applicant video presence',()=>{
    localStorage.setItem('user',JSON.stringify({id:90}));localStorage.setItem('sessionId','staff-session');
    setApplicantInterviewMode(true);const write=vi.spyOn(Storage.prototype,'setItem');const stop=startLiveMeetingPresence();
    expect(write).not.toHaveBeenCalled();stop();localStorage.removeItem('user');localStorage.removeItem('sessionId');
  });
});
