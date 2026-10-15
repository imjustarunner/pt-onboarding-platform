import { describe, expect, it } from 'vitest';
import { availableHowToVideos, parseHowToVideoUrl } from '../howToVideos';

describe('Curated how-to videos', () => {
  it.each([
    'https://youtu.be/Gj3-Xc8NkPY?is=5_x2E71u8ZOV6zOT',
    'https://www.youtube.com/watch?v=Gj3-Xc8NkPY&feature=share',
    'https://m.youtube.com/shorts/Gj3-Xc8NkPY',
    'https://www.youtube-nocookie.com/embed/Gj3-Xc8NkPY',
    'https://youtube.com/live/Gj3-Xc8NkPY'
  ])('normalizes supported YouTube URL %s', (url) => {
    expect(parseHowToVideoUrl(url).embedUrl).toContain('https://www.youtube-nocookie.com/embed/Gj3-Xc8NkPY?');
    expect(parseHowToVideoUrl(url).watchUrl).toBe('https://www.youtube.com/watch?v=Gj3-Xc8NkPY');
  });
  it.each(['javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=Gj3-Xc8NkPY', 'https://evil.test/youtu.be/Gj3-Xc8NkPY', 'https://youtube.com/watch?v=bad', 'https://user@youtube.com/watch?v=Gj3-Xc8NkPY'])('rejects invalid or untrusted URLs %s', (url) => {
    expect(parseHowToVideoUrl(url)).toBeNull();
  });
  it('preserves supplied start times without forwarding tracking parameters', () => {
    const parsed = parseHowToVideoUrl('https://youtu.be/Gj3-Xc8NkPY?t=1m23s&si=tracking');
    expect(parsed.embedUrl).toContain('start=83');
    expect(parsed.embedUrl).not.toContain('tracking');
  });
  it('filters audience restrictions and invalid video entries', () => {
    const video = { id: 'a', title: 'Help', url: 'https://youtu.be/Gj3-Xc8NkPY', roles: ['provider'], agencyIds: [42] };
    expect(availableHowToVideos([video], { role: 'provider', agencyId: '42' })).toHaveLength(1);
    expect(availableHowToVideos([video], { role: 'admin', agencyId: 42 })).toHaveLength(0);
    expect(availableHowToVideos([video], { role: 'provider', agencyId: 43 })).toHaveLength(0);
    expect(availableHowToVideos([{ ...video, url: 'invalid' }], { role: 'provider', agencyId: 42 })).toHaveLength(0);
  });
});
