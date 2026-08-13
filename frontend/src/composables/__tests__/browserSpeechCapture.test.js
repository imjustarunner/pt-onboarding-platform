import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSpeechCapture } from '../browserSpeechCapture.js';

class FakeSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.lang = '';
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
  }
  start() {}
  stop() {}
  abort() {}
}

describe('createBrowserSpeechCapture', () => {
  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    vi.useRealTimers();
  });

  it('retries after a transient audio-capture error', () => {
    vi.useFakeTimers();
    const instances = [];
    window.SpeechRecognition = class extends FakeSpeechRecognition {
      constructor() {
        super();
        instances.push(this);
      }
    };
    const capture = createBrowserSpeechCapture({
      onHint: vi.fn(),
      onCapturing: vi.fn()
    });
    expect(capture.start()).toBe(true);
    expect(instances).toHaveLength(1);
    instances[0].onerror?.({ error: 'audio-capture' });
    vi.advanceTimersByTime(2100);
    expect(instances).toHaveLength(2);
    capture.stop();
  });

  it('stops permanently when mic permission is denied', () => {
    vi.useFakeTimers();
    const instances = [];
    window.SpeechRecognition = class extends FakeSpeechRecognition {
      constructor() {
        super();
        instances.push(this);
      }
    };
    const onHint = vi.fn();
    const capture = createBrowserSpeechCapture({ onHint, onCapturing: vi.fn() });
    capture.start();
    instances[0].onerror?.({ error: 'not-allowed' });
    vi.advanceTimersByTime(5000);
    expect(instances).toHaveLength(1);
    expect(onHint).toHaveBeenCalledWith(expect.stringMatching(/permission/i));
    capture.stop();
  });
});
