import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSessionLockStore } from '../sessionLock';

describe('warning wall-clock deadline', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-15T12:00:00Z')); setActivePinia(createPinia()); });
  afterEach(() => { useSessionLockStore().dismissWarning(); vi.useRealTimers(); });
  it('expires while hidden without granting another 90 seconds', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const store = useSessionLockStore(); const expired = vi.fn();
    store.showWarning(90, expired);
    vi.advanceTimersByTime(90000);
    expect(expired).toHaveBeenCalledTimes(1);
    store.onTabBecameVisible();
    expect(expired).toHaveBeenCalledTimes(1);
    expect(store.warningSecondsLeft).toBe(0);
  });
  it('expires immediately after sleep skips every timer callback', () => {
    const store = useSessionLockStore(); const expired = vi.fn();
    store.showWarning(90, expired);
    vi.setSystemTime(Date.now() + 86400000);
    expect(store.onTabBecameVisible()).toBe(true);
    expect(expired).toHaveBeenCalledOnce();
  });
  it('honors an already elapsed deadline instead of restarting countdown', () => {
    const store = useSessionLockStore(); const expired = vi.fn();
    store.showWarning(600, expired, Date.now() - 1);
    expect(expired).toHaveBeenCalledOnce();
  });
});
