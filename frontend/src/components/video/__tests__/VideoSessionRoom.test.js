import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VideoSessionRoom from '../VideoSessionRoom.vue';
import { updateRemoteVideoState } from '../remoteVideoState.js';
import { acquireNativeAudioSource } from '../nativeAudioCapture.js';

const videoSdk = vi.hoisted(() => ({
  session: null,
  connectCallback: null,
  unblockAudio: vi.fn(),
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
    unblockAudio: videoSdk.unblockAudio,
    hasMediaProcessorSupport: vi.fn(() => false)
  }
}));

describe('VideoSessionRoom connection lifecycle', () => {
  it.each(['networkDisconnected','forceDisconnected','serverRotation'])('preserves the SDK disconnect reason: %s',async reason=>{
    const wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'supervision',token:'eyJ.test.token',playJoinTone:false}});
    await flushPromises();await vi.dynamicImportSettled();
    videoSdk.session._handlers.sessionReconnecting();
    videoSdk.session._handlers.sessionReconnected();
    expect(wrapper.emitted('connection-status')).toEqual([[{event:'reconnecting'}],[{event:'reconnected'}]]);
    videoSdk.session._handlers.sessionDisconnected({reason});
    expect(wrapper.emitted('disconnected')).toEqual([[{reason}]]);
    wrapper.unmount();
  });
  beforeEach(() => {
    videoSdk.session = null;
    videoSdk.connectCallback = null;
    videoSdk.initPublisher.mockReset();
  });

  it('keeps training microphones and cameras locked until the server grants permission, ignoring peer unlock signals', async()=>{
    const policy={userId:4,proctor:false,primaryId:1,proctorIds:[1],approvedIds:[],muteAll:true,videoAllowed:false,canUnmute:false};
    const wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'training',token:'eyJ.test.token',trainingPolicy:policy,startMuted:true,startVideoOff:true,playJoinTone:false}});
    await flushPromises();await vi.dynamicImportSettled();
    videoSdk.session._handlers['signal:mic_unlock']({data:'{}'});
    videoSdk.session._handlers['signal:screen_share_grant']({data:JSON.stringify({granted:true})});
    wrapper.vm.toggleCamera();await wrapper.vm.toggleMic();
    expect(wrapper.vm.publishVideo).toBe(false);expect(wrapper.vm.publishAudio).toBe(false);
    expect(wrapper.findAll('button').find(b=>b.text()==='Cam off').attributes('disabled')).toBeDefined();
    await wrapper.setProps({trainingPolicy:{...policy,videoAllowed:true,canUnmute:true,approvedIds:[4]}});
    expect(wrapper.findAll('button').find(b=>b.text()==='Cam off').attributes('disabled')).toBeUndefined();
    expect(wrapper.vm.publishAudio).toBe(false); // Approval permits unmute; it never turns a microphone on automatically.
    wrapper.unmount();
  });

  it('shows only trainers on stage until cameras are allowed, then includes attendees without reconnecting', async()=>{
    const policy={userId:4,proctor:false,primaryId:1,proctorIds:[1,2],approvedIds:[],muteAll:true,videoAllowed:false,canUnmute:false};
    const wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'training-layout',token:'eyJ.test.token',trainingPolicy:policy,tileFocus:'speaker',playJoinTone:false}});
    await flushPromises();await vi.dynamicImportSettled();
    videoSdk.session.subscribe=vi.fn((_stream,target)=>{const element=document.createElement('div');element.appendChild(document.createElement('video'));target.appendChild(element);return {element,on:vi.fn()};});
    for(const [id,userId] of [['Trainer',1],['Cohost',2],['Attendee',3]]){
      videoSdk.session._handlers.streamCreated({stream:{streamId:id,name:id,hasVideo:true,hasAudio:true,connection:{connectionId:id,data:JSON.stringify({identity:`user-${userId}`,displayName:id})}}});await flushPromises();
    }
    expect(wrapper.find('.vsr__tile--featured').text()).toContain('Trainer');
    expect(wrapper.vm.stageRemotes.map(r=>r.streamId)).toEqual(['Trainer','Cohost']);
    wrapper.vm.lastSpeakerStreamId='Cohost';await flushPromises();expect(wrapper.find('.vsr__tile--featured').text()).toContain('Cohost');
    await wrapper.setProps({trainingPolicy:{...policy,videoAllowed:true},tileFocus:'equal'});
    expect(wrapper.vm.stageRemotes.map(r=>r.streamId)).toEqual(['Trainer','Cohost','Attendee']);expect(wrapper.find('.vsr__stage--grid').exists()).toBe(true);expect(videoSdk.session.disconnect).not.toHaveBeenCalled();wrapper.unmount();
  });

  it('ignores participant end signals in clinical rooms and waits for an actual server disconnection', async () => {
    const wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'clinical',token:'eyJ.test.token',serverManagedEnd:true,playJoinTone:false}});
    await flushPromises();await vi.dynamicImportSettled();
    videoSdk.session._handlers['signal:meeting_ended']({data:'{}',from:{connectionId:'participant'}});
    expect(wrapper.emitted('meeting-ended')).toBeUndefined();
    expect(videoSdk.session.disconnect).not.toHaveBeenCalled();
    videoSdk.session._handlers.sessionDisconnected();
    expect(wrapper.emitted('disconnected')).toHaveLength(1);
    wrapper.unmount();
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
    expect(wrapper.find('.vsr__stage').attributes('style')).toContain('repeat(3, 120px)');
    const thumbnailColumns = wrapper.findAll('.vsr__tile--pip').map(tile => Number(tile.element.style.gridColumn)).sort();
    expect(thumbnailColumns).toEqual([2, 3, 4]);
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

  it('moves interviewer thumbnails to either side without reconnecting the session', async () => {
    const wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'layout',token:'eyJ.test.token',allowTileFocus:true,tileFocus:'remote',focusCandidate:true,playJoinTone:false}});
    await flushPromises();await vi.dynamicImportSettled();
    for(const side of ['left','right']){
      await wrapper.findAll('button').find(b=>b.text()==='Layout').trigger('click');
      await wrapper.findAll('button').find(b=>b.text().includes(`small videos ${side}`)).trigger('click');
      expect(wrapper.find(`.vsr__stage--side-${side}`).exists()).toBe(true);
      expect(wrapper.emitted('update:tileFocus').at(-1)).toEqual(['remote']);
      expect(videoSdk.session.disconnect).not.toHaveBeenCalled();
    }
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
    videoSdk.session.subscribe=vi.fn((stream,target)=>({element:target,stream,on:vi.fn()}));
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

  it('keeps the lead trainer screen ahead of coproctors and ignores the end of another screen', async()=>{
    const policy={userId:4,proctor:false,primaryId:1,proctorIds:[1,2],approvedIds:[],muteAll:true,videoAllowed:false,canUnmute:false};
    const wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'training-screen',token:'eyJ.test.token',trainingPolicy:policy,startMuted:true,startVideoOff:true,playJoinTone:false}});
    await flushPromises();await vi.dynamicImportSettled();
    videoSdk.session.subscribe=vi.fn((stream,target)=>({element:target,stream,on:vi.fn()}));
    const screen=(userId,name)=>({streamId:`screen-${userId}`,name,videoType:'screen',connection:{connectionId:`c-${userId}`,data:JSON.stringify({identity:`user-${userId}`})},hasVideo:true,hasAudio:false});
    const lead=screen(1,'Megan'),co=screen(2,'Co-trainer'),attendee=screen(5,'Attendee');
    for(const stream of [lead,co,attendee]){videoSdk.session._handlers.streamCreated({stream});await flushPromises();}
    expect(videoSdk.session.subscribe).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.vsr__tile--screen').text()).toContain('Megan');
    videoSdk.session._handlers.streamDestroyed({stream:co});await flushPromises();
    videoSdk.session._handlers.streamDestroyed({stream:attendee});await flushPromises();
    expect(videoSdk.session.unsubscribe).not.toHaveBeenCalled();
    expect(wrapper.find('.vsr__tile--screen').text()).toContain('Megan');
    videoSdk.session._handlers.streamDestroyed({stream:lead});await flushPromises();
    expect(videoSdk.session.unsubscribe).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.vsr__stage--screen').exists()).toBe(false);
    wrapper.unmount();
  });

  it('replaces a coproctor screen when the lead trainer begins sharing',async()=>{
    const policy={userId:4,proctor:false,primaryId:1,proctorIds:[1,2],approvedIds:[],muteAll:true,videoAllowed:false,canUnmute:false};
    const wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'training-priority',token:'eyJ.test.token',trainingPolicy:policy,startMuted:true,startVideoOff:true,playJoinTone:false}});
    await flushPromises();await vi.dynamicImportSettled();
    videoSdk.session.subscribe=vi.fn((stream,target)=>({element:target,stream,on:vi.fn()}));
    for(const userId of [2,1]){videoSdk.session._handlers.streamCreated({stream:{streamId:`screen-${userId}`,name:`Trainer ${userId}`,videoType:'screen',connection:{connectionId:`c-${userId}`,data:JSON.stringify({identity:`user-${userId}`})},hasVideo:true,hasAudio:false}});await flushPromises();}
    expect(videoSdk.session.subscribe).toHaveBeenCalledTimes(2);
    expect(videoSdk.session.unsubscribe).toHaveBeenCalledWith(expect.objectContaining({stream:expect.objectContaining({streamId:'screen-2'})}));
    expect(wrapper.find('.vsr__tile--screen').text()).toContain('Trainer 1');
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
        autoGainControl: true,
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
      getSettings: () => ({ noiseSuppression: true, echoCancellation: true, autoGainControl: true })
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
      autoGainControl: true,
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


describe('alone-room disconnect and arrivals', () => {
  let wrapper, publisher;
  beforeEach(async () => {
    vi.useFakeTimers();
    publisher={on:vi.fn(),destroy:vi.fn(),publishAudio:vi.fn(),publishVideo:vi.fn()};
    videoSdk.initPublisher.mockReset().mockImplementation((_el,_opts,cb)=>{queueMicrotask(()=>cb(null));return publisher;});
    wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'alone',token:'eyJ.test.token',playJoinTone:false}});
    await flushPromises();await vi.dynamicImportSettled();
    videoSdk.session.connection={connectionId:'local',data:JSON.stringify({identity:'user-7',displayName:'You'})};
    videoSdk.session.publish.mockImplementation((_pub,cb)=>cb(null));
    videoSdk.connectCallback(null);await flushPromises();
  });
  afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
  it('prompts, tears down paid media, and emits a rejoinable timeout without completing the meeting',async()=>{
    const session=videoSdk.session;
    await vi.advanceTimersByTimeAsync(120000);
    expect(wrapper.find('[role="alertdialog"]').text()).toContain('Waiting for someone?');
    await vi.advanceTimersByTimeAsync(30000);
    expect(session.disconnect).toHaveBeenCalled();expect(publisher.destroy).toHaveBeenCalled();
    expect(wrapper.emitted('disconnected').at(-1)).toEqual([{reason:'alone-timeout'}]);
    expect(wrapper.emitted('meeting-ended')).toBeUndefined();
    expect(wrapper.text()).toContain('Rejoin meeting');
  });
  it('announces a person once, counts audio-only connections, and cancels the pending timeout on arrival',async()=>{
    await vi.advanceTimersByTimeAsync(120000);
    const person={connectionId:'rachel',data:JSON.stringify({identity:'user-8',displayName:'Rachel'})};
    videoSdk.session._handlers.connectionCreated({connection:person});await flushPromises();
    expect(wrapper.text()).toContain('Rachel joined the meeting. 2 people here.');
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(700000);expect(wrapper.emitted('disconnected')).toBeUndefined();
    videoSdk.session._handlers.connectionDestroyed({connection:person});await flushPromises();
    await vi.advanceTimersByTimeAsync(120000);expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true);
  });
  it('disconnects at the hard ten-minute limit despite repeated extensions',async()=>{
    for(let i=0;i<4;i++){
      await vi.advanceTimersByTimeAsync(120000);
      await wrapper.findAll('button').find(b=>b.text()==='Keep waiting').trigger('click');
    }
    await vi.advanceTimersByTimeAsync(90000);
    expect(wrapper.findAll('button').some(b=>b.text()==='Keep waiting')).toBe(false);
    await vi.advanceTimersByTimeAsync(30000);
    expect(wrapper.emitted('disconnected').at(-1)).toEqual([{reason:'alone-timeout'}]);
  });
});


describe('meeting speaker playback recovery',()=>{
 it('keeps participant volume independent and retains it through playback recovery and stream replacement',async()=>{
  const publisher={on:vi.fn(),publishAudio:vi.fn(),publishVideo:vi.fn(),destroy:vi.fn(),getAudioSource:()=>null};
  videoSdk.initPublisher.mockImplementation((_el,_opts,callback)=>{queueMicrotask(()=>callback(null));return publisher;});
  videoSdk.unblockAudio.mockResolvedValue(undefined);
  const wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'levels',token:'eyJ.test.token',playJoinTone:false,startMuted:true}});
  await flushPromises();await vi.dynamicImportSettled();videoSdk.session.publish.mockImplementation((_p,done)=>done(null));videoSdk.connectCallback(null);await flushPromises();
  const subs=[];
  videoSdk.session.subscribe=vi.fn((_stream,target)=>{const sub={element:target,on:vi.fn(),subscribeToAudio:vi.fn(),setAudioVolume:vi.fn(),isAudioBlocked:()=>false};subs.push(sub);return sub;});
  const applicant={streamId:'a1',hasVideo:true,hasAudio:true,connection:{connectionId:'a',data:JSON.stringify({identity:'candidate-1',displayName:'Applicant'})}};
  const interviewer={streamId:'b1',hasVideo:true,hasAudio:true,connection:{connectionId:'b',data:JSON.stringify({identity:'user-2',displayName:'Interviewer'})}};
  for(const stream of [applicant,interviewer]){videoSdk.session._handlers.streamCreated({stream});await flushPromises();}
  await wrapper.get('input[aria-label="Listening volume for Applicant"]').setValue('25');
  expect(subs[0].setAudioVolume).toHaveBeenLastCalledWith(25);
  expect(subs[1].setAudioVolume).toHaveBeenLastCalledWith(100);
  await wrapper.findAll('.vsr__audio-settings button').find(b=>b.text()==='Enable meeting sound').trigger('click');await flushPromises();
  expect(subs[0].setAudioVolume).toHaveBeenLastCalledWith(25);
  expect(subs[1].setAudioVolume).toHaveBeenLastCalledWith(100);
  videoSdk.session._handlers.streamDestroyed({stream:applicant});await flushPromises();
  videoSdk.session._handlers.streamCreated({stream:{...applicant,streamId:'a2',connection:{...applicant.connection,connectionId:'a-new'}}});await flushPromises();
  expect(subs[2].setAudioVolume).toHaveBeenLastCalledWith(25);
  expect(videoSdk.session.subscribe.mock.calls[2][2].audioVolume).toBe(25);
  wrapper.unmount();
 });
 it('enables speech level control for the published microphone and changes it without reconnecting or unmuting',async()=>{
  let settings={echoCancellation:true,noiseSuppression:true,autoGainControl:true};
  const track={kind:'audio',readyState:'live',getSettings:()=>settings,applyConstraints:vi.fn(async value=>{settings={...settings,...value};})};
  const publisher={on:vi.fn(),publishAudio:vi.fn(),publishVideo:vi.fn(),destroy:vi.fn(),getAudioSource:()=>track};
  videoSdk.initPublisher.mockImplementation((_el,_opts,callback)=>{queueMicrotask(()=>callback(null));return publisher;});
  const wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'mic-levels',token:'eyJ.test.token',playJoinTone:false,startMuted:true}});
  await flushPromises();await vi.dynamicImportSettled();videoSdk.session.publish.mockImplementation((_p,done)=>done(null));videoSdk.connectCallback(null);await flushPromises();
  expect(videoSdk.initPublisher.mock.calls.at(-1)[1]).toMatchObject({autoGainControl:true,noiseSuppression:true,echoCancellation:true,disableAudioProcessing:false,publishAudio:false});
  const before=videoSdk.initPublisher.mock.calls.length;
  await wrapper.get('.vsr__audio-settings input[type="checkbox"]').setValue(false);await flushPromises();
  expect(track.applyConstraints).toHaveBeenLastCalledWith(expect.objectContaining({autoGainControl:false,noiseSuppression:true,echoCancellation:true}));
  expect(wrapper.vm.publishAudio).toBe(false);expect(publisher.destroy).not.toHaveBeenCalled();
  expect(videoSdk.initPublisher.mock.calls).toHaveLength(before);
  await wrapper.get('.vsr__audio-settings input[type="checkbox"]').setValue(true);await flushPromises();
  expect(track.applyConstraints).toHaveBeenLastCalledWith(expect.objectContaining({autoGainControl:true}));
  wrapper.unmount();
 });
 it('restores sound after a phone interruption without reconnecting or unmuting',async()=>{
  const publisher={on:vi.fn(),publishAudio:vi.fn(),publishVideo:vi.fn(),destroy:vi.fn(),getAudioSource:()=>null};
  videoSdk.initPublisher.mockImplementation((_el,_opts,callback)=>{queueMicrotask(()=>callback(null));return publisher;});
  videoSdk.unblockAudio.mockResolvedValue(undefined);
  const wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'mobile',token:'eyJ.test.token',startMuted:true,playJoinTone:false}});
  await flushPromises();await vi.dynamicImportSettled();videoSdk.session.publish.mockImplementation((_p,cb)=>cb(null));videoSdk.connectCallback(null);await flushPromises();
  const sub={on:vi.fn(),subscribeToAudio:vi.fn(),setAudioVolume:vi.fn(),isAudioBlocked:()=>false};
  videoSdk.session.subscribe=vi.fn((_stream,target)=>({...sub,element:target}));
  videoSdk.session._handlers.streamCreated({stream:{streamId:'peer',hasVideo:false,hasAudio:true,connection:{connectionId:'peer'}}});await flushPromises();
  const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));
  hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();
  expect(sub.subscribeToAudio).toHaveBeenCalledWith(false);expect(sub.subscribeToAudio).toHaveBeenLastCalledWith(true);
  expect(publisher.publishAudio).toHaveBeenLastCalledWith(false);expect(wrapper.vm.publishAudio).toBe(false);
  expect(videoSdk.session.disconnect).not.toHaveBeenCalled();
  await wrapper.findAll('button').find(b=>b.text()==='Resume meeting sound').trigger('click');await flushPromises();
  expect(wrapper.text()).not.toContain('Back from another app?');expect(videoSdk.unblockAudio).toHaveBeenCalled();
  wrapper.unmount();hidden.mockRestore();
 });
 it('shows a recovery button when the browser blocks a subscriber and enables sound from a click',async()=>{
  const wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'sound-test',token:'eyJ.test.token',playJoinTone:false}});
  await flushPromises();await vi.dynamicImportSettled();
  const handlers={};let blocked=true;
  const sub={on:vi.fn((name,handler)=>{(handlers[name] ||= []).push(handler);}),isAudioBlocked:()=>blocked,subscribeToAudio:vi.fn(),setAudioVolume:vi.fn()};
  videoSdk.session.subscribe=vi.fn((_stream,target)=>({...sub,element:target}));
  videoSdk.session._handlers.streamCreated({stream:{streamId:'sound-person',hasVideo:true,hasAudio:true,connection:{connectionId:'peer'}}});
  await flushPromises();
  expect(wrapper.text()).toContain('Your browser has paused meeting sound.');
  videoSdk.unblockAudio.mockImplementation(async()=>{blocked=false;for(const h of handlers.audioUnblocked)h();});
  await wrapper.get('.vsr__audio-problem button').trigger('click');await flushPromises();
  expect(videoSdk.unblockAudio).toHaveBeenCalled();
  expect(sub.subscribeToAudio).toHaveBeenCalledWith(true);expect(sub.setAudioVolume).toHaveBeenCalledWith(100);
  expect(wrapper.text()).not.toContain('Your browser has paused meeting sound.');
  blocked=true;for(const h of handlers.audioBlocked)h();await flushPromises();
  videoSdk.unblockAudio.mockRejectedValueOnce(new Error('Autoplay denied'));
  await wrapper.get('.vsr__audio-problem button').trigger('click');await flushPromises();
  expect(wrapper.text()).toContain('Meeting sound could not start');
  wrapper.unmount();
 });
});


it('starts screen capture synchronously from the click without losing Safari user activation', async () => {
 const publisher={on:vi.fn(),publishAudio:vi.fn(),publishVideo:vi.fn(),destroy:vi.fn(),getAudioSource:()=>null};
 videoSdk.initPublisher.mockImplementation((_el,_opts,callback)=>{queueMicrotask(()=>callback(null));return publisher;});
 const wrapper=mount(VideoSessionRoom,{props:{applicationId:'11111111-1111-4111-8111-111111111111',sessionId:'safari-share',token:'eyJ.test.token',playJoinTone:false,startMuted:true}});
 await flushPromises();await vi.dynamicImportSettled();
 videoSdk.session.publish.mockImplementation((_p,done)=>done(null));videoSdk.connectCallback(null);await flushPromises();
 videoSdk.initPublisher.mockClear();
 const sharing=wrapper.vm.toggleScreenShare();
 // This assertion deliberately runs before yielding to any promise/microtask.
 expect(videoSdk.initPublisher).toHaveBeenCalledWith(expect.any(HTMLElement),expect.objectContaining({videoSource:'screen'}),expect.any(Function));
 await sharing;await flushPromises();
 expect(wrapper.text()).toContain('Stop share');
 await wrapper.vm.toggleScreenShare();
 expect(videoSdk.session.unpublish).toHaveBeenCalledWith(publisher);
 wrapper.unmount();
});
