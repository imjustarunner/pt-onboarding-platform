import { afterEach, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import View from '../AnnouncementMarquee.vue';
import source from '../AnnouncementMarquee.vue?raw';

afterEach(() => document.getElementById('announcement-display-font')?.remove());
it('keeps third-party font imports out of the required dashboard stylesheet', () => {
  const styles = source.match(/<style[\s\S]*?<\/style>/g).join('\n');
  expect(styles).not.toMatch(/@import\s+(?:url\(\s*)?['"]?https?:/i);
});
it('shows announcements while the decorative font is unavailable', async () => {
  const wrapper = mount(View, { props: { items: ['School team update'] } });
  try {
    const font = document.getElementById('announcement-display-font');
    expect(font.href).toMatch(/^https:\/\/fonts\.googleapis\.com\//);
    expect(font.media).toBe('print');
    font.dispatchEvent(new Event('error'));
    expect(wrapper.text()).toContain('School team update');
    expect(font.media).toBe('print');
    font.dispatchEvent(new Event('load'));
    expect(font.media).toBe('all');
  } finally { wrapper.unmount(); }
});
it('shares one optional font request between multiple announcement instances', () => {
  const one = mount(View), two = mount(View);
  try { expect(document.querySelectorAll('#announcement-display-font')).toHaveLength(1); }
  finally { one.unmount(); two.unmount(); }
});
