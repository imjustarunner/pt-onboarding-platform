import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeStatusPrompt, openStatusPrompt, registerStatusPromptHandlers, updateStatusPromptSession
} from '../statusPromptBridge';

const context = { enabled: true, secondsLeft: 600, brandName: 'Test Agency', logoUrl: '/test-logo.png', primaryColor: '#245c45' };
const root = () => document.getElementById('pt-status-prompt-root');
const button = (text) => [...root().querySelectorAll('button')].find(b => b.textContent === text);
beforeEach(() => { localStorage.clear(); updateStatusPromptSession(null); });
afterEach(() => { closeStatusPrompt(); registerStatusPromptHandlers(null); updateStatusPromptSession(null); });

describe('non-hourly admin timeout status page', () => {
  it('returns directly from the change-status editor', async () => {
    const onBack = vi.fn().mockResolvedValue({});
    registerStatusPromptHandlers({ onBack });
    openStatusPrompt('change');
    button("I'm back").click();
    await vi.waitFor(() => expect(root()).toBeNull());
    expect(onBack).toHaveBeenCalledOnce();
  });
  it('shows a failed update, keeps selections, and allows retry without a silent close', async () => {
    const onSetStatus = vi.fn().mockRejectedValueOnce({ response: { data: { error: { message: 'Connection interrupted. Try again.' } } } }).mockResolvedValue({});
    registerStatusPromptHandlers({ onSetStatus });
    openStatusPrompt('change');
    button('Change return time').click();
    button('30 min').click();
    button('Update status · change return time').click();
    await vi.waitFor(() => expect(root().querySelector('[role=alert]').hidden).toBe(false));
    expect(root().textContent).toContain('Connection interrupted. Try again.');
    expect(button('30 min').classList.contains('active')).toBe(true);
    button('Update status · change return time').click();
    await vi.waitFor(() => expect(root()).toBeNull());
    expect(onSetStatus).toHaveBeenLastCalledWith(expect.objectContaining({ timerMode: 'reset', durationMinutes: 30 }));
  });
  it('disables repeated submissions and timer changes while saving', async () => {
    let finish;
    const onSetStatus = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    registerStatusPromptHandlers({ onSetStatus });
    openStatusPrompt('change');
    button('Update status · keep timer').click();
    button('Update status · keep timer').click();
    expect(button('Change return time').disabled).toBe(true);
    expect(onSetStatus).toHaveBeenCalledOnce();
    finish({});
    await vi.waitFor(() => expect(root()).toBeNull());
  });
  it('does not report success when status handlers are unavailable', async () => {
    registerStatusPromptHandlers(null);
    openStatusPrompt('change');
    button('Update status · keep timer').click();
    await vi.waitFor(() => expect(root().querySelector('[role=alert]').hidden).toBe(false));
    expect(root().textContent).toContain('Status controls are not ready');
  });
  it('shows branding and the live countdown without replacing controls or losing selections', () => {
    updateStatusPromptSession(context);
    openStatusPrompt('timedown', { userId: 7 });
    expect(root().classList.contains('pt-sp-page')).toBe(true);
    expect(root().textContent).toContain('Test Agency');
    expect(root().querySelector('img').getAttribute('src')).toBe('/test-logo.png');
    expect(root().querySelector('#pt-sp-countdown').textContent).toBe('10:00');
    const stay = button("I'm still here — stay logged in");
    stay.focus();
    updateStatusPromptSession({ ...context, secondsLeft: 599 });
    expect(root().querySelector('#pt-sp-countdown').textContent).toBe('9:59');
    expect(document.activeElement).toBe(stay);
    expect(button("I'm still here — stay logged in")).toBe(stay);
    button('30 min').click();
    expect(button('30 min').classList.contains('active')).toBe(true);
    expect(root().querySelector('#pt-sp-countdown').textContent).toBe('9:59');
    updateStatusPromptSession({ ...context, secondsLeft: 0 });
    expect(root().querySelector('#pt-sp-countdown').textContent).toBe('0:00');
    expect(button('30 min').classList.contains('active')).toBe(true);
  });
  it.each(['logout', 'manual', 'change'])('keeps the existing %s modal even for eligible staff', (mode) => {
    updateStatusPromptSession(context);
    openStatusPrompt(mode);
    expect(root().classList.contains('pt-sp-page')).toBe(false);
    expect(root().querySelector('#pt-sp-countdown')).toBeNull();
  });
  it('keeps the existing timedown modal for users outside the new policy', () => {
    updateStatusPromptSession({ ...context, enabled: false });
    openStatusPrompt('timedown');
    expect(root().classList.contains('pt-sp-page')).toBe(false);
    expect(button("I'm still here")).toBeTruthy();
  });
  it('continues to use the existing resume, status and logout handlers', async () => {
    const onStillHere = vi.fn(); const onSetStatus = vi.fn(); const onLogoutNow = vi.fn();
    registerStatusPromptHandlers({ onStillHere, onSetStatus, onLogoutNow });
    updateStatusPromptSession(context);
    openStatusPrompt('timedown');
    button("I'm still here — stay logged in").click();
    await vi.waitFor(() => expect(root()).toBeNull());
    expect(onStillHere).toHaveBeenCalledTimes(1);
    openStatusPrompt('timedown');
    button('Set Away status').click();
    await vi.waitFor(() => expect(root()).toBeNull());
    expect(onSetStatus).toHaveBeenCalledWith(expect.objectContaining({ mode: 'timedown', reason: 'meal', durationMinutes: 60 }));
    openStatusPrompt('timedown');
    button('Log out now').click();
    expect(onLogoutNow).toHaveBeenCalledTimes(1);
  });
});
