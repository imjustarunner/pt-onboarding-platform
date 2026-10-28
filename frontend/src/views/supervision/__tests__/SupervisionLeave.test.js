import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),finish:vi.fn(),host:true,query:{},replace:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('../../../utils/finishMeetingTranscription',()=>({finishMeetingTranscription:m.finish}));
vi.mock('../../../utils/orgScopedPath',()=>({resolveHostImpliedPortalSlug:()=>''}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({isAuthenticated:true,user:{id:9}})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{sessionId:'101',organizationSlug:'tenant'},query:m.query,fullPath:'/tenant/join/supervision/101'}),useRouter:()=>({replace:m.replace,push:vi.fn()})}));
import JoinSupervisionView from '../JoinSupervisionView.vue';
let wrapper;
beforeEach(()=>{
  vi.clearAllMocks();vi.useFakeTimers();m.host=true;m.query={};vi.spyOn(window,'confirm').mockReturnValue(true);
  m.get.mockImplementation(async url=>({data:url.includes('join-info')?{orgSlug:'tenant',sessionId:101}:{token:'video',sessionId:'room',applicationId:'app',supervisionSessionId:101,isSupervisor:m.host,identity:'user-9',sessionType:'group',hostPresent:true}}));
  m.post.mockResolvedValue({data:{ok:true,canEndForEveryone:true}});m.finish.mockResolvedValue(true);
});
afterEach(()=>{wrapper?.unmount();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});
async function render(){wrapper=mount(JoinSupervisionView,{global:{stubs:{SupervisionLiveRoom:true,MeetingSessionExitPanel:true}}});await flushPromises();return wrapper.findComponent({name:'SupervisionLiveRoom'});}
describe('supervision leave versus explicit meeting closure',()=>{
  it('lets a declined invitee explicitly update RSVP and join using their account',async()=>{
    const get=m.get.getMockImplementation();let accepted=false;
    m.get.mockImplementation(async(url,...args)=>{
      if(url.endsWith('/video-token')&&!accepted)throw {response:{status:403,data:{error:{message:'Access denied'}}}};
      if(url.endsWith('/rsvp'))return {data:{status:'DECLINED',canAccept:true}};
      return get(url,...args);
    });
    m.post.mockImplementation(async(url,body)=>{if(url.endsWith('/rsvp')){expect(body).toEqual({response:'accepted',reason:''});accepted=true;}return {data:{ok:true}};});
    await render();expect(wrapper.text()).toContain('You previously RSVP’d not attending');
    expect(accepted).toBe(false);
    await wrapper.findAll('button').find(b=>b.text()==='Update RSVP and join').trigger('click');await flushPromises();
    expect(accepted).toBe(true);expect(wrapper.findComponent({name:'SupervisionLiveRoom'}).exists()).toBe(true);
  });
  it.each([false,true])('does not offer RSVP recovery without permission (missing invitation=%s)',async missing=>{
    const get=m.get.getMockImplementation();
    m.get.mockImplementation(async(url,...args)=>{
      if(url.endsWith('/video-token'))throw {response:{status:403,data:{error:{message:'Access denied'}}}};
      if(url.endsWith('/rsvp')){if(missing)throw {response:{status:404}};return {data:{status:'DECLINED',canAccept:false}};}
      return get(url,...args);
    });
    await render();expect(wrapper.text()).not.toContain('Update RSVP and join');
    expect(m.post.mock.calls.some(([url])=>url.endsWith('/rsvp'))).toBe(false);
  });
  it('preserves account-based entry through the organization redirect',async()=>{
    m.query={account:'1'};m.get.mockResolvedValue({data:{orgSlug:'other-tenant',sessionId:101,joinToken:'101'}});
    await render();expect(m.replace).toHaveBeenCalledWith('/other-tenant/join/supervision/101?account=1');
  });
  it('keeps a retry available after a connection interruption and a failed rejoin request',async()=>{
    const room=await render();
    room.vm.$emit('disconnected',{reason:'networkDisconnected'});await flushPromises();
    const exit=wrapper.findComponent({name:'MeetingSessionExitPanel'});
    expect(exit.props()).toMatchObject({variant:'connection-lost',canRejoin:true});
    m.get.mockRejectedValueOnce({response:{status:503,data:{error:{message:'Temporarily unavailable'}}}});
    exit.vm.$emit('rejoin');await flushPromises();
    expect(wrapper.text()).toContain('Temporarily unavailable');
    const retry=wrapper.get('button.join-login-btn--secondary');
    await retry.trigger('click');await flushPromises();
    expect(wrapper.findComponent({name:'SupervisionLiveRoom'}).exists()).toBe(true);
    expect(m.post.mock.calls.some(([url])=>url.endsWith('/end-live'))).toBe(false);
    expect(m.finish).not.toHaveBeenCalled();
    expect(m.post).toHaveBeenCalledWith('/supervision/sessions/101/connection-events',expect.objectContaining({event:'join-request-failed',code:503}),expect.any(Object));
    expect(m.get).toHaveBeenLastCalledWith('/supervision/sessions/101/video-token',expect.objectContaining({skipGlobalLoading:true}));
  });
  it('still respects a server-ended room when retrying after a network interruption',async()=>{
    const room=await render();room.vm.$emit('disconnected',{reason:'networkDisconnected'});await flushPromises();
    m.get.mockRejectedValueOnce({response:{status:410,data:{liveEndedAt:'2026-10-13T20:00:00Z'}}});
    wrapper.findComponent({name:'MeetingSessionExitPanel'}).vm.$emit('rejoin');await flushPromises();
    expect(wrapper.findComponent({name:'MeetingSessionExitPanel'}).props()).toMatchObject({variant:'host-ended',canRejoin:false});
    expect(wrapper.findComponent({name:'SupervisionLiveRoom'}).exists()).toBe(false);
  });
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
  it('does not end the meeting or transcript when the supervisor cancels confirmation', async () => {
    const room = await render(); window.confirm.mockReturnValue(false);
    room.vm.$emit('leave', { endForAll: true }); await flushPromises();
    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to end this meeting for everyone?');
    expect(m.finish).not.toHaveBeenCalled();
    expect(m.post.mock.calls.some(([url]) => url.endsWith('/end-live'))).toBe(false);
    expect(wrapper.findComponent({ name: 'SupervisionLiveRoom' }).exists()).toBe(true);
  });
  it('ends for everyone only on the explicit end action',async()=>{
    const room=await render();room.vm.$emit('leave',{endForAll:true});await flushPromises();
    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to end this meeting for everyone?');
    expect(m.post).toHaveBeenCalledWith('/supervision/sessions/101/end-live',{},expect.any(Object));expect(m.finish).toHaveBeenCalledOnce();
    expect(wrapper.findComponent({name:'MeetingSessionExitPanel'}).props('canRejoin')).toBe(false);
  });
  it('does not finish the transcript or end the room when the viewer is not the assigned supervisor',async()=>{
    const alert=vi.spyOn(window,'alert').mockImplementation(()=>{});
    m.post.mockResolvedValue({data:{ok:true,canEndForEveryone:false}});
    const room=await render();expect(room.props('canEndForEveryone')).toBe(false);
    room.vm.$emit('leave',{endForAll:true});await flushPromises();
    expect(m.finish).not.toHaveBeenCalled();expect(m.post.mock.calls.some(([url])=>url.endsWith('/end-live'))).toBe(false);
    expect(room.exists()).toBe(true);alert.mockRestore();
  });
  it('keeps the user connected when the server rejects stale end permission',async()=>{
    const alert=vi.spyOn(window,'alert').mockImplementation(()=>{});
    m.finish.mockRejectedValue({response:{status:403,data:{error:{message:'Only the assigned supervisor may end this meeting'}}}});
    const room=await render();room.vm.$emit('leave',{endForAll:true});await flushPromises();
    expect(m.post.mock.calls.some(([url])=>url.endsWith('/end-live'))).toBe(false);
    expect(wrapper.findComponent({name:'SupervisionLiveRoom'}).props('canEndForEveryone')).toBe(false);
    expect(wrapper.findComponent({name:'MeetingSessionExitPanel'}).exists()).toBe(false);alert.mockRestore();
  });
});
