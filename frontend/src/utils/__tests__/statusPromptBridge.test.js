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
