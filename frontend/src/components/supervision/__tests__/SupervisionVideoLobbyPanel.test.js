import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SupervisionVideoLobbyPanel from '../SupervisionVideoLobbyPanel.vue';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}));
const sound = vi.hoisted(() => ({play:vi.fn(),enable:vi.fn(),cancelPending:vi.fn(),dispose:vi.fn()}));
vi.mock('../../../utils/waitingRoomChime',()=>({createWaitingRoomChime:()=>sound}));

vi.mock('../../../services/api', () => ({ default: apiMock }));

describe('SupervisionVideoLobbyPanel admit-all behavior', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.get.mockResolvedValue({
      data: {
        waitingRoomEnabled: true,
        participants: [
          { userId: 11, joinIdentity: 'user-11', displayName: 'One' },
          { userId: 12, joinIdentity: 'user-12', displayName: 'Two' }
        ]
      }
    });
    apiMock.post.mockResolvedValue({
      data: { ok: true, waitingRoomEnabled: false, admittedCount: 2 }
    });
  });

  it('admits the lobby and disables the waiting room in one operation', async () => {
    const wrapper = mount(SupervisionVideoLobbyPanel, {
      props: {
        sessionId: 42,
        isSupervisor: true,
        meetingKind: 'team-meeting'
      }
    });
    await flushPromises();

    const admitAll = wrapper.find('.lobby-panel-admit-all');
    expect(admitAll.text()).toContain('Admit all & open room (2)');
    expect(wrapper.get('[role="status"]').text()).toContain('One, Two joined the waiting room. 2 waiting for admission.');
    await admitAll.trigger('click');
    await flushPromises();

    expect(apiMock.post).toHaveBeenCalledWith(
      '/team-meetings/42/waiting-room',
      { enabled: false, admitWaiting: true },
      { skipGlobalLoading: true, skipAuthRedirect: true }
    );
    expect(wrapper.emitted('update:waitingCount')?.at(-1)).toEqual([0]);
    expect(wrapper.find('.lobby-panel').exists()).toBe(false);

    wrapper.unmount();
  });
});

describe('host and cohost waiting-room alerts',()=>{
 let wrapper, people, guests;
 beforeEach(()=>{
  vi.clearAllMocks();vi.useFakeTimers();people=[];guests=[];
  apiMock.get.mockImplementation(async path=>({data:path.endsWith('/calendar-guests')?{guests}:{waitingRoomEnabled:true,participants:people}}));
  apiMock.post.mockResolvedValue({data:{ok:true}});
 });
 afterEach(()=>{wrapper?.unmount();vi.clearAllTimers();vi.useRealTimers();});
 const render=async(meetingKind='supervision',isSupervisor=true)=>{
  wrapper=mount(SupervisionVideoLobbyPanel,{props:{sessionId:42,meetingKind,isSupervisor}});await flushPromises();
 };
 it.each(['supervision','team-meeting'])('alerts facilitator clients for %s without repeated polling dings',async kind=>{
  await render(kind);expect(sound.play).not.toHaveBeenCalled();
  people=[{userId:11,joinIdentity:'user-11',displayName:'Rachel'}];await vi.advanceTimersByTimeAsync(4000);await flushPromises();
  expect(sound.play).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(12000);await flushPromises();expect(sound.play).toHaveBeenCalledOnce();
  apiMock.get.mockRejectedValueOnce(new Error('offline'));await vi.advanceTimersByTimeAsync(4000);await flushPromises();
  expect(wrapper.findComponent({name:'WaitingRoomAlerts'}).props('participants')).toHaveLength(1);
  expect(sound.play).toHaveBeenCalledOnce();
 });
 it('does not poll or play host alerts for an attendee',async()=>{
  await render('supervision',false);await vi.advanceTimersByTimeAsync(10000);expect(apiMock.get).not.toHaveBeenCalled();expect(sound.play).not.toHaveBeenCalled();
 });
 it('includes calendar guests and allows admission directly from the floating notice',async()=>{
  guests=[{id:99,displayName:'Calendar Guest'}];await render('team-meeting');expect(sound.play).toHaveBeenCalledOnce();
  const alerts=wrapper.findComponent({name:'WaitingRoomAlerts'}),person=alerts.props('participants')[0];
  expect(person.alertKey).toBe('calendar:99');alerts.vm.$emit('admit',person);await flushPromises();
  expect(apiMock.post).toHaveBeenCalledWith('/team-meetings/42/calendar-guests/99/admit');
 });
 it('ignores an old meeting’s delayed lobby response after switching sessions',async()=>{
  let resolveOld;
  apiMock.get.mockImplementation(path=>path==='/supervision/sessions/42/lobby-participants'
    ? new Promise(resolve=>{resolveOld=resolve;}) : Promise.resolve({data:{participants:[],guests:[]}}));
  await render();await wrapper.setProps({sessionId:43});await flushPromises();
  resolveOld({data:{participants:[{userId:11,joinIdentity:'user-11',displayName:'Old meeting'}]}});await flushPromises();
  expect(wrapper.findComponent({name:'WaitingRoomAlerts'}).props('participants')).toEqual([]);expect(sound.play).not.toHaveBeenCalled();
 });
});
