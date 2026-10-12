import { describe, expect, it } from 'vitest';
import { libraryVideo } from '../libraryVideo.js';

describe('hosted library video links', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5', 'YouTube', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'YouTube', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://m.youtube.com/shorts/dQw4w9WgXcQ', 'YouTube', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://vimeo.com/12345678', 'Vimeo', 'https://player.vimeo.com/video/12345678'],
    ['https://player.vimeo.com/video/12345678', 'Vimeo', 'https://player.vimeo.com/video/12345678'],
    ['https://www.loom.com/share/abc123-def', 'Loom', 'https://www.loom.com/embed/abc123-def']
  ])('recognizes %s without fetching the remote URL', (url, provider, embedUrl) => {
    expect(libraryVideo(url)).toEqual({ provider, embedUrl });
  });
  it('only treats a Google Drive file as video when the employee chooses Video link', () => {
    const url = 'https://drive.google.com/file/d/AbC_123-x/view';
    expect(libraryVideo(url)).toBeNull();
    expect(libraryVideo(url, true)).toEqual({ provider: 'Google Drive', embedUrl: 'https://drive.google.com/file/d/AbC_123-x/preview' });
    expect(libraryVideo('https://drive.google.com/open?id=AbC_123-x', true)?.embedUrl).toBe('https://drive.google.com/file/d/AbC_123-x/preview');
  });
  it.each(['not a URL', '', 'javascript:alert(1)', 'data:text/html,hello', 'file:///Users/example/video.mp4', 'ftp://example.org/video.mp4'])
    ('rejects invalid or non-web URL %s, even if explicitly designated video', url => {
      expect(libraryVideo(url)).toBeNull(); expect(libraryVideo(url, true)).toBeNull();
    });
  it.each(['youtube.com.attacker.example', 'evil-youtube.com', 'vimeo.com.attacker.example', 'loom.com.attacker.example', 'drive.google.com.attacker.example'])
    ('requires an exact provider host, never embedding %s', host => {
      const url = `https://${host}/watch?v=dQw4w9WgXcQ`;
      expect(libraryVideo(url)).toBeNull();
      expect(libraryVideo(url, true)).toEqual({ provider: host, embedUrl: null });
    });
  it('uses the actual URL host rather than a misleading username', () => {
    expect(libraryVideo('https://youtube.com@attacker.example/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
  it.each(['https://youtube.com/watch?v=invalid', 'https://drive.google.com/open?id=%22%3E%3Cscript%3E', 'https://loom.com/other/abc'])
    ('keeps invalid provider video IDs as links without an iframe: %s', url => {
      expect(libraryVideo(url, true)?.embedUrl).toBeNull();
    });
  it('supports an external-only video card for other hosts', () => {
    expect(libraryVideo('https://training.example.org/lesson.mp4')).toBeNull();
    expect(libraryVideo('https://training.example.org/lesson.mp4', true)).toEqual({ provider: 'training.example.org', embedUrl: null });
  });
});
