import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideoSessionRoom from '../VideoSessionRoom.vue';

const videoSdk = vi.hoisted(() => ({
  session: null,
  connectCallback: null
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
    initPublisher: vi.fn(),
    hasMediaProcessorSupport: vi.fn(() => false)
  }
}));

describe('VideoSessionRoom connection lifecycle', () => {
  beforeEach(() => {
    videoSdk.session = null;
    videoSdk.connectCallback = null;
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
});
