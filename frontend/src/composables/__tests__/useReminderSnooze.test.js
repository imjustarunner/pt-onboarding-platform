import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import {
  useReminderSnooze,
  isLoginNotificationDismissed,
  markLoginNotificationDismissed,
  signalFreshLogin
} from '../useReminderSnooze.js';

describe('useReminderSnooze', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('defers the login reminder for the current session only', async () => {
    const userId = ref(42);
    const sessionId = ref('session-a');
    const { isDeferredForSession, deferUntilNextLogin } = useReminderSnooze(userId, sessionId);

    await nextTick();
    expect(isDeferredForSession.value).toBe(false);

    deferUntilNextLogin();
    await nextTick();
    expect(isDeferredForSession.value).toBe(true);

    sessionId.value = 'session-b';
    await nextTick();
    expect(isDeferredForSession.value).toBe(false);
  });

  it('tracks time-based snooze independently from next-login defer', async () => {
    const userId = ref(7);
    const sessionId = ref('session-1');
    const { isSnoozed, isDeferredForSession, snooze1h, deferUntilNextLogin } = useReminderSnooze(
      userId,
      sessionId
    );

    await nextTick();
    snooze1h();
    deferUntilNextLogin();
    await nextTick();

    expect(isSnoozed.value).toBe(true);
    expect(isDeferredForSession.value).toBe(true);
  });

  it('tracks dismissed state for the current browser session', () => {
    expect(isLoginNotificationDismissed()).toBe(false);
    markLoginNotificationDismissed();
    expect(isLoginNotificationDismissed()).toBe(true);
    signalFreshLogin();
    expect(isLoginNotificationDismissed()).toBe(false);
  });
});
