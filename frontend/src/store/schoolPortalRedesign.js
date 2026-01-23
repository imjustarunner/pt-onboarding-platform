import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import api from '../services/api';

const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const keyFor = (weekday, providerUserId) => `${weekday}:${providerUserId}`;

export const useSchoolPortalRedesignStore = defineStore('schoolPortalRedesign', () => {
  const schoolId = ref(null);

  const days = ref(weekDays.map((d) => ({ weekday: d, is_active: false, has_providers: false })));
  const selectedWeekday = ref('Monday');

  const dayProviders = ref([]); // providers added to selected weekday (from school_day_provider_assignments)
  const dayProvidersLoading = ref(false);
  const dayProvidersError = ref('');

  const eligibleProviders = ref([]); // from /school-portal/:id/providers/scheduling
  const eligibleProvidersLoading = ref(false);

  // Per provider/day panel state (caseload + soft slots)
  const providerPanels = ref({}); // key -> { caseloadClients, slots, persisted, loading, saving, error }

  const setSchoolId = (id) => {
    schoolId.value = id ? Number(id) : null;
  };

  const reset = () => {
    days.value = weekDays.map((d) => ({ weekday: d, is_active: false, has_providers: false }));
    selectedWeekday.value = 'Monday';
    dayProviders.value = [];
    dayProvidersLoading.value = false;
    dayProvidersError.value = '';
    eligibleProviders.value = [];
    eligibleProvidersLoading.value = false;
    providerPanels.value = {};
  };

  const fetchDays = async () => {
    if (!schoolId.value) return;
    const r = await api.get(`/school-portal/${schoolId.value}/days`);
    days.value = Array.isArray(r.data) && r.data.length ? r.data : days.value;
  };

  const addDay = async (weekday) => {
    if (!schoolId.value) return;
    await api.post(`/school-portal/${schoolId.value}/days/${encodeURIComponent(weekday)}`, {});
    await fetchDays();
  };

  const fetchEligibleProviders = async () => {
    if (!schoolId.value) return;
    eligibleProvidersLoading.value = true;
    try {
      const r = await api.get(`/school-portal/${schoolId.value}/providers/scheduling`);
      eligibleProviders.value = Array.isArray(r.data) ? r.data : [];
    } finally {
      eligibleProvidersLoading.value = false;
    }
  };

  const fetchDayProviders = async (weekday) => {
    if (!schoolId.value) return;
    dayProvidersLoading.value = true;
    dayProvidersError.value = '';
    try {
      const r = await api.get(`/school-portal/${schoolId.value}/days/${encodeURIComponent(weekday)}/providers`);
      dayProviders.value = Array.isArray(r.data) ? r.data : [];
    } catch (e) {
      dayProvidersError.value = e.response?.data?.error?.message || 'Failed to load day providers';
      dayProviders.value = [];
    } finally {
      dayProvidersLoading.value = false;
    }
  };

  const addProviderToDay = async (weekday, providerUserId) => {
    if (!schoolId.value) return;
    await api.post(`/school-portal/${schoolId.value}/days/${encodeURIComponent(weekday)}/providers`, {
      providerUserId: Number(providerUserId)
    });
    await fetchDays();
    await fetchDayProviders(weekday);
  };

  const ensurePanel = (weekday, providerUserId) => {
    const key = keyFor(weekday, providerUserId);
    if (!providerPanels.value[key]) {
      providerPanels.value[key] = {
        caseloadClients: [],
        slots: [],
        persisted: false,
        loading: false,
        saving: false,
        error: ''
      };
    }
    return providerPanels.value[key];
  };

  const fetchProviderCaseload = async (weekday, providerUserId) => {
    if (!schoolId.value) return;
    const panel = ensurePanel(weekday, providerUserId);
    const r = await api.get(`/school-portal/${schoolId.value}/providers/${providerUserId}/assigned-clients`, {
      params: { dayOfWeek: weekday }
    });
    panel.caseloadClients = Array.isArray(r.data) ? r.data : [];
  };

  const fetchSoftSlots = async (weekday, providerUserId) => {
    if (!schoolId.value) return;
    const panel = ensurePanel(weekday, providerUserId);
    const r = await api.get(
      `/school-portal/${schoolId.value}/days/${encodeURIComponent(weekday)}/providers/${providerUserId}/soft-slots`
    );
    panel.persisted = !!r.data?.persisted;
    panel.slots = Array.isArray(r.data?.slots) ? r.data.slots : [];
  };

  const loadProviderPanel = async (weekday, providerUserId) => {
    const panel = ensurePanel(weekday, providerUserId);
    panel.loading = true;
    panel.error = '';
    try {
      await Promise.all([fetchProviderCaseload(weekday, providerUserId), fetchSoftSlots(weekday, providerUserId)]);
    } catch (e) {
      panel.error = e.response?.data?.error?.message || 'Failed to load provider panel';
    } finally {
      panel.loading = false;
    }
  };

  const saveSoftSlots = async (weekday, providerUserId, slots) => {
    if (!schoolId.value) return;
    const panel = ensurePanel(weekday, providerUserId);
    panel.saving = true;
    panel.error = '';
    try {
      const r = await api.put(
        `/school-portal/${schoolId.value}/days/${encodeURIComponent(weekday)}/providers/${providerUserId}/soft-slots`,
        { slots }
      );
      panel.persisted = !!r.data?.persisted;
      panel.slots = Array.isArray(r.data?.slots) ? r.data.slots : [];
    } catch (e) {
      panel.error = e.response?.data?.error?.message || 'Failed to save schedule';
      throw e;
    } finally {
      panel.saving = false;
    }
  };

  const moveSoftSlot = async (weekday, providerUserId, slotId, direction) => {
    if (!schoolId.value) return;
    const panel = ensurePanel(weekday, providerUserId);
    panel.error = '';
    const r = await api.post(
      `/school-portal/${schoolId.value}/days/${encodeURIComponent(weekday)}/providers/${providerUserId}/soft-slots/${slotId}/move`,
      { direction }
    );
    panel.slots = Array.isArray(r.data?.slots) ? r.data.slots : panel.slots;
  };

  const selectedDayMeta = computed(() => days.value.find((d) => d.weekday === selectedWeekday.value) || null);
  const eligibleProvidersForSelectedDay = computed(() => {
    const weekday = selectedWeekday.value;
    const list = Array.isArray(eligibleProviders.value) ? eligibleProviders.value : [];
    return list
      .map((p) => {
        const assignment = (p.assignments || []).find((a) => a.day_of_week === weekday && a.is_active);
        return assignment ? { ...p, assignment } : null;
      })
      .filter(Boolean)
      .sort((a, b) => String(a.last_name || '').localeCompare(String(b.last_name || '')));
  });

  return {
    schoolId,
    days,
    selectedWeekday,
    selectedDayMeta,
    dayProviders,
    dayProvidersLoading,
    dayProvidersError,
    eligibleProviders,
    eligibleProvidersLoading,
    eligibleProvidersForSelectedDay,
    providerPanels,
    setSchoolId,
    reset,
    fetchDays,
    addDay,
    fetchEligibleProviders,
    fetchDayProviders,
    addProviderToDay,
    ensurePanel,
    loadProviderPanel,
    saveSoftSlots,
    moveSoftSlot
  };
});

