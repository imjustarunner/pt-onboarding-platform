import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideoSessionRoom from '../VideoSessionRoom.vue';
import { updateRemoteVideoState } from '../remoteVideoState.js';
import { acquireNativeAudioSource } from '../nativeAudioCapture.js';

const videoSdk = vi.hoisted(() => ({
  session: null,
  connectCallback: null,
  initPublisher: vi.fn()
}));

vi.mock('@vonage/client-sdk-video', () => ({
  default: {
    initSession: vi.fn(() => {
      const handlers = {};
      videoSdk.session = {
        connection: null,
        streams: {},
        on: vi.fn((event, handler) => { handlers[event] = handler; }),
        connect: vi.fn((_token, callback) => { videoSdk.connectCallback = callback; }),
        disconnect: vi.fn(),
        publish: vi.fn(),
        unpublish: vi.fn(),
        unsubscribe: vi.fn(),
        signal: vi.fn(),
        _handlers: handlers
      };
      return videoSdk.session;
    }),
    initPublisher: videoSdk.initPublisher,
    hasMediaProcessorSupport: vi.fn(() => false)
  }
}));

describe('VideoSessionRoom connection lifecycle', () => {
  beforeEach(() => {
    videoSdk.session = null;
    videoSdk.connectCallback = null;
    videoSdk.initPublisher.mockReset();
  });

  it('recovers a stopped input without restarting video, and preserves mute when changing headsets', async () => {
    let audioTrack = Object.assign(new EventTarget(), { readyState: 'live', getSettings: () => ({}) });
    const publisher = {
      on: vi.fn(), destroy: vi.fn(), publishVideo: vi.fn(), publishAudio: vi.fn(),
      getAudioSource: () => audioTrack,
      setAudioSource: vi.fn(async () => { audioTrack = Object.assign(new EventTarget(), { readyState: 'live', getSettings: () => ({}) }); })
    };
    videoSdk.initPublisher.mockImplementation((_el, _opts, callback) => { queueMicrotask(() => callback(null)); return publisher; });
    const wrapper = mount(VideoSessionRoom, { props: {
      applicationId: '11111111-1111-4111-8111-111111111111', sessionId: 'audio-recovery', token: 'eyJ.test.token', playJoinTone: false
    } });
    await flushPromises(); await vi.dynamicImportSettled();
    videoSdk.session.publish.mockImplementation((_publisher, callback) => callback(null));
    videoSdk.connectCallback(null);
    await flushPromises();
    expect(wrapper.vm.publishAudio).toBe(true);
    audioTrack.dispatchEvent(new Event('mute'));
    await flushPromises();
    expect(wrapper.text()).toContain('Microphone input paused');
    audioTrack.dispatchEvent(new Event('unmute'));
    await flushPromises();
    expect(wrapper.text()).not.toContain('Microphone input paused');
    audioTrack.readyState = 'ended';
    audioTrack.dispatchEvent(new Event('ended'));
    await flushPromises();
    expect(wrapper.vm.publishAudio).toBe(false);
    expect(wrapper.text()).toContain('Microphone disconnected');
    await wrapper.get('.vsr__ctrl--mic').trigger('click');
    await flushPromises();
    expect(publisher.setAudioSource).toHaveBeenCalledWith('default');
    expect(publisher.publishAudio).toHaveBeenLastCalledWith(true);
    expect(wrapper.vm.publishAudio).toBe(true);
    await wrapper.get('.vsr__ctrl--mic').trigger('click');
    await wrapper.get('.vsr__audio-settings button').trigger('click');
    await flushPromises();
    expect(publisher.publishAudio).toHaveBeenLastCalledWith(false);
    expect(publisher.destroy).not.toHaveBeenCalled();
    expect(videoSdk.initPublisher).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('features the interview candidate after hosts join first, with every interviewer in a thumbnail', async () => {
    const wrapper = mount(VideoSessionRoom, {
      props: { applicationId: '11111111-1111-4111-8111-111111111111', sessionId: 'interview', token: 'eyJ.test.token',
        tileFocus: 'remote', focusCandidate: true, preserveVideoAspect: true, playJoinTone: false }
    });
    await flushPromises();
    await vi.dynamicImportSettled();
    videoSdk.session.subscribe = vi.fn((_stream, target) => {
      const element = document.createElement('div');
      element.appendChild(document.createElement('video')); target.appendChild(element);
      return { element, on: vi.fn() };
    });
    for (const [id, identity, roleLabel] of [['host', 'user-1', 'Host'], ['candidate', 'guest-iv-opaque', 'Participant'], ['peer', 'user-2', 'Host']]) {
      videoSdk.session._handlers.streamCreated({ stream: {
        streamId: id, name: id, hasVideo: true, hasAudio: true,
        connection: { connectionId: id, data: JSON.stringify({ identity, roleLabel, displayName: id }) }
      } });
      await flushPromises();
    }
    expect(wrapper.findAll('.vsr__tile--featured')).toHaveLength(1);
    expect(wrapper.find('.vsr__tile--featured').text()).toContain('candidate');
    expect(wrapper.findAll('.vsr__tile--remote.vsr__tile--pip')).toHaveLength(2);
    expect(wrapper.find('.vsr__stage').attributes('style')).toContain('100px');
    expect(videoSdk.session.subscribe.mock.calls.every(call => call[2].fitMode === 'contain')).toBe(true);
    // Candidate keeps the same position when the camera is disabled or re-enabled.
    videoSdk.session._handlers.streamPropertyChanged({stream: {streamId:'candidate'}, changedProperty:'hasVideo', newValue:false});
    await flushPromises();
    expect(wrapper.find('.vsr__tile--featured').text()).toContain('candidate');
    await wrapper.setProps({ tileFocus:'equal', focusCandidate:false });
    expect(wrapper.find('.vsr__stage--grid').exists()).toBe(true);
    expect(wrapper.findAll('.vsr__tile--featured')).toHaveLength(0);
    wrapper.unmount();
  });

  it('keeps publisher and subscriber targets mounted while the SDK is connecting', async () => {
    const wrapper = mount(VideoSessionRoom, {
      props: {
        applicationId: '11111111-1111-4111-8111-111111111111',
        sessionId: 'session-under-test',
        token: 'eyJ.test.token'
      }
    });

    await flushPromises();

    await vi.dynamicImportSettled();
    expect(videoSdk.session).not.toBeNull();
    expect(wrapper.find('.vsr__connecting').exists()).toBe(true);
    expect(wrapper.find('.vsr__viewport').exists()).toBe(true);
    expect(wrapper.find('.vsr__publisher-host').exists()).toBe(true);
    expect(wrapper.find('.vsr__tile--local .vsr__media').exists()).toBe(true);

    wrapper.unmount();
  });

  it('retains every subscriber DOM node across layouts and camera-off/full-screen transitions', async () => {
    const wrapper = mount(VideoSessionRoom, {
      attachTo: document.body,
      props: {
        applicationId: '11111111-1111-4111-8111-111111111111',
        sessionId: 'layout-session', token: 'eyJ.test.token',
        equalTilesWhenRemote: true, playJoinTone: false
      }
    });
    await flushPromises();
    await vi.dynamicImportSettled();
    const elements = [];
    videoSdk.session.subscribe = vi.fn((stream, target) => {
      const element = document.createElement('div');
      element.dataset.stream = stream.streamId;
      element.appendChild(document.createElement('video'));
      target.appendChild(element);
      elements.push(element);
      return { element, on: vi.fn() };
    });
    for (let i = 0; i < 5; i += 1) {
      const event = { stream: {
        streamId: `peer-${i}`, connection: { connectionId: `connection-${i}` },
        name: `Person ${i}`, hasVideo: i !== 2, hasAudio: true
      } };
      videoSdk.session._handlers.streamCreated(event);
      videoSdk.session._handlers.streamCreated(event);
      await flushPromises();
    }
    const targets = elements.map((element) => element.parentElement);
    for (const tileFocus of ['speaker', 'collapsed', 'equal', 'remote', 'local', 'equal']) {
      await wrapper.setProps({ tileFocus, videoFullscreen: tileFocus === 'equal' });
      await flushPromises();
      expect(elements).toHaveLength(5);
      for (let i = 0; i < elements.length; i += 1) {
        expect(elements[i].isConnected).toBe(true);
        expect(elements[i].parentElement).toBe(targets[i]);
      }
    }
    expect(videoSdk.session.subscribe).toHaveBeenCalledTimes(5);
    wrapper.unmount();
  });

  it('restores the equal layout when expanding collapsed videos to full screen', async () => {
    const wrapper = mount(VideoSessionRoom, { props: {
      autoConnect: false, tileFocus: 'collapsed', allowTileFocus: true
    } });
    await wrapper.get('[title="Video layout"]').trigger('click');
    const fullScreen = wrapper.findAll('.vsr__layout-item').find((item) => item.text().includes('Full screen'));
    await fullScreen.trigger('click');
    expect(wrapper.emitted('update:tileFocus')).toEqual([['equal']]);
    expect(wrapper.emitted('update:videoFullscreen')).toEqual([[true]]);
    wrapper.unmount();
  });

  it('switches focused peers without dropping back to equal tiles', async () => {
    const wrapper = mount(VideoSessionRoom, {props:{autoConnect:false,allowTileFocus:true,tileFocus:'remote'}});
    wrapper.vm.remotes.push({streamId:'alice',name:'Alice',hasVideo:true,hasAudio:true},{streamId:'bob',name:'Bob',hasVideo:true,hasAudio:true});
    await wrapper.vm.$nextTick();
    await wrapper.findAll('.vsr__tile--remote')[1].trigger('click');
    expect(wrapper.emitted('update:tileFocus').at(-1)).toEqual(['remote']);
    expect(wrapper.get('.vsr__tile--remote.vsr__tile--featured').text()).toContain('Bob');
    await wrapper.findAll('.vsr__tile--remote')[0].trigger('click');
    expect(wrapper.get('.vsr__tile--remote.vsr__tile--featured').text()).toContain('Alice');
    wrapper.unmount();
  });

  it('exposes leave in full screen and delegates the host leave/end flow', async () => {
    const wrapper=mount(VideoSessionRoom,{props:{autoConnect:false,videoFullscreen:true}});
    await wrapper.get('.vsr__fs-leave').trigger('click');
    expect(wrapper.emitted('leave-request')).toHaveLength(1);
    expect(wrapper.emitted('update:videoFullscreen').at(-1)).toEqual([false]);
    expect(wrapper.emitted('disconnected')).toBeUndefined();
    wrapper.unmount();
  });

  it('hides sharing until permission arrives, then reveals it without remounting', async () => {
    const wrapper=mount(VideoSessionRoom,{props:{autoConnect:false,screenShareMode:'restricted',canShareScreen:false}});
    expect(wrapper.find('[title="Share your screen"]').exists()).toBe(false);
    await wrapper.setProps({canShareScreen:true});
    expect(wrapper.find('[title="Share your screen"]').exists()).toBe(true);
    await wrapper.setProps({canShareScreen:false});
    expect(wrapper.find('[title="Share your screen"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('prioritizes a shared screen, permits another layout, and restores priority from Layout', async () => {
    const wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'screen-test',token:'eyJ.test.token',allowTileFocus:true,tileFocus:'collapsed',playJoinTone:false}});
    await flushPromises(); await vi.dynamicImportSettled();
    videoSdk.session.subscribe=vi.fn((_stream,target)=>({element:target,streamId:'screen-1',on:vi.fn()}));
    videoSdk.session._handlers.streamCreated({stream:{streamId:'screen-1',videoType:'screen',connection:{connectionId:'presenter'},hasVideo:true,hasAudio:false}});
    await flushPromises();
    expect(wrapper.find('.vsr__stage--screen').exists()).toBe(true);
    expect(wrapper.find('.vsr__tile--mini').exists()).toBe(false);
    expect(wrapper.emitted('update:tileFocus').at(-1)).toEqual(['equal']);
    await wrapper.setProps({tileFocus:'equal'});
    await wrapper.get('[title="Video layout"]').trigger('click');
    await wrapper.findAll('.vsr__layout-item').find(b=>b.text().includes('Equal tiles')).trigger('click');
    expect(wrapper.find('.vsr__stage--screen').exists()).toBe(false);
    await wrapper.get('[title="Video layout"]').trigger('click');
    await wrapper.findAll('.vsr__layout-item').find(b=>b.text().includes('Shared screen')).trigger('click');
    expect(wrapper.find('.vsr__stage--screen').exists()).toBe(true);
    expect(videoSdk.session.subscribe).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('tests the lobby microphone only on explicit request and releases it', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [{
        stop,
        getSettings: () => ({ noiseSuppression: true })
      }],
      getTracks: () => [{ stop }]
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        getSupportedConstraints: () => ({ voiceIsolation: true })
      }
    });

    const wrapper = mount(VideoSessionRoom, {
      props: {
        applicationId: '11111111-1111-4111-8111-111111111111',
        sessionId: 'lobby-session',
        token: 'eyJ.test.token',
        lobbyMode: true,
        autoConnect: false
      }
    });
    await flushPromises();

    const micButton = wrapper.find('.vsr__ctrl--mic');
    expect(micButton.text()).toContain('Test mic');
    await micButton.trigger('click');
    await flushPromises();

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        voiceIsolation: true
      },
      video: false
    });
    expect(stop).toHaveBeenCalled();
    expect(micButton.text()).toContain('Mic ready');

    wrapper.unmount();
  });

  it('tests an auto-muted participant microphone without changing the join-muted state', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [{
        stop,
        getSettings: () => ({ noiseSuppression: true })
      }],
      getTracks: () => [{ stop }]
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        getSupportedConstraints: () => ({ voiceIsolation: true })
      }
    });

    const wrapper = mount(VideoSessionRoom, {
      props: {
        applicationId: '11111111-1111-4111-8111-111111111111',
        sessionId: 'auto-muted-lobby-session',
        token: 'eyJ.test.token',
        lobbyMode: true,
        startMuted: true,
        autoConnect: false
      }
    });
    await flushPromises();

    const micButton = wrapper.get('.vsr__ctrl--mic');
    await micButton.trigger('click');
    await flushPromises();

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalled();
    expect(micButton.text()).toContain('Mic tested');
    expect(micButton.attributes('aria-pressed')).toBe('true');
    expect(wrapper.text()).toContain('you will still join muted');

    wrapper.unmount();
  });

  it('acquires and constrains the exact microphone track supplied to the publisher', async () => {
    const stop = vi.fn();
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const audioTrack = {
      kind: 'audio',
      stop,
      applyConstraints,
      getSettings: () => ({ noiseSuppression: true, echoCancellation: true, autoGainControl: false })
    };
    const audioStream = {
      getAudioTracks: () => [audioTrack],
      getTracks: () => [audioTrack]
    };
    const getUserMedia = vi.fn().mockResolvedValue(audioStream);
    const mediaDevices = {
      getUserMedia,
      getSupportedConstraints: () => ({ voiceIsolation: true })
    };
    const result = await acquireNativeAudioSource(mediaDevices);

    const expectedAudio = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
      voiceIsolation: true
    };
    expect(getUserMedia).toHaveBeenCalledWith({ audio: expectedAudio, video: false });
    expect(applyConstraints).toHaveBeenCalledWith(expectedAudio);
    expect(result).toMatchObject({ stream: audioStream, track: audioTrack, constraints: expectedAudio });
  });

  it('treats an echoed remote video state as unchanged', () => {
    let remotes = [{ streamId: 'remote-stream', connectionId: 'remote-connection', hasVideo: true }];
    const first = updateRemoteVideoState(remotes, { streamId: 'remote-stream', hasVideo: false });
    remotes = first.remotes;
    const echoed = updateRemoteVideoState(remotes, { streamId: 'remote-stream', hasVideo: false });

    expect(first.changed).toBe(true);
    expect(echoed.changed).toBe(false);
    expect(remotes[0].hasVideo).toBe(false);
  });
});

describe('remote subscription recovery',()=>{
  it('retries a failed subscription without removing the participant, and cancels after they leave',async()=>{
    const w=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'retry-test',token:'eyJ.test.token',playJoinTone:false}});
    await flushPromises();await vi.dynamicImportSettled();vi.useFakeTimers();
    const callbacks=[];
    videoSdk.session.subscribe=vi.fn((stream,target,options,done)=>{callbacks.push(done);return {element:target,streamId:stream.streamId,on:vi.fn()};});
    const stream={streamId:'retry-person',name:'Participant',hasVideo:true,hasAudio:true,connection:{connectionId:'peer'}};
    videoSdk.session._handlers.streamCreated({stream});await flushPromises();
    callbacks[0](new Error('Temporary network failure'));await flushPromises();
    expect(w.findAll('.vsr__tile--remote')).toHaveLength(1);
    expect(w.text()).toContain('Reconnecting video');
    await vi.advanceTimersByTimeAsync(1000);await flushPromises();
    expect(videoSdk.session.subscribe).toHaveBeenCalledTimes(2);
    callbacks[1](new Error('Still reconnecting'));
    videoSdk.session._handlers.streamDestroyed({stream});
    await vi.advanceTimersByTimeAsync(12000);await flushPromises();
    expect(videoSdk.session.subscribe).toHaveBeenCalledTimes(2);
    expect(w.findAll('.vsr__tile--remote')).toHaveLength(0);w.unmount();vi.useRealTimers();
  });
  it('keeps a locally degraded camera in the gallery until video recovers',async()=>{
    const w=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'quality-test',token:'eyJ.test.token',playJoinTone:false}});
    await flushPromises();await vi.dynamicImportSettled();const handlers={};
    videoSdk.session.subscribe=vi.fn((stream,target)=>({element:target,streamId:stream.streamId,on:(name,handler)=>{handlers[name]=handler;}}));
    videoSdk.session._handlers.streamCreated({stream:{streamId:'quality-person',hasVideo:true,hasAudio:true,connection:{connectionId:'peer'}}});await flushPromises();
    handlers.videoDisabled({reason:'quality'});await flushPromises();
    expect(w.vm.remotes[0].hasVideo).toBe(true);expect(w.text()).toContain('audio continues');
    handlers.videoEnabled({reason:'quality'});await flushPromises();expect(w.text()).not.toContain('audio continues');
    vi.useFakeTimers();handlers.videoDisabled({reason:'publishVideo'});await vi.advanceTimersByTimeAsync(500);await flushPromises();vi.useRealTimers();expect(w.find('.vsr__cam-off-chip, .vsr__tile--cam-off').exists()).toBe(true);w.unmount();
  });
});
