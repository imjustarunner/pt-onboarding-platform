import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyStoredDarkMode, getStoredThemePreference, setThemePreference } from '../darkMode';
beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });
describe('appearance preferences', () => {
  it('persists each user preference and restores it before navigation', () => {
    setThemePreference(7, 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    setThemePreference(8, 'light');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    applyStoredDarkMode(7);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(getStoredThemePreference(8)).toBe('light');
  });
  it('responds to device changes only while Match device is selected', () => {
    let listener;
    const media = { matches: true, addEventListener: vi.fn((_, cb) => { listener = cb; }), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    setThemePreference(null, 'system');
    expect(document.documentElement.dataset.theme).toBe('dark');
    media.matches = false; listener();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    setThemePreference(null, 'dark');
    expect(media.removeEventListener).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
