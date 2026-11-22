import { computed, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue';

const eventName = 'pt:app-reminder-snooze';
const storageKey = id => `pt.appReminderSnooze:${id}`;

// Presentation only: reminders remain unread and available in their workspaces.
export function useAppReminderSnooze(userId) {
  const until = ref(0), now = ref(Date.now());
  let timer;
  function load() {
    now.value = Date.now();
    try { until.value = Number(localStorage.getItem(storageKey(unref(userId)))) || 0; }
    catch { until.value = 0; }
  }
  function setUntil(value) {
    if (!unref(userId)) return;
    until.value = value;
    now.value = Date.now();
    try { localStorage.setItem(storageKey(unref(userId)), String(value)); } catch { /* Keep this view usable. */ }
    window.dispatchEvent(new Event(eventName));
  }
  function snoozeToday() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    setUntil(tomorrow.getTime());
  }
  watch(() => unref(userId), load, { immediate: true });
  onMounted(() => {
    timer = setInterval(() => { now.value = Date.now(); }, 15000);
    window.addEventListener('storage', load);
    window.addEventListener('focus', load);
    window.addEventListener(eventName, load);
  });
  onBeforeUnmount(() => {
    clearInterval(timer);
    window.removeEventListener('storage', load);
    window.removeEventListener('focus', load);
    window.removeEventListener(eventName, load);
  });
  return { until, snoozed: computed(() => until.value > now.value), snoozeToday,
    snoozeHour: () => setUntil(Date.now() + 3600000), resume: () => setUntil(0) };
}
