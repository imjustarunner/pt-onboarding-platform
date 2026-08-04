import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideoSessionRoom from '../VideoSessionRoom.vue';
import { updateRemoteVideoState } from '../remoteVideoState.js';

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

  it('keeps publisher and subscriber targets mounted while the SDK is connecting', async () => {
    const wrapper = mount(VideoSessionRoom, {
      props: {
        applicationId: '11111111-1111-4111-8111-111111111111',
        sessionId: 'session-under-test',
        token: 'eyJ.test.token'
      }
    });

    await flushPromises();

    expect(wrapper.find('.vsr__connecting').exists()).toBe(true);
    expect(wrapper.find('.vsr__viewport').exists()).toBe(true);
    expect(wrapper.find('.vsr__publisher-host').exists()).toBe(true);
    expect(wrapper.find('.vsr__tile--local .vsr__media').exists()).toBe(true);

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

  it('stops re-subscribing when Vonage echoes the same video state event', () => {
    let remotes = [{ streamId: 'remote-stream', connectionId: 'remote-connection', hasVideo: true }];
    let subscribeCalls = 0;
    const handleVideoEvent = (hasVideo) => {
      const result = updateRemoteVideoState(remotes, { streamId: 'remote-stream', hasVideo });
      remotes = result.remotes;
      if (result.changed) {
        subscribeCalls += 1;
        // Model Vonage immediately echoing videoDisabled after the subscription update.
        handleVideoEvent(hasVideo);
      }
    };

    handleVideoEvent(false);

    expect(subscribeCalls).toBe(1);
    expect(remotes[0].hasVideo).toBe(false);
  });
});
