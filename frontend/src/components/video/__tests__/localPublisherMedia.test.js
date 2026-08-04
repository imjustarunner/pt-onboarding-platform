import { describe, expect, it, vi } from 'vitest';
import {
  attachPublisherAudioDevice,
  silenceLocalPublisherMedia
} from '../localPublisherMedia.js';

describe('local publisher media safety', () => {
  it('forces every local publisher media element silent', () => {
    const video = document.createElement('video');
    const audio = document.createElement('audio');
    video.muted = false;
    video.defaultMuted = false;
    video.volume = 1;
    audio.muted = false;
    audio.defaultMuted = false;
    audio.volume = 1;
    const root = document.createElement('div');
    root.append(video, audio);

    expect(silenceLocalPublisherMedia(root)).toBe(2);
    for (const element of [video, audio]) {
      expect(element.muted).toBe(true);
      expect(element.defaultMuted).toBe(true);
      expect(element.volume).toBe(0);
      expect(element.hasAttribute('muted')).toBe(true);
    }
  });

  it('attaches only the audio source without rebuilding or touching video', async () => {
    const setAudioSource = vi.fn().mockResolvedValue(undefined);
    const publishVideo = vi.fn();
    const destroy = vi.fn();
    const publisher = { setAudioSource, publishVideo, destroy };

    await attachPublisherAudioDevice(publisher, 'default-microphone-id');

    expect(setAudioSource).toHaveBeenCalledWith('default-microphone-id');
    expect(publishVideo).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });
});
