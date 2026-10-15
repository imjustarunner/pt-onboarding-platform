import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HowToVideoWidget from '../HowToVideoWidget.vue';
import HowToVideoButton from '../HowToVideoButton.vue';
import { useHowToVideo } from '../../composables/useHowToVideo';

const mocks = vi.hoisted(() => ({ route: null }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route }));
const wrappers = [];
function createWidget() {
  mocks.route = reactive({ name: 'OrganizationDashboard', path: '/itsco/dashboard', query: { tab: 'my' } });
  const wrapper = mount(HowToVideoWidget, { props: { role: 'provider', agencyId: 1 }, attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}
afterEach(() => {
  useHowToVideo().modalHost.value = null;
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = '';
});

describe('Floating how-to player', () => {
  it('only loads YouTube after opening and keeps the same player through page navigation', async () => {
    const wrapper = createWidget();
    expect(wrapper.find('iframe').exists()).toBe(false);
    await wrapper.get('.how-to-launcher').trigger('click');
    const iframe = wrapper.get('iframe').element;
    expect(iframe.src).toContain('/embed/Gj3-Xc8NkPY');
    expect(iframe.src).not.toContain('autoplay=1');
    expect(wrapper.get('section').attributes('aria-modal')).toBeUndefined();
    mocks.route.path = '/itsco/schedule';
    mocks.route.query = {};
    await flushPromises();
    expect(wrapper.get('iframe').element).toBe(iframe);
    await wrapper.get('[aria-label="Close video"]').trigger('click');
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('.how-to-launcher').element);
  });
  it('pauses on minimize and retains the iframe for resuming', async () => {
    const wrapper = createWidget();
    await wrapper.get('.how-to-launcher').trigger('click');
    const iframe = wrapper.get('iframe').element;
    const post = vi.spyOn(iframe.contentWindow, 'postMessage');
    await wrapper.get('[aria-label="Minimize video"]').trigger('click');
    expect(post).toHaveBeenCalledWith(expect.stringContaining('pauseVideo'), 'https://www.youtube-nocookie.com');
    expect(wrapper.get('.how-to-body').isVisible()).toBe(false);
    await wrapper.get('[aria-label="Expand video"]').trigger('click');
    expect(wrapper.get('iframe').element).toBe(iframe);
    expect(wrapper.get('.how-to-body').isVisible()).toBe(true);
  });
  it('opens from an inline button and restores focus there on Escape', async () => {
    const wrapper = createWidget();
    const button = mount(HowToVideoButton, { props: { videoId: 'my-account-business-cards' }, attachTo: document.body });
    wrappers.push(button);
    await button.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('iframe').exists()).toBe(true);
    await wrapper.get('section').trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(document.activeElement).toBe(button.get('button').element);
  });
  it('clamps keyboard movement and closes when the tenant changes', async () => {
    const wrapper = createWidget();
    await wrapper.get('.how-to-launcher').trigger('click');
    const panel = wrapper.get('section');
    vi.spyOn(panel.element, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 10, width: 400, height: 350 });
    await wrapper.get('.how-to-move').trigger('keydown', { key: 'ArrowLeft' });
    expect(panel.element.style.left).toBe('8px');
    await wrapper.setProps({ agencyId: 2 });
    expect(wrapper.find('iframe').exists()).toBe(false);
  });
  it('moves the player inside an active native dialog and back on close', async () => {
    const wrapper = createWidget();
    await wrapper.get('.how-to-launcher').trigger('click');
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    useHowToVideo().modalHost.value = dialog;
    await flushPromises();
    expect(dialog.querySelector('iframe')?.src).toContain('/embed/Gj3-Xc8NkPY');
    useHowToVideo().modalHost.value = null;
    await flushPromises();
    expect(wrapper.find('iframe').exists()).toBe(true);
    expect(dialog.querySelector('iframe')).toBeNull();
  });
});
