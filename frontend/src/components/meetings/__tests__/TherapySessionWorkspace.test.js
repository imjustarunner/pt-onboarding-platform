import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,afterEach} from 'vitest';
import { defineComponent, h, onMounted, onBeforeUnmount, reactive, Teleport } from 'vue';
import Workspace from '../TherapySessionWorkspace.vue';
it('keeps AuricWell and tenant identity visible and hides treatment plans from unverified office guests',async()=>{const request=vi.fn(async()=>({artifacts:[]}));const w=mount(Workspace,{props:{request,isHost:true,branding:{agencyName:'Practice A',officeProduct:'auricwell'}},global:{stubs:{VideoSessionRoom:{inheritAttrs:false,template:'<div />'}}}});await flushPromises();expect(w.text()).toContain('AuricWell');expect(w.text()).toContain('Practice A');expect(w.text()).not.toContain('Treatment plan');w.unmount();});
it('loads every page of session content and persists chats to the session API',async()=>{const request=vi.fn(async(path,opts)=>{if(opts.method==='POST')return {artifact:{id:3,role:'client',...opts.body}};return path==='?afterId=0'?{artifacts:[{id:1,type:'chat',role:'provider',payload:{text:'First'}}],hasMore:true,nextCursor:1}:{artifacts:[{id:2,type:'chat',role:'provider',payload:{text:'Second'}}],hasMore:false,nextCursor:2};});const w=mount(Workspace,{props:{request},global:{stubs:{VideoSessionRoom:{inheritAttrs:false,template:'<div />'}}}});await flushPromises();await w.findAll('button').find(b=>b.text()==='Chat').trigger('click');expect(w.text()).toContain('First');expect(w.text()).toContain('Second');await w.find('input[aria-label=Message]').setValue('My response');await w.find('.chat-form').trigger('submit');await flushPromises();expect(request).toHaveBeenCalledWith('',{method:'POST',body:{type:'chat',payload:{text:'My response'}}});expect(w.text()).toContain('My response');w.unmount();});
it('offers verified clients their own treatment plan rating after the provider shares it',async()=>{const request=vi.fn(async()=>({artifacts:[{id:8,type:'share',role:'provider',payload:{mode:'treatment',title:'My goals',goals:[{id:1,text:'Goal one'}]}}]}));const w=mount(Workspace,{props:{request,identified:true},global:{stubs:{VideoSessionRoom:{inheritAttrs:false,template:'<div />'}}}});await flushPromises();expect(w.text()).toContain('Save my rating');expect(w.text()).toContain('Goal one');w.unmount();});

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('starts the office timer on admission and preserves its start across reconnects',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-13T03:00:00Z'));
 const options={props:{request:vi.fn(async()=>({artifacts:[]})),startedAt:null},global:{stubs:{VideoSessionRoom:{inheritAttrs:false,template:'<div />'}}}};
 let w=mount(Workspace,options);await flushPromises();await vi.advanceTimersByTimeAsync(60000);
 expect(w.find('.therapy-clock').text()).toBe('00:00');expect(w.text()).toContain('Ready for your guest');
 const startedAt=new Date().toISOString();await w.setProps({startedAt});await vi.advanceTimersByTimeAsync(65000);expect(w.find('.therapy-clock').text()).toBe('01:05');
 w.unmount();w=mount(Workspace,{...options,props:{...options.props,startedAt}});await flushPromises();expect(w.find('.therapy-clock').text()).toBe('01:05');w.unmount();
 w=mount(Workspace,options);await flushPromises();expect(w.find('.therapy-clock').text()).toBe('00:00');w.unmount();
});

const feelingsShare = { id: 8, type: 'share', role: 'provider', payload: { mode: 'activity', title: 'Feelings explorer', questions: ['How are you feeling?', 'What helps?'] } };
const dockButton = (wrapper, label) => wrapper.findAll('.therapy-dock button').find(button => button.text().startsWith(label));

it('shows a guest’s feelings to the host after polling and keeps responses available after closing the tool', async () => {
  vi.useFakeTimers();
  let includeResponse = false;
  const response = { id: 9, type: 'response', role: 'client', actor: 'guest:4', payload: { shareId: 8, answers: ['Calm', 'Walking outside'] } };
  const request = vi.fn(async (path, options) => {
    if (options.method === 'POST') return { artifact: { id: 10, type: 'share', role: 'provider', payload: { mode: 'video' } } };
    return path === '?afterId=0' ? { artifacts: [feelingsShare], nextCursor: 8 } : { artifacts: includeResponse ? [response] : [], nextCursor: includeResponse ? 9 : 8 };
  });
  const wrapper = mount(Workspace, { props: { request, isHost: true }, global: { stubs: { VideoSessionRoom: true } } });
  await flushPromises();
  expect(wrapper.find('.response-form').exists()).toBe(false);
  expect(wrapper.get('.session-responses').text()).toContain('Waiting for responses');
  includeResponse = true;
  await vi.advanceTimersByTimeAsync(3000);
  expect(wrapper.get('.session-response').text()).toContain('Guest');
  expect(wrapper.get('.session-response').text()).toContain('Walking outside');
  await wrapper.findAll('button').find(button => button.text() === 'Close tool').trigger('click');
  await flushPromises();
  expect(wrapper.find('.therapy-shared').exists()).toBe(false);
  await dockButton(wrapper, 'Responses (1)').trigger('click');
  expect(wrapper.get('.therapy-side').text()).toContain('Feelings explorer');
  expect(wrapper.get('.therapy-side').text()).toContain('Walking outside');
  wrapper.unmount();
});

it('lets guests share feelings while hosts can deliberately open their own response form', async () => {
  const request = vi.fn(async (path, options) => options.method === 'POST'
    ? { artifact: { id: 9, role: 'client', actor: 'guest:4', ...options.body } }
    : { artifacts: [feelingsShare], nextCursor: 8 });
  const wrapper = mount(Workspace, { props: { request }, global: { stubs: { VideoSessionRoom: true } } });
  await flushPromises();
  await wrapper.findAll('.feelings-grid button').find(button => button.text().includes('Calm')).trigger('click');
  await wrapper.findAll('.response-form textarea')[1].setValue('Walking outside');
  await wrapper.get('.response-form').trigger('submit');
  await flushPromises();
  expect(request).toHaveBeenCalledWith('', { method: 'POST', body: { type: 'response', payload: { shareId: 8, answers: ['Calm', 'Walking outside'] } } });
  expect(wrapper.get('.session-responses').text()).toContain('Calm');
  expect(wrapper.get('[role=status]').text()).toContain('visible to everyone');
  await wrapper.setProps({ isHost: true });
  expect(wrapper.find('.response-form').exists()).toBe(false);
  await wrapper.findAll('button').find(button => button.text() === 'Add my own response').trigger('click');
  expect(wrapper.find('.response-form').exists()).toBe(true);
  wrapper.unmount();
});

it.each(['in-page', 'PiP'])('keeps the video connected in %s Mini and expands before opening tools or responses', async mode => {
  vi.stubGlobal('innerWidth', 1440);
  let popup;
  vi.stubGlobal('documentPictureInPicture', mode === 'in-page' ? undefined : { requestWindow: async () => {
    const events = new EventTarget();
    popup = { document: document.implementation.createHTMLDocument(), closed: false, addEventListener: events.addEventListener.bind(events), close() { this.closed = true; events.dispatchEvent(new Event('pagehide')); } };
    return popup;
  } });
  const connected = vi.fn(), disconnected = vi.fn();
  const video = defineComponent({
    name: 'VideoSessionRoom', inheritAttrs: false,
    setup() { onMounted(connected); onBeforeUnmount(disconnected); },
    template: '<div class="same-video">Connected video</div>'
  });
  const wrapper = mount(Workspace, { props: { request: vi.fn(async () => ({ artifacts: [] })) }, global: { stubs: { VideoSessionRoom: video } }, attachTo: document.body });
  await flushPromises();
  const root = wrapper.get('.therapy-workspace').element;
  const originalVideo = root.querySelector('.same-video');
  for (const label of ['Tools', 'Responses (0)', 'Chat', 'Session files']) {
    const click = text => [...root.querySelectorAll('.therapy-dock button')].find(button => button.textContent.startsWith(text)).click();
    click('Mini'); await flushPromises();
    expect(root.classList.contains('therapy-workspace--mini')).toBe(true);
    expect(root.parentElement).toBe(mode === 'PiP' ? popup.document.body : document.body);
    click(label); await flushPromises();
    expect(root.classList.contains('therapy-workspace--mini')).toBe(false);
    expect(root.parentElement).toBe(wrapper.element.parentElement);
    expect(root.querySelector('.therapy-side')).not.toBeNull();
    expect(root.querySelector('.same-video')).toBe(originalVideo);
  }
  expect(connected).toHaveBeenCalledTimes(1);
  expect(disconnected).not.toHaveBeenCalled();
  wrapper.unmount();
  expect(disconnected).toHaveBeenCalledTimes(1);
});

it.each(['screenSharing', 'videoFullscreen'])('restores Mini when a slotted counseling video enables %s', async state => {
  vi.stubGlobal('innerWidth', 1440);
  vi.stubGlobal('documentPictureInPicture', undefined);
  const video = reactive({ screenSharing: false, videoFullscreen: false });
  const wrapper = mount(Workspace, { props: { request: vi.fn(async () => ({ artifacts: [] })), videoControl: () => video }, slots: { video: '<div class="counseling-video">Counseling video</div>' }, attachTo: document.body });
  await flushPromises();
  const root = wrapper.get('.therapy-workspace').element;
  await dockButton(wrapper, 'Mini').trigger('click'); await flushPromises();
  expect(root.classList.contains('therapy-workspace--mini')).toBe(true);
  video[state] = true; await flushPromises();
  expect(root.classList.contains('therapy-workspace--mini')).toBe(false);
  expect(root.querySelector('.counseling-video')).not.toBeNull();
  wrapper.unmount();
});

it('keeps the same video DOM when fullscreen restores the workspace from PiP while its child also teleports', async () => {
  vi.stubGlobal('innerWidth', 1440);
  const events = new EventTarget();
  const popup = { document: document.implementation.createHTMLDocument(), closed: false, addEventListener: events.addEventListener.bind(events), close() { this.closed = true; events.dispatchEvent(new Event('pagehide')); } };
  vi.stubGlobal('documentPictureInPicture', { requestWindow: async () => popup });
  const controls = reactive({ videoFullscreen: false });
  const mounted = vi.fn(), unmounted = vi.fn();
  const FullscreenVideo = defineComponent({ setup() {
    onMounted(mounted); onBeforeUnmount(unmounted);
    return () => h(Teleport, { to: 'body', disabled: !controls.videoFullscreen }, [h('div', { class: 'live-video' }, 'Live video')]);
  } });
  const wrapper = mount(Workspace, {
    props: { request: vi.fn(async () => ({ artifacts: [] })), videoControl: () => controls },
    slots: { video: () => h(FullscreenVideo) }, attachTo: document.body
  });
  await flushPromises();
  const workspace = wrapper.get('.therapy-workspace').element;
  const video = document.querySelector('.live-video');
  await dockButton(wrapper, 'Mini').trigger('click'); await flushPromises();
  expect(popup.document.body.querySelector('.live-video')).toBe(video);
  controls.videoFullscreen = true; await flushPromises();
  expect(popup.closed).toBe(true);
  expect(workspace.classList.contains('therapy-workspace--mini')).toBe(false);
  expect(document.body.querySelector('.live-video')).toBe(video);
  expect(video.parentElement).toBe(document.body);
  controls.videoFullscreen = false; await flushPromises();
  expect(workspace.querySelector('.therapy-video .live-video')).toBe(video);
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(unmounted).not.toHaveBeenCalled();
  wrapper.unmount();
});
