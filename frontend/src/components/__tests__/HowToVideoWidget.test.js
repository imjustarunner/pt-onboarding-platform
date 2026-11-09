import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HowToVideoWidget from '../HowToVideoWidget.vue';
import HowToVideoButton from '../HowToVideoButton.vue';
import { useHowToVideo } from '../../composables/useHowToVideo';
import { setAudienceHowToVideos } from '../../composables/useHowToVideoCatalog';

const mocks = vi.hoisted(() => ({ route: null, get: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get: mocks.get } }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route }));
const wrappers = [];
function createWidget() {
  mocks.route = reactive({ name: 'OrganizationDashboard', path: '/itsco/dashboard', fullPath: '/itsco/dashboard?tab=my', query: { tab: 'my' } });
  const wrapper = mount(HowToVideoWidget, { props: { role: 'provider', agencyId: 1 }, attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}
async function openFromPageButton() {
  const button = mount(HowToVideoButton, { props: { videoId: 'my-account-business-cards' }, attachTo: document.body });
  wrappers.push(button);
  await button.get('button').trigger('click');
  await flushPromises();
  return button;
}
afterEach(() => {
  vi.useRealTimers();
  setAudienceHowToVideos();
  useHowToVideo().modalHost.value = null;
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = '';
});

describe('Floating how-to player', () => {
  it('shows no global launcher or player until a specific page button is clicked', async () => {
    const wrapper = createWidget();
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.find('iframe').exists()).toBe(false);
    mocks.route.fullPath = '/itsco/dashboard';
    await flushPromises();
    expect(wrapper.find('button').exists()).toBe(false);
    await openFromPageButton();
    const iframe = wrapper.get('iframe').element;
    expect(iframe.src).toContain('/embed/Gj3-Xc8NkPY');
    expect(iframe.src).not.toContain('autoplay=1');
    expect(wrapper.get('section').attributes('aria-modal')).toBeUndefined();
    await wrapper.get('[aria-label="Close video"]').trigger('click');
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('button').exists()).toBe(false);
  });
  it.each(['/itsco/schedule', '/itsco/dashboard?tab=schedule'])('closes playback when navigating to %s without showing a launcher', async (destination) => {
    const wrapper = createWidget();
    await openFromPageButton();
    expect(wrapper.find('iframe').exists()).toBe(true);
    mocks.route.fullPath = destination;
    await flushPromises();
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('button').exists()).toBe(false);
  });
  it('pauses on minimize and retains the iframe for resuming', async () => {
    const wrapper = createWidget();
    await openFromPageButton();
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
    await openFromPageButton();
    const panel = wrapper.get('section');
    vi.spyOn(panel.element, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 10, width: 400, height: 350 });
    await wrapper.get('.how-to-move').trigger('keydown', { key: 'ArrowLeft' });
    expect(panel.element.style.left).toBe('8px');
    await wrapper.setProps({ agencyId: 2 });
    expect(wrapper.find('iframe').exists()).toBe(false);
  });
  it('moves the player inside an active native dialog and back on close', async () => {
    const wrapper = createWidget();
    await openFromPageButton();
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    useHowToVideo().modalHost.value = dialog;
    await flushPromises();
    expect(dialog.querySelector('iframe')?.src).toContain('/embed/Gj3-Xc8NkPY');
    vi.useRealTimers();
  setAudienceHowToVideos();
  useHowToVideo().modalHost.value = null;
    await flushPromises();
    expect(wrapper.find('iframe').exists()).toBe(true);
    expect(dialog.querySelector('iframe')).toBeNull();
  });
});

const schoolVideo = { id: 'school-my-schedule-update', title: 'My Schedule updates for school providers', url: 'https://youtu.be/qfVy1Czud2w', expiresAt: '2026-12-09T18:00:00Z', agencyIds: [1] };
describe('School provider schedule update', () => {
  it('loads the audience on the server, opens in the shared player, and disappears at expiry without a reload', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T18:00:00Z'));
    mocks.get.mockResolvedValue({ data: { videos: [schoolVideo] } });
    const wrapper = createWidget();
    await wrapper.setProps({ userId: 12 }); await flushPromises();
    expect(mocks.get).toHaveBeenCalledWith('/how-to-videos', { params: { agencyId: 1 } });
    const button = mount(HowToVideoButton, { props: { videoId: schoolVideo.id } }); wrappers.push(button);
    expect(button.get('button').classes()).toContain('how-to-inline--pulse');
    await button.get('button').trigger('click'); await flushPromises();
    expect(wrapper.get('iframe').attributes('src')).toContain('/embed/qfVy1Czud2w');
    await vi.advanceTimersByTimeAsync(30 * 24 * 60 * 60 * 1000);
    expect(button.find('button').exists()).toBe(false);
    expect(wrapper.find('iframe').exists()).toBe(false);
  });
  it('never renders the restricted button when no eligible campaign is returned', async () => {
    mocks.get.mockResolvedValue({ data: { videos: [] } });
    const wrapper = createWidget(); await wrapper.setProps({ userId: 12 }); await flushPromises();
    const button = mount(HowToVideoButton, { props: { videoId: schoolVideo.id } }); wrappers.push(button);
    expect(button.find('button').exists()).toBe(false);
    useHowToVideo().openVideo(schoolVideo.id); await flushPromises();
    expect(wrapper.find('iframe').exists()).toBe(false);
  });
  it('discards a previous tenant response that finishes after a context change', async () => {
    let resolveOld;
    mocks.get.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce({ data: { videos: [] } });
    const wrapper = createWidget(); await wrapper.setProps({ userId: 12 });
    await wrapper.setProps({ agencyId: 2 }); await flushPromises();
    resolveOld({ data: { videos: [schoolVideo] } }); await flushPromises();
    const button = mount(HowToVideoButton, { props: { videoId: schoolVideo.id } }); wrappers.push(button);
    expect(button.find('button').exists()).toBe(false);
  });
  it('clears restricted access if a refresh fails', async () => {
    mocks.get.mockResolvedValueOnce({ data: { videos: [ { ...schoolVideo, expiresAt: new Date(Date.now() + 60000).toISOString() } ] } }).mockRejectedValueOnce(new Error('offline'));
    const wrapper = createWidget(); await wrapper.setProps({ userId: 12 }); await flushPromises();
    const button = mount(HowToVideoButton, { props: { videoId: schoolVideo.id } }); wrappers.push(button);
    expect(button.find('button').exists()).toBe(true);
    window.dispatchEvent(new Event('focus')); await flushPromises();
    expect(button.find('button').exists()).toBe(false);
  });
  it('keeps playback while refreshing the same audience on window focus', async () => {
    const video = { ...schoolVideo, expiresAt: new Date(Date.now() + 60000).toISOString() };
    let finishRefresh;
    mocks.get.mockResolvedValueOnce({ data: { videos: [video] } }).mockReturnValueOnce(new Promise(resolve => { finishRefresh = resolve; }));
    const wrapper = createWidget(); await wrapper.setProps({ userId: 12 }); await flushPromises();
    const button = mount(HowToVideoButton, { props: { videoId: schoolVideo.id } }); wrappers.push(button);
    await button.get('button').trigger('click'); await flushPromises();
    const player = wrapper.get('iframe').element;
    window.dispatchEvent(new Event('focus')); await flushPromises();
    expect(wrapper.get('iframe').element).toBe(player);
    finishRefresh({ data: { videos: [video] } }); await flushPromises();
    expect(wrapper.get('iframe').element).toBe(player);
  });
});
