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
  const defaultLandingPage = ref('dashboard');

  function setFromApi(data) {
    if (!data) return;
    if (data.timezone != null) timezone.value = data.timezone;
    if (data.date_format != null) dateFormat.value = data.date_format || 'MM/DD';
    if (data.time_format != null) timeFormat.value = data.time_format || '12h';
    if (data.layout_density != null) layoutDensity.value = data.layout_density || 'standard';
    if (data.schedule_default_view != null) scheduleDefaultView.value = data.schedule_default_view || 'open_finder';
    if (data.push_notifications_enabled != null) pushNotificationsEnabled.value = !!data.push_notifications_enabled;
    if (data.default_landing_page != null) defaultLandingPage.value = data.default_landing_page || 'dashboard';
  }

  function clear() {
    timezone.value = null;
    dateFormat.value = 'MM/DD';
    timeFormat.value = '12h';
    layoutDensity.value = 'standard';
    scheduleDefaultView.value = 'open_finder';
    pushNotificationsEnabled.value = false;
    defaultLandingPage.value = 'dashboard';
  }

  return {
    timezone,
    dateFormat,
    timeFormat,
    layoutDensity,
    scheduleDefaultView,
    pushNotificationsEnabled,
    defaultLandingPage,
    setFromApi,
    clear
  };
});
