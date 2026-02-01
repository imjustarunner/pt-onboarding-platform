<template>
  <div class="provider-school-profile">
    <div class="header" data-tour="school-provider-header">
      <button class="btn btn-secondary btn-sm" type="button" @click="backToProviders" data-tour="school-provider-back">← Back</button>
      <button
        class="btn btn-secondary btn-sm"
        type="button"
        @click="toggleClientLabelMode"
        :title="clientLabelMode === 'codes' ? 'Show initials' : 'Show codes'"
        data-tour="school-provider-codes-toggle"
      >
        {{ clientLabelMode === 'codes' ? 'Show initials' : 'Show codes' }}
      </button>
      <div class="spacer" />
    </div>

    <div v-if="loading" class="loading">Loading provider…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <div class="grid">
        <div class="left">
          <div class="profile-hero" data-tour="school-provider-hero">
            <div class="avatar-lg" aria-hidden="true">
              <img v-if="profilePhotoUrl" :src="profilePhotoUrl" alt="" class="avatar-img" />
              <span v-else>{{ initialsFor(profile) }}</span>
            </div>
            <div class="meta">
              <div class="name-row">
                <div class="name" data-tour="school-provider-name">{{ profile?.first_name }} {{ profile?.last_name }}</div>
                <div v-if="availabilityBadges.length" class="avail-badges" aria-label="Availability by day">
                  <span
                    v-for="b in availabilityBadges"
                    :key="b.key"
                    class="day-pill"
                    :class="b.color"
                    :title="`${b.label}: ${b.color === 'red' ? 'Full' : b.color === 'yellow' ? '1 left' : 'Open'}`"
                  >
                    {{ b.label }}
                  </span>
                </div>
              </div>
              <div v-if="availabilityBadges.length" class="avail-legend" aria-label="Availability legend">
                <span class="legend-item">
                  <span class="day-pill green" aria-hidden="true"> </span>
                  <span class="legend-text">2+ slots left</span>
                </span>
                <span class="legend-item">
                  <span class="day-pill yellow" aria-hidden="true"> </span>
                  <span class="legend-text">1 slot left</span>
                </span>
                <span class="legend-item">
                  <span class="day-pill red" aria-hidden="true"> </span>
                  <span class="legend-text">Full</span>
                </span>
              </div>
              <div v-if="profile?.title" class="sub">{{ profile.title }}</div>
              <div v-if="profile?.credential" class="sub">{{ profile.credential }}</div>
              <div v-if="profile?.service_focus" class="sub">{{ profile.service_focus }}</div>
              <div v-if="providerContactLine" class="sub">{{ providerContactLine }}</div>
              <div v-if="normalizedSupervisors.length" class="supervisor-row">
                <div class="supervisor-label">Supervisors</div>
                <div class="supervisor-list">
                  <div
                    v-for="s in normalizedSupervisors"
                    :key="`sup-${s.id}`"
                    class="supervisor-pill"
                    :title="s.is_primary ? 'Primary supervisor' : 'Supervisor'"
                  >
                    <div class="supervisor-avatar" aria-hidden="true">
                      <img
                        v-if="s.profile_photo_url"
                        :src="toUploadsUrl(s.profile_photo_url)"
                        alt=""
                        class="supervisor-avatar-img"
                      />
                      <span v-else class="supervisor-avatar-fallback">{{ initialsFor(s) }}</span>
                    </div>
                    <div class="supervisor-meta">
                      <div class="supervisor-name">
                        {{ s.first_name }} {{ s.last_name }}
                        <span v-if="s.is_primary" class="primary-tag">Primary</span>
                      </div>
                      <div v-if="s.credential" class="supervisor-cred">
                        {{ s.credential }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="profile?.school_info_blurb" class="blurb">
                <strong>Provider info</strong>
                <div class="blurb-text">{{ profile.school_info_blurb }}</div>
              </div>
              <div class="hero-actions" data-tour="school-provider-actions">
                <button class="btn btn-secondary btn-sm" type="button" :disabled="chatWorking" @click="openChat" data-tour="school-provider-message">
                  {{ chatWorking ? 'Opening…' : 'Message provider' }}
                </button>
                <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading">Refresh</button>
              </div>
            </div>
          </div>

          <div class="panel" data-tour="school-provider-daybar-panel">
            <div class="panel-title">Day</div>
            <SchoolDayBar v-model="selectedWeekday" :days="dayBarDays" />
            <div v-if="!selectedWeekday" class="muted">Select a day to open the soft schedule.</div>
          </div>

          <div v-if="selectedWeekday" class="panel" data-tour="school-provider-soft-schedule-panel">
            <div class="panel-title">Soft schedule ({{ selectedWeekday }})</div>
            <div v-if="messagesOpen" class="muted">
              Soft schedule is collapsed while messaging is open.
            </div>
            <SoftScheduleEditor
              v-else
              :slots="softSlots"
              :caseload-clients="selectedDayClients"
              :client-label-mode="clientLabelMode"
              :saving="softSaving"
              :error="softError"
              @save="saveSoftSlots"
              @move="moveSoftSlot"
            />
          </div>

          <div class="panel compact" data-tour="school-provider-caseload-summary">
            <div class="panel-title">Slot-based caseload (summary)</div>
            <div class="summary-grid">
              <div
                v-for="a in (caseload?.assignments || [])"
                :key="a.day_of_week"
                class="summary-row"
                :class="{ inactive: !a.is_active }"
              >
                <div class="day-name">{{ a.day_of_week }}</div>
                <div class="badges">
                  <span class="badge badge-secondary">
                    {{ a.slots_used ?? '—' }} / {{ a.slots_total ?? '—' }} assigned
                  </span>
                  <span v-if="slotsLeftText(a)" class="badge badge-secondary">
                    {{ slotsLeftText(a) }} left
                  </span>
                  <span v-if="a.start_time || a.end_time" class="badge badge-secondary">
                    {{ (a.start_time || '—').toString().slice(0, 5) }}–{{ (a.end_time || '—').toString().slice(0, 5) }}
                  </span>
                </div>
                <div class="chips-mini">
                  <button
                    v-for="c in (a.clients || []).slice(0, 10)"
                    :key="c.id"
                    class="chip-mini"
                    type="button"
                    @click="$emit('open-client', c)"
                    :title="clientTitle(c)"
                  >
                    {{ clientShort(c) }}
                  </button>
                  <span v-if="(a.clients || []).length > 10" class="muted-small">+{{ (a.clients || []).length - 10 }}</span>
                  <span v-if="(a.clients || []).length === 0" class="muted-small">—</span>
                </div>
              </div>
            </div>
          </div>

          <div class="panel" data-tour="school-provider-clients-panel">
            <div class="panel-title">Clients (psychotherapy fiscal-year totals)</div>
            <div v-if="psychotherapyLoading" class="muted">Loading psychotherapy totals…</div>
            <div v-else-if="psychotherapyError" class="muted">Psychotherapy totals unavailable.</div>
            <ClientListGrid
              v-else
              :organization-slug="String(route.params.organizationSlug || '')"
              :organization-id="Number(props.schoolOrganizationId)"
              roster-scope="provider"
              :client-label-mode="clientLabelMode"
              :psychotherapy-totals-by-client-id="psychotherapyTotalsByClientId"
              :show-search="true"
              search-placeholder="Search clients…"
            />
          </div>
        </div>

        <div class="right">
          <div class="panel" data-tour="school-provider-messages-panel">
            <div class="panel-title messages-title">
              <span>Messages</span>
              <button
                v-if="messagesOpen"
                class="btn btn-secondary btn-sm"
                type="button"
                @click="closeMessages"
              >
                Close
              </button>
            </div>

            <div v-if="!messagesOpen" class="muted">
              Click “Message provider” to open the thread.
            </div>

            <div v-else class="messages" data-tour="school-provider-messages-thread">
              <div v-if="messagesError" class="error">{{ messagesError }}</div>
              <div v-else-if="messagesLoading" class="muted">Loading messages…</div>
              <div v-else class="message-list">
                <div v-for="m in messages" :key="m.id" class="bubble" :class="{ mine: Number(m.sender_user_id) === Number(meUserId) }">
                  <div class="bubble-meta">
                    <span class="muted-small">
                      {{ Number(m.sender_user_id) === Number(meUserId) ? 'Me' : 'Them' }}
                    </span>
                    <span class="muted-small">{{ formatTime(m.created_at) }}</span>
                  </div>
                  <div class="bubble-body">{{ m.body }}</div>
                </div>
              </div>

              <div class="composer" data-tour="school-provider-messages-composer">
                <textarea v-model="messageDraft" rows="4" style="width: 100%;" placeholder="Type a message (no PHI)…" />
                <div class="composer-actions">
                  <button class="btn btn-secondary" type="button" :disabled="sendingMessage" @click="refreshMessages">
                    Refresh
                  </button>
                  <button class="btn btn-primary" type="button" :disabled="sendingMessage || !messageDraft.trim()" @click="sendMessage">
                    {{ sendingMessage ? 'Sending…' : 'Send' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../../services/api';
import SchoolDayBar from './SchoolDayBar.vue';
import SoftScheduleEditor from './SoftScheduleEditor.vue';
import ClientListGrid from '../ClientListGrid.vue';
import { useAuthStore } from '../../../store/auth';
import { toUploadsUrl } from '../../../utils/uploadsUrl';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true },
  providerUserId: { type: Number, required: true }
});
defineEmits(['open-client']);

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const meUserId = computed(() => authStore.user?.id || null);

const profilePhotoUrl = computed(() => toUploadsUrl(profile.value?.profile_photo_url || null));

const backToProviders = () => {
  const slug = String(route.params.organizationSlug || '').trim();
  if (!slug) {
    router.back();
    return;
  }
  router.push({ path: `/${slug}/dashboard`, query: { sp: 'providers' } });
};

const profile = ref(null);
const caseload = ref(null);
const loading = ref(false);
const error = ref('');

const psychotherapyTotalsByClientId = ref(null);
const psychotherapyLoading = ref(false);
const psychotherapyError = ref('');
const psychotherapyFiscalYearStart = ref('');

const selectedWeekday = ref(null);

const softSlots = ref([]);
const softLoading = ref(false);
const softSaving = ref(false);
const softError = ref('');

const chatWorking = ref(false);
const chatError = ref('');
const chatThreadId = ref(null);

const messagesOpen = ref(false);
const messagesLoading = ref(false);
const messagesError = ref('');
const messages = ref([]);
const messageDraft = ref('');
const sendingMessage = ref(false);

const clientLabelMode = ref('codes'); // shared portal setting
const toggleClientLabelMode = () => {
  const next = clientLabelMode.value === 'codes' ? 'initials' : 'codes';
  clientLabelMode.value = next;
  try {
    window.localStorage.setItem('schoolPortalClientLabelMode', next);
  } catch {
    // ignore
  }
};
const clientShort = (c) => {
  const mode = String(clientLabelMode.value || 'codes');
  const src = mode === 'initials' ? (c?.initials || c?.identifier_code) : (c?.identifier_code || c?.initials);
  let raw = String(src || '').replace(/\s+/g, '');
  // Preserve casing when displaying initials; codes can be normalized to uppercase.
  if (mode !== 'initials') raw = raw.toUpperCase();
  if (!raw) return '—';
  if (raw.length >= 6) return `${raw.slice(0, 3)}${raw.slice(-3)}`;
  return raw;
};

const clientTitle = (c) => {
  const mode = String(clientLabelMode.value || 'codes');
  if (mode === 'codes' && c?.initials) return `Initials: ${c.initials}`;
  return 'Open client';
};

const weekdayList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const dayBarDays = ref(weekdayList.map((d) => ({ weekday: d, has_providers: false })));
const recomputeDayBar = () => {
  const byDay = new Map();
  (caseload.value?.assignments || []).forEach((a) => {
    if (!a) return;
    const day = String(a.day_of_week || '');
    byDay.set(day, a);
  });

  const availabilityStatusFor = (a) => {
    if (!a?.is_active) return null;
    const total = Number(a?.slots_total ?? 0);
    const used = Number(a?.slots_used ?? 0);
    const totalOk = Number.isFinite(total) && total > 0;
    const usedOk = Number.isFinite(used) && used >= 0;
    const available = totalOk && usedOk ? (total - used) : null;
    if (available === null) return 'green'; // best-effort default for active days
    if (available <= 0) return 'red';
    if (available === 1) return 'yellow';
    return 'green';
  };

  dayBarDays.value = weekdayList.map((d) => {
    const a = byDay.get(d) || null;
    const has = !!a?.is_active;
    return {
      weekday: d,
      has_providers: has,
      availability_status: has ? availabilityStatusFor(a) : null
    };
  });
};

const providerContactLine = computed(() => {
  const p = profile.value || {};
  const phone = String(p.work_phone || p.personal_phone || p.phone_number || '').trim();
  const ext = String(p.work_phone_extension || '').trim();
  if (!phone) return '';
  if (ext) return `${phone} ext ${ext}`;
  return phone;
});

const availabilityBadges = computed(() => {
  const list = Array.isArray(caseload.value?.assignments) ? caseload.value.assignments : [];
  const short = (d) => {
    const s = String(d || '');
    return s === 'Thursday' ? 'Thu' : s.slice(0, 3);
  };
  const out = [];
  for (const a of list) {
    if (!a?.is_active) continue;
    const total = Number(a?.slots_total ?? 0);
    const used = Number(a?.slots_used ?? 0);
    const totalOk = Number.isFinite(total) && total > 0;
    const usedOk = Number.isFinite(used) && used >= 0;
    const available = totalOk && usedOk ? (total - used) : null;
    let color = 'green';
    if (available !== null) {
      if (available <= 0) color = 'red';
      else if (available === 1) color = 'yellow';
      else color = 'green';
    }
    out.push({ key: String(a.day_of_week), label: short(a.day_of_week), color });
  }
  return out;
});

const slotsLeftText = (a) => {
  const total = Number(a?.slots_total);
  const used = Number(a?.slots_used);
  if (Number.isFinite(total) && total >= 0 && Number.isFinite(used) && used >= 0) {
    return String(Math.max(0, total - used));
  }
  const avail = Number(a?.slots_available);
  if (Number.isFinite(avail) && avail >= 0) return String(avail);
  return '';
};

const selectedDayClients = ref([]);
const recomputeSelectedDayClients = () => {
  const day = String(selectedWeekday.value || '');
  const a = (caseload.value?.assignments || []).find((x) => String(x.day_of_week) === day) || null;
  selectedDayClients.value = Array.isArray(a?.clients) ? a.clients : [];
};

const initialsFor = (p) => {
  const f = String(p?.first_name || '').trim();
  const l = String(p?.last_name || '').trim();
  const a = f ? f[0] : '';
  const b = l ? l[0] : '';
  return `${a}${b}`.toUpperCase() || 'P';
};

const normalizedSupervisors = computed(() => {
  const list = Array.isArray(profile.value?.supervisors) ? profile.value.supervisors : [];
  if (list.length) return list;
  const one = profile.value?.supervisor;
  if (one?.id) return [{ ...one, is_primary: true }];
  return [];
});

const computeFiscalYearStartYmd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const startYear = m >= 7 ? y : (y - 1);
  return `${startYear}-07-01`;
};

const loadPsychotherapyCompliance = async () => {
  try {
    psychotherapyLoading.value = true;
    psychotherapyError.value = '';
    psychotherapyTotalsByClientId.value = null;
    if (!psychotherapyFiscalYearStart.value) {
      psychotherapyFiscalYearStart.value = computeFiscalYearStartYmd(new Date());
    }
    const aff = await api.get(`/school-portal/${props.schoolOrganizationId}/affiliation`);
    const agencyId = aff.data?.active_agency_id ? Number(aff.data.active_agency_id) : null;
    if (!agencyId) return;
    const r = await api.get('/psychotherapy-compliance/summary', {
      params: { agencyId, fiscalYearStart: psychotherapyFiscalYearStart.value }
    });
    const matched = Array.isArray(r.data?.matched) ? r.data.matched : [];
    const m = {};
    for (const row of matched) {
      if (!row?.client_id) continue;
      m[String(row.client_id)] = {
        total: Number(row?.total || 0),
        per_code: row?.per_code || {},
        client_abbrev: row?.client_abbrev || null,
        surpassed_24: !!row?.surpassed_24
      };
    }
    psychotherapyTotalsByClientId.value = m;
  } catch (e) {
    // Non-blocking: if the agency context isn't available or access is denied, don't break the profile.
    psychotherapyError.value = e?.response?.data?.error?.message || '';
    psychotherapyTotalsByClientId.value = null;
  } finally {
    psychotherapyLoading.value = false;
  }
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';

    const [p, c] = await Promise.all([
      api.get(`/school-portal/${props.schoolOrganizationId}/providers/${props.providerUserId}/profile`),
      api.get(`/school-portal/${props.schoolOrganizationId}/providers/${props.providerUserId}/caseload-slots`)
    ]);
    profile.value = p.data || null;
    caseload.value = c.data || null;
    recomputeDayBar();
    recomputeSelectedDayClients();
    await loadPsychotherapyCompliance();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load provider profile';
  } finally {
    loading.value = false;
  }
};

const fetchSoftSlots = async () => {
  if (!selectedWeekday.value) return;
  try {
    softLoading.value = true;
    softError.value = '';
    const r = await api.get(
      `/school-portal/${props.schoolOrganizationId}/days/${encodeURIComponent(String(selectedWeekday.value))}/providers/${props.providerUserId}/soft-slots`
    );
    softSlots.value = Array.isArray(r.data?.slots) ? r.data.slots : [];
  } catch (e) {
    softError.value = e.response?.data?.error?.message || 'Failed to load soft schedule';
    softSlots.value = [];
  } finally {
    softLoading.value = false;
  }
};

const saveSoftSlots = async (slots) => {
  if (!selectedWeekday.value) return;
  try {
    softSaving.value = true;
    softError.value = '';
    await api.put(
      `/school-portal/${props.schoolOrganizationId}/days/${encodeURIComponent(String(selectedWeekday.value))}/providers/${props.providerUserId}/soft-slots`,
      { slots }
    );
    await fetchSoftSlots();
  } catch (e) {
    softError.value = e.response?.data?.error?.message || 'Failed to save soft schedule';
  } finally {
    softSaving.value = false;
  }
};

const moveSoftSlot = async ({ slotId, direction }) => {
  if (!selectedWeekday.value || !slotId) return;
  try {
    softSaving.value = true;
    softError.value = '';
    await api.post(
      `/school-portal/${props.schoolOrganizationId}/days/${encodeURIComponent(String(selectedWeekday.value))}/providers/${props.providerUserId}/soft-slots/${slotId}/move`,
      { direction }
    );
    await fetchSoftSlots();
  } catch (e) {
    softError.value = e.response?.data?.error?.message || 'Failed to move slot';
  } finally {
    softSaving.value = false;
  }
};

const formatTime = (d) => {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return '';
  }
};

const refreshMessages = async () => {
  if (!chatThreadId.value) return;
  try {
    messagesLoading.value = true;
    messagesError.value = '';
    const r = await api.get(`/chat/threads/${chatThreadId.value}/messages`, { params: { limit: 120 } });
    messages.value = Array.isArray(r.data) ? r.data : [];
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || 'Failed to load messages';
    messages.value = [];
  } finally {
    messagesLoading.value = false;
  }
};

const closeMessages = () => {
  messagesOpen.value = false;
  messageDraft.value = '';
};

const openChat = async () => {
  try {
    chatWorking.value = true;
    chatError.value = '';
    // Resolve active agency for this school/program org (used for chat threading + notifications).
    const aff = await api.get(`/school-portal/${props.schoolOrganizationId}/affiliation`);
    const agencyId = aff.data?.active_agency_id ? Number(aff.data.active_agency_id) : null;
    if (!agencyId) {
      chatError.value = 'No active agency affiliation found for this organization.';
      return;
    }
    const r = await api.post('/chat/threads/direct', {
      agencyId,
      organizationId: Number(props.schoolOrganizationId),
      otherUserId: Number(props.providerUserId)
    });
    chatThreadId.value = r.data?.threadId || null;
    if (!chatThreadId.value) {
      chatError.value = 'Unable to open chat thread.';
      return;
    }
    messagesOpen.value = true;
    messageDraft.value = '';
    await refreshMessages();
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || e.message || 'Failed to open chat';
  } finally {
    chatWorking.value = false;
  }
};

const sendMessage = async () => {
  if (!chatThreadId.value) return;
  const body = String(messageDraft.value || '').trim();
  if (!body) return;
  try {
    sendingMessage.value = true;
    messagesError.value = '';
    await api.post(`/chat/threads/${chatThreadId.value}/messages`, { body });
    messageDraft.value = '';
    await refreshMessages();
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || e.message || 'Failed to send message';
  } finally {
    sendingMessage.value = false;
  }
};

onMounted(load);
watch(() => [props.schoolOrganizationId, props.providerUserId], load);

onMounted(() => {
  try {
    const saved = window.localStorage.getItem('schoolPortalClientLabelMode');
    if (saved === 'codes' || saved === 'initials') clientLabelMode.value = saved;
  } catch {
    // ignore
  }
});


watch(selectedWeekday, async () => {
  recomputeSelectedDayClients();
  await fetchSoftSlots();
});

// If routed from the Providers directory "Message" button, auto-open chat.
watch(
  () => [String(route.query?.chat || ''), profile.value?.provider_user_id],
  async ([chat, pid]) => {
    if (chat !== '1') return;
    if (!pid) return;
    if (messagesOpen.value) return;
    await openChat();
  },
  { immediate: true }
);
</script>

<style scoped>
.provider-school-profile {
  display: grid;
  gap: 12px;
}
.header {
  display: flex;
  gap: 10px;
  align-items: center;
}
.spacer { flex: 1; }
.loading, .error { padding: 10px 0; }
.error { color: #c33; }

.grid {
  display: grid;
  grid-template-columns: 1.45fr 0.95fr;
  gap: 12px;
  align-items: start;
}
.left, .right { display: grid; gap: 12px; }
.profile-hero {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  padding: 16px;
}
.avatar-lg {
  width: 280px;
  height: 280px;
  border-radius: 44px;
  border: 1px solid var(--border);
  background: var(--bg);
  display: grid;
  place-items: center;
  overflow: hidden;
  font-weight: 900;
  flex: 0 0 auto;
  font-size: 56px;
}
.avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.name {
  font-weight: 900;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.avail-badges {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex: 0 0 auto;
}
.avail-legend {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.legend-text { line-height: 1; }
.avail-legend .day-pill {
  width: 14px;
  height: 14px;
  padding: 0;
  border-radius: 999px;
}
.supervisor-row {
  margin-top: 10px;
  display: grid;
  gap: 6px;
}
.supervisor-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.supervisor-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.supervisor-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  border-radius: 999px;
  padding: 6px 10px;
  width: fit-content;
  max-width: 100%;
}
.supervisor-avatar {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: white;
  overflow: hidden;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}
.supervisor-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.supervisor-avatar-fallback {
  font-size: 11px;
  font-weight: 900;
  color: var(--text-secondary);
}
.supervisor-meta {
  min-width: 0;
}
.supervisor-name {
  font-size: 13px;
  font-weight: 900;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.primary-tag {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 900;
  color: #065f46;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.28);
  padding: 2px 8px;
  border-radius: 999px;
}
.supervisor-cred {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.day-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-primary);
}
.day-pill.green {
  border-color: rgba(16, 185, 129, 0.55);
  background: rgba(16, 185, 129, 0.08);
}
.day-pill.yellow {
  border-color: rgba(245, 158, 11, 0.65);
  background: rgba(245, 158, 11, 0.10);
}
.day-pill.red {
  border-color: rgba(239, 68, 68, 0.65);
  background: rgba(239, 68, 68, 0.10);
}
.sub { color: var(--text-secondary); margin-top: 2px; }
 .hero-actions { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.blurb {
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  padding: 10px;
}
.blurb-text {
  margin-top: 6px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  max-height: 220px;
  overflow: auto;
}
label {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.input {
  width: 100%;
  margin-top: 6px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
}

.panel {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  padding: 14px;
}
.panel.compact { padding: 12px; }
.panel-title {
  font-weight: 900;
  color: var(--text-primary);
  margin-bottom: 10px;
}
.messages-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.messages {
  display: grid;
  gap: 10px;
}
.message-list {
  max-height: 56vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}
.bubble {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--bg);
}
.bubble.mine {
  margin-left: auto;
  background: #ecfdf5;
  border-color: #a7f3d0;
}
.bubble-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.bubble-body {
  white-space: pre-wrap;
}
.composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}
.summary-grid { display: grid; gap: 8px; }
.summary-row {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  padding: 10px;
  display: grid;
  gap: 8px;
}
.summary-row.inactive { opacity: 0.7; }
.day-name { font-weight: 900; }
.badges { display: flex; gap: 8px; flex-wrap: wrap; }
.chips-mini { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.chip-mini {
  border: 1px solid var(--border);
  background: white;
  border-radius: 999px;
  padding: 6px 8px;
  font-weight: 900;
  letter-spacing: 0.05em;
  font-size: 11px;
}
.dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--danger, #d92d20);
  margin-left: 8px;
  vertical-align: middle;
}
.muted { color: var(--text-secondary); font-size: 13px; }
.muted-small { color: var(--text-secondary); font-size: 12px; }

@media (max-width: 1100px) {
  .grid { grid-template-columns: 1fr; }
  .avatar-lg {
    width: 200px;
    height: 200px;
    border-radius: 34px;
    font-size: 40px;
  }
}
</style>

