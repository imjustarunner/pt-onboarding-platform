import { describe, expect, it, vi } from 'vitest';
import {
  nativeAudioConstraints,
  enhancePublishedAudioTrack,
  acquireNativeAudioSource
} from '../nativeAudioCapture.js';

describe('nativeAudioConstraints', () => {
  it('includes voiceIsolation when the browser reports support', () => {
    const mediaDevices = {
      getSupportedConstraints: () => ({ voiceIsolation: true })
    };
    expect(nativeAudioConstraints(mediaDevices)).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      voiceIsolation: true
    });
  });

  it('omits voiceIsolation when unsupported', () => {
    const mediaDevices = {
      getSupportedConstraints: () => ({})
    };
    expect(nativeAudioConstraints(mediaDevices)).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    });
  });
});

describe('enhancePublishedAudioTrack', () => {
  it('applies Voice Isolation when settings expose the key but support map omits it', async () => {
    let settings = {
      echoCancellation: true,
      noiseSuppression: true,
      voiceIsolation: false
    };
    const applyConstraints = vi.fn(async (constraints) => {
      if (constraints?.voiceIsolation === true || constraints?.advanced?.[0]?.voiceIsolation === true) {
        settings = { ...settings, voiceIsolation: true };
      }
    });
    const track = {
      kind: 'audio',
      getSettings: () => ({ ...settings }),
      applyConstraints
    };
    const mediaDevices = {
      getSupportedConstraints: () => ({})
    };

    const result = await enhancePublishedAudioTrack(track, mediaDevices);

    expect(applyConstraints).toHaveBeenCalled();
    expect(result.applied).toBe(true);
    expect(result.voiceIsolation).toBe(true);
    expect(result.settings.voiceIsolation).toBe(true);
  });

  it('falls back to AEC/NS/AGC when Voice Isolation apply fails', async () => {
    const applyConstraints = vi.fn()
      .mockRejectedValueOnce(new Error('OverconstrainedError'))
      .mockResolvedValue(undefined);
    const track = {
      kind: 'audio',
      getSettings: () => ({
        echoCancellation: true,
        noiseSuppression: true,
        voiceIsolation: false
      }),
      applyConstraints
    };

    const result = await enhancePublishedAudioTrack(track, {
      getSupportedConstraints: () => ({ voiceIsolation: true })
    });

    expect(applyConstraints.mock.calls.some((call) => (
      call[0]?.echoCancellation === true
      && call[0]?.noiseSuppression === true
      && call[0]?.autoGainControl === true
      && call[0]?.voiceIsolation == null
      && !call[0]?.advanced
    ))).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.voiceIsolation).toBe(false);
  });

  it('returns applied false when the track cannot take constraints', async () => {
    const result = await enhancePublishedAudioTrack(null);
    expect(result).toMatchObject({
      applied: false,
      voiceIsolation: false,
      constraints: null
    });
  });
});

describe('acquireNativeAudioSource', () => {
  it('acquires and enhances the exact microphone track', async () => {
    const stop = vi.fn();
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const audioTrack = {
      kind: 'audio',
      stop,
      applyConstraints,
      getSettings: () => ({
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
        voiceIsolation: true
      })
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

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        voiceIsolation: true
      },
      video: false
    });
    expect(applyConstraints).toHaveBeenCalled();
    expect(result).toMatchObject({ stream: audioStream, track: audioTrack });
  });
});
