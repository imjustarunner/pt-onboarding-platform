/**
 * User preferences store for display-related settings.
 * Populated when preferences are fetched (App.vue, UserPreferencesHub).
 * Used by formatDate/formatTime and layout components.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUserPreferencesStore = defineStore('userPreferences', () => {
  const timezone = ref(null);
  const dateFormat = ref('MM/DD');
  const timeFormat = ref('12h');
  const layoutDensity = ref('standard');
  const scheduleDefaultView = ref('open_finder');
  const pushNotificationsEnabled = ref(false);
  const notificationSoundEnabled = ref(true);
  const defaultLandingPage = ref('dashboard');

  const defaultToastPreferences = () => ({
    login_logout: { toast_enabled: true, duration_seconds: 6, sound_enabled: true },
    new_packet: { toast_enabled: false, duration_seconds: null, sound_enabled: false }
  });
  const toastPreferences = ref(defaultToastPreferences());

  function setFromApi(data) {
    if (!data) return;
    if (data.timezone != null) timezone.value = data.timezone;
    if (data.date_format != null) dateFormat.value = data.date_format || 'MM/DD';
    if (data.time_format != null) timeFormat.value = data.time_format || '12h';
    if (data.layout_density != null) layoutDensity.value = data.layout_density || 'standard';
    if (data.schedule_default_view != null) scheduleDefaultView.value = data.schedule_default_view || 'open_finder';
    if (data.push_notifications_enabled != null) pushNotificationsEnabled.value = !!data.push_notifications_enabled;
    if (data.notification_sound_enabled != null) notificationSoundEnabled.value = !!data.notification_sound_enabled;
    else notificationSoundEnabled.value = true;
    if (data.default_landing_page != null) defaultLandingPage.value = data.default_landing_page || 'dashboard';
    if (data.toast_preferences != null && typeof data.toast_preferences === 'object') {
      const defaults = defaultToastPreferences();
      toastPreferences.value = {
        login_logout: { ...defaults.login_logout, ...(data.toast_preferences.login_logout || {}) },
        new_packet: { ...defaults.new_packet, ...(data.toast_preferences.new_packet || {}) }
      };
    } else {
      toastPreferences.value = defaultToastPreferences();
    }
  }

  function clear() {
    timezone.value = null;
    dateFormat.value = 'MM/DD';
    timeFormat.value = '12h';
    layoutDensity.value = 'standard';
    scheduleDefaultView.value = 'open_finder';
    pushNotificationsEnabled.value = false;
    notificationSoundEnabled.value = true;
    defaultLandingPage.value = 'dashboard';
    toastPreferences.value = defaultToastPreferences();
  }

  return {
    timezone,
    dateFormat,
    timeFormat,
    layoutDensity,
    scheduleDefaultView,
    pushNotificationsEnabled,
    notificationSoundEnabled,
    defaultLandingPage,
    toastPreferences,
    defaultToastPreferences,
    setFromApi,
    clear
  };
});
