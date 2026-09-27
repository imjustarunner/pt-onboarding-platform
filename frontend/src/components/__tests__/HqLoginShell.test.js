import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import HqLoginShell from '../HqLoginShell.vue';

describe('HQ login shell', () => {
  afterEach(() => { vi.unstubAllGlobals(); document.head.querySelectorAll('meta[name="theme-color"]').forEach(el => el.remove()); });
  const render = () => mount(HqLoginShell, {
    slots: { default: '<form aria-label="Existing sign-in"><input name="username" /></form>' },
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } }
  });

  it('keeps the authentication form and links to the company and legal pages', () => {
    const wrapper = render();
    expect(wrapper.get('h1').text()).toBe('PlotTwistHQ');
    expect(wrapper.get('form input').attributes('name')).toBe('username');
    expect(wrapper.get('.hq-company-link').attributes('href')).toBe('https://plottwistco.com/');
    expect(wrapper.get('a[href="/privacypolicy"]').text()).toBe('Privacy');
    expect(wrapper.get('a[href="/terms"]').text()).toBe('Terms');
    expect(wrapper.find('video').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens the shared sign-in security guidance', async () => {
    const wrapper = render();
    await wrapper.get('.hq-header button').trigger('click');
    expect(wrapper.emitted('security')).toHaveLength(1);
    wrapper.unmount();
  });

  it('matches browser chrome to the device and restores it when leaving HQ login', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#123456';
    document.head.appendChild(meta);
    const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    const wrapper = render();
    expect(meta.content).toBe('#fafbfc');
    const listener = media.addEventListener.mock.calls[0][1];
    media.matches = true;
    listener();
    expect(meta.content).toBe('#090b0f');
    wrapper.unmount();
    expect(meta.content).toBe('#123456');
    expect(media.removeEventListener).toHaveBeenCalledWith('change', listener);
  });
});
