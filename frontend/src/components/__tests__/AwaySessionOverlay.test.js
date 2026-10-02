import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), auth: { user: { id: 555, role: 'admin' }, isAuthenticated: true } }));
vi.mock('../../services/api', () => ({ default: mocks }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('../../store/branding', () => ({ useBrandingStore: () => ({}) }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({}) }));
vi.mock('../../utils/activityTracker', () => ({ resumeSession: vi.fn(), resetActivityTimer: vi.fn(), clearSessionExtendPause: vi.fn(), pauseIdleForSessionExtend: vi.fn(), reportTimedownDismissed: vi.fn() }));
import AwaySessionOverlay from '../AwaySessionOverlay.vue';
import StatusPromptModal from '../StatusPromptModal.vue';
import { usePresenceSessionStore } from '../../store/presenceSession';
import { useSessionLockStore } from '../../store/sessionLock';
import { closeStatusPrompt } from '../../utils/statusPromptBridge';
let wrapper;
let serverUntil;
const overlay = () => document.querySelector('[data-pt-away-session]');
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); setActivePinia(createPinia()); mocks.auth.isAuthenticated = true;
  serverUntil = new Date(Date.now() + 3600000).toISOString();
  mocks.get.mockImplementation(async () => ({ data: { session_extend_active: !!serverUntil, presence_session_extend_until: serverUntil, presence_reason: 'meal' } }));
  mocks.post.mockImplementation(async (url, body) => {
    serverUntil = url.endsWith('/clear') ? null : body.timerMode === 'continue' ? serverUntil : new Date(Date.now() + body.durationMinutes * 60000).toISOString();
    return { data: { session_extend_until: serverUntil } };
  });
});
afterEach(() => { wrapper?.unmount(); closeStatusPrompt(); vi.useRealTimers(); });
async function open() {
  wrapper = mount({ components: { AwaySessionOverlay, StatusPromptModal }, template: '<AwaySessionOverlay /><StatusPromptModal />' });
  await flushPromises();
}
describe('Away signed-in screen', () => {
  it('returns immediately without waiting for the Away timer', async () => {
    await open(); expect(overlay()).not.toBeNull();
    button("I'm back").click(); await flushPromises();
    expect(mocks.post).toHaveBeenCalledWith('/presence/status/clear', {}, expect.any(Object));
    expect(overlay()).toBeNull();
    expect(usePresenceSessionStore().sessionExtendUntil).toBeNull();
  });
  it('shows a clear failure and allows retry instead of trapping the user silently', async () => {
    await open(); mocks.post.mockRejectedValueOnce(new Error('Offline'));
    button("I'm back").click(); await flushPromises();
    expect(overlay().querySelector('[role=alert]').textContent).toContain('Could not update');
    expect(button("I'm back").disabled).toBe(false);
    button("I'm back").click(); await flushPromises();
    expect(overlay()).toBeNull();
  });
  it('edits the return time, continues the timer, and returns from the editor', async () => {
    await open(); button('Change status').click(); await nextTick();
    expect(overlay()).toBeNull();
    button('Change return time').click(); button('30 min').click();
    button('Update status · change return time').click(); await flushPromises();
    expect(mocks.post).toHaveBeenLastCalledWith('/presence/status/away', expect.objectContaining({ durationMinutes: 30, timerMode: 'reset' }), expect.any(Object));
    expect(overlay()).not.toBeNull();
    const newUntil = serverUntil;
    button('Change status').click(); await nextTick();
    button('Update status · keep timer').click(); await flushPromises();
    expect(serverUntil).toBe(newUntil);
    button('Change status').click(); await nextTick();
    button("I'm back").click(); await flushPromises();
    expect(overlay()).toBeNull();
    expect(document.getElementById('pt-status-prompt-root')).toBeNull();
  });
  it('reconciles the saved status on returning to the app', async () => {
    await open(); serverUntil = null;
    window.dispatchEvent(new Event('focus')); await flushPromises();
    expect(overlay()).toBeNull();
  });
  it('keeps the actual session lock in control', async () => {
    await open(); useSessionLockStore().lock(); await nextTick();
    expect(overlay()).toBeNull();
    expect(document.getElementById('pt-status-prompt-root')).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('does not cover sign-in with a locally cached Away timer', async () => {
    mocks.auth.isAuthenticated = false;
    localStorage.setItem('presence:sessionExtendUntil', serverUntil);
    await open();
    expect(overlay()).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
