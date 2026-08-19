import { describe, expect, it } from 'vitest';
import {
  isConstrainedVideoDevice,
  isPublishTimeoutError,
  shouldUseVonageAdvancedNoiseSuppression
} from '../vonageAudioProcessor.js';

describe('isConstrainedVideoDevice', () => {
  it('treats iPad as constrained', () => {
    expect(isConstrainedVideoDevice({
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
      platform: 'iPad',
      maxTouchPoints: 5
    })).toBe(true);
  });

  it('treats iPadOS desktop-UA as constrained', () => {
    expect(isConstrainedVideoDevice({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5
    })).toBe(true);
  });

  it('treats desktop Safari as constrained', () => {
    expect(isConstrainedVideoDevice({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0
    })).toBe(true);
  });

  it('allows desktop Chrome', () => {
    expect(isConstrainedVideoDevice({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0
    })).toBe(false);
  });
});

describe('shouldUseVonageAdvancedNoiseSuppression', () => {
  it('is off when the SDK cannot confirm support', () => {
    expect(shouldUseVonageAdvancedNoiseSuppression({}, {
      userAgent: 'Mozilla/5.0 Chrome/128',
      platform: 'MacIntel',
      maxTouchPoints: 0
    })).toBe(false);
  });

  it('is off on iPad even if the SDK claims support', () => {
    expect(shouldUseVonageAdvancedNoiseSuppression({
      hasMediaProcessorSupport: () => true
    }, {
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)',
      platform: 'iPad',
      maxTouchPoints: 5
    })).toBe(false);
  });

  it('stays off even on desktop Chrome — WASM filter is opt-in only', () => {
    expect(shouldUseVonageAdvancedNoiseSuppression({
      hasMediaProcessorSupport: (kind) => kind === 'audio'
    }, {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0
    })).toBe(false);
  });
});

describe('isPublishTimeoutError', () => {
  it('matches the Vonage publish timeout message', () => {
    expect(isPublishTimeoutError({
      message: 'Session.publish :: Could not publish in a reasonable amount of time'
    })).toBe(true);
  });
});
