import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),finish:vi.fn(),host:true}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('../../../utils/finishMeetingTranscription',()=>({finishMeetingTranscription:m.finish}));
vi.mock('../../../utils/orgScopedPath',()=>({resolveHostImpliedPortalSlug:()=>''}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({isAuthenticated:true,user:{id:9}})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{sessionId:'101',organizationSlug:'tenant'},fullPath:'/tenant/join/supervision/101'}),useRouter:()=>({replace:vi.fn(),push:vi.fn()})}));
import JoinSupervisionView from '../JoinSupervisionView.vue';
let wrapper;
beforeEach(()=>{
  vi.clearAllMocks();vi.useFakeTimers();m.host=true;
  m.get.mockImplementation(async url=>({data:url.includes('join-info')?{orgSlug:'tenant',sessionId:101}:{token:'video',sessionId:'room',applicationId:'app',supervisionSessionId:101,isSupervisor:m.host,identity:'user-9',sessionType:'group',hostPresent:true}}));
  m.post.mockResolvedValue({data:{ok:true}});m.finish.mockResolvedValue(true);
});
afterEach(()=>{wrapper?.unmount();vi.clearAllTimers();vi.useRealTimers();});
async function render(){wrapper=mount(JoinSupervisionView,{global:{stubs:{SupervisionLiveRoom:true,MeetingSessionExitPanel:true}}});await flushPromises();return wrapper.findComponent({name:'SupervisionLiveRoom'});}
describe('supervision leave versus explicit meeting closure',()=>{
  it.each([false,true])('leave-only never ends the room or transcript (host/cohost=%s)',async host=>{
    m.host=host;const room=await render();room.vm.$emit('leave',{endForAll:false});await flushPromises();
    expect(m.post).toHaveBeenCalledWith('/supervision/sessions/101/join-presence',expect.objectContaining({action:'leave'}),expect.any(Object));
    expect(m.post.mock.calls.some(([url])=>url.endsWith('/end-live'))).toBe(false);expect(m.finish).not.toHaveBeenCalled();
    const exit=wrapper.findComponent({name:'MeetingSessionExitPanel'});expect(exit.props('canRejoin')).toBe(true);
    exit.vm.$emit('rejoin');await flushPromises();expect(wrapper.findComponent({name:'SupervisionLiveRoom'}).exists()).toBe(true);
  });
  it('does not treat a truthy non-boolean leave payload as ending for everyone',async()=>{
    const room=await render();room.vm.$emit('leave',{endForAll:'false'});await flushPromises();
    expect(m.post.mock.calls.some(([url])=>url.endsWith('/end-live'))).toBe(false);
  });
  it('ends for everyone only on the explicit end action',async()=>{
    const room=await render();room.vm.$emit('leave',{endForAll:true});await flushPromises();
    expect(m.post).toHaveBeenCalledWith('/supervision/sessions/101/end-live',{},expect.any(Object));expect(m.finish).toHaveBeenCalledOnce();
    expect(wrapper.findComponent({name:'MeetingSessionExitPanel'}).props('canRejoin')).toBe(false);
  });
});
