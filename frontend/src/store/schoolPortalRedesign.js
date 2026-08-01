import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import api from '../services/api';

const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const keyFor = (weekday, providerUserId) => `${weekday}:${providerUserId}`;

export const useSchoolPortalRedesignStore = defineStore('schoolPortalRedesign', () => {
  const schoolId = ref(null);

  const days = ref(weekDays.map((d) => ({ weekday: d, is_active: false, has_providers: false })));
  const selectedWeekday = ref(null); // set by UI; do not auto-select

  // Home stats (At a glance)
  const portalStats = ref(null); // { assigned_weekdays_count, clients_total, clients_assigned, slots_total, slots_used, slots_available, school_staff_count }
  const portalStatsLoading = ref(false);
  const portalStatsError = ref('');

  const dayProviders = ref([]); // providers added to selected weekday (from school_day_provider_assignments)
  const dayProvidersLoading = ref(false);
  const dayProvidersError = ref('');

  const eligibleProviders = ref([]); // from /school-portal/:id/providers/scheduling
  const eligibleProvidersLoading = ref(false);

  // Per provider/day panel state (caseload + soft slots)
  const providerPanels = ref({}); // key -> { caseloadClients, slots, persisted, loading, saving, error }

  let daysLoadedForSchoolId = null;
  let eligibleProvidersLoadedForSchoolId = null;
  const portalGetOpts = { skipGlobalLoading: true };

  const setSchoolId = (id) => {
    const next = id ? Number(id) : null;
    if (schoolId.value !== next) {
      daysLoadedForSchoolId = null;
      eligibleProvidersLoadedForSchoolId = null;
    }
    schoolId.value = next;
  };

  const reset = () => {
    days.value = weekDays.map((d) => ({ weekday: d, is_active: false, has_providers: false }));
    selectedWeekday.value = null;
    portalStats.value = null;
    portalStatsLoading.value = false;
    portalStatsError.value = '';
    dayProviders.value = [];
    dayProvidersLoading.value = false;
    dayProvidersError.value = '';
    eligibleProviders.value = [];
    eligibleProvidersLoading.value = false;
    providerPanels.value = {};
    daysLoadedForSchoolId = null;
    eligibleProvidersLoadedForSchoolId = null;
  };

  const fetchPortalStats = async ({ force = false } = {}) => {
    if (!schoolId.value) return;
    if (!force && portalStats.value && !portalStatsLoading.value) return;
    portalStatsLoading.value = true;
    portalStatsError.value = '';
    try {
      const r = await api.get(`/school-portal/${schoolId.value}/stats`, portalGetOpts);
      portalStats.value = r.data || null;
    } catch (e) {
      portalStatsError.value = e.response?.data?.error?.message || 'Failed to load portal stats';
      portalStats.value = null;
    } finally {
      portalStatsLoading.value = false;
    }
  };

  const fetchDays = async ({ force = false } = {}) => {
    if (!schoolId.value) return;
    if (!force && daysLoadedForSchoolId === schoolId.value) return;
    const r = await api.get(`/school-portal/${schoolId.value}/days`, portalGetOpts);
    days.value = Array.isArray(r.data) && r.data.length ? r.data : days.value;
    daysLoadedForSchoolId = schoolId.value;
  };

  const addDay = async (weekday) => {
    if (!schoolId.value) return;
    await api.post(`/school-portal/${schoolId.value}/days/${encodeURIComponent(weekday)}`, {});
    daysLoadedForSchoolId = null;
    await fetchDays({ force: true });
  };

  const fetchEligibleProviders = async ({ force = false } = {}) => {
    if (!schoolId.value) return;
    if (!force && eligibleProvidersLoadedForSchoolId === schoolId.value && eligibleProviders.value.length) return;
    eligibleProvidersLoading.value = true;
    try {
      const r = await api.get(`/school-portal/${schoolId.value}/providers/scheduling`, portalGetOpts);
      eligibleProviders.value = Array.isArray(r.data) ? r.data : [];
      eligibleProvidersLoadedForSchoolId = schoolId.value;
    } finally {
      eligibleProvidersLoading.value = false;
    }
  };

  const fetchDayProviders = async (weekday) => {
    if (!schoolId.value) return;
    dayProvidersLoading.value = true;
    dayProvidersError.value = '';
    try {
      const r = await api.get(`/school-portal/${schoolId.value}/days/${encodeURIComponent(weekday)}/providers`, portalGetOpts);
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
    await fetchDays({ force: true });
    await fetchDayProviders(weekday);
  };

  /** Affiliate provider + set PSA day/slots (school staff / admin). */
  const addProviderWithSchedule = async ({
    providerUserId,
    dayOfWeek,
    slotsTotal,
    startTime = null,
    endTime = null,
    days = null
  } = {}) => {
    if (!schoolId.value) throw new Error('School is not loaded');
    const body = days?.length
      ? { providerUserId: Number(providerUserId), days }
      : {
          providerUserId: Number(providerUserId),
          dayOfWeek,
          slotsTotal: Number(slotsTotal),
          startTime: startTime || null,
          endTime: endTime || null
        };
    const r = await api.post(`/school-portal/${schoolId.value}/providers`, body);
    eligibleProvidersLoadedForSchoolId = null;
    daysLoadedForSchoolId = null;
    await Promise.all([fetchEligibleProviders({ force: true }), fetchDays({ force: true })]);
    if (dayOfWeek || (days && days[0]?.dayOfWeek)) {
      const wd = dayOfWeek || days[0].dayOfWeek;
      if (selectedWeekday.value === wd) await fetchDayProviders(wd);
    }
    return r.data;
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
        error: '',
        loaded: false
      };
    }
    return providerPanels.value[key];
  };

  const fetchProviderCaseload = async (weekday, providerUserId) => {
    if (!schoolId.value) return;
    const panel = ensurePanel(weekday, providerUserId);
    const r = await api.get(`/school-portal/${schoolId.value}/providers/${providerUserId}/assigned-clients`, {
      params: { dayOfWeek: weekday },
      skipGlobalLoading: true
    });
    panel.caseloadClients = Array.isArray(r.data) ? r.data : [];
  };

  const fetchSoftSlots = async (weekday, providerUserId) => {
    if (!schoolId.value) return;
    const panel = ensurePanel(weekday, providerUserId);
    const r = await api.get(
      `/school-portal/${schoolId.value}/days/${encodeURIComponent(weekday)}/providers/${providerUserId}/soft-slots`,
      portalGetOpts
    );
    panel.persisted = !!r.data?.persisted;
    panel.slots = Array.isArray(r.data?.slots) ? r.data.slots : [];
  };

  const loadProviderPanel = async (
    weekday,
    providerUserId,
    { force = false, includeSoftSchedule = true, includeCaseload = true } = {}
  ) => {
    const panel = ensurePanel(weekday, providerUserId);
    if (!force && panel.loaded && !panel.error) return;
    panel.loading = true;
    panel.error = '';
    try {
      const tasks = [];
      if (includeCaseload) tasks.push(fetchProviderCaseload(weekday, providerUserId));
      if (includeSoftSchedule) tasks.push(fetchSoftSlots(weekday, providerUserId));
      if (tasks.length) {
        await Promise.all(tasks);
      } else {
        panel.caseloadClients = [];
        panel.slots = [];
      }
      panel.loaded = true;
    } catch (e) {
      panel.error = e.response?.data?.error?.message || 'Failed to load provider panel';
      panel.loaded = false;
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
    portalStats,
    portalStatsLoading,
    portalStatsError,
    dayProviders,
    dayProvidersLoading,
    dayProvidersError,
    eligibleProviders,
    eligibleProvidersLoading,
    eligibleProvidersForSelectedDay,
    providerPanels,
    setSchoolId,
    reset,
    fetchPortalStats,
    fetchDays,
    addDay,
    fetchEligibleProviders,
    fetchDayProviders,
    addProviderToDay,
    addProviderWithSchedule,
    ensurePanel,
    loadProviderPanel,
    saveSoftSlots,
    moveSoftSlot
  };
});

