<template>
  <div class="csbp">
    <p class="hint csbp-lead">
      Integrated program groups and company events for this student (same content as the school portal Skill Builders
      area). Event discussion lives in each event’s portal.
    </p>

    <div v-if="builderLoading" class="muted">Loading…</div>
    <div v-else-if="builderError" class="error">{{ builderError }}</div>
    <template v-else>
      <div v-if="intakeComplete != null" class="csbp-readiness muted small">
        <span><strong>Intake:</strong> {{ intakeComplete ? 'Complete' : 'Needed' }}</span>
        <span class="csbp-dot" aria-hidden="true">·</span>
        <span><strong>Treatment plan:</strong> {{ treatmentPlanComplete ? 'Complete' : 'Needed' }}</span>
      </div>

      <div class="sb-tab-panel">
        <div class="sb-tab-head">
          <button
            v-if="selectedSkillEvent"
            type="button"
            class="btn btn-secondary btn-sm"
            @click="selectedSkillEvent = null"
          >
            ← Events list
          </button>
          <h3 class="sb-tab-title">Events / groups</h3>
        </div>

        <template v-if="selectedSkillEvent">
          <section class="sb-section">
            <h4>{{ selectedSkillEvent.eventTitle || selectedSkillEvent.skillsGroupName }}</h4>
            <p class="muted">
              {{ selectedSkillEvent.schoolName || '' }}
              <span v-if="formatSbRange(selectedSkillEvent)"> · {{ formatSbRange(selectedSkillEvent) }}</span>
            </p>
            <p
              v-if="selectedSkillEvent.eventDescription && !(selectedSkillEvent.meetings || []).length"
              class="sb-desc"
            >
              {{ selectedSkillEvent.eventDescription }}
            </p>
            <template v-if="(selectedSkillEvent.meetings || []).length">
              <p class="sb-subh sb-meetings-heading">Weekly meetings</p>
              <ul class="sb-list">
                <li v-for="(m, idx) in selectedSkillEvent.meetings" :key="idx">
                  {{ m.weekday }} · {{ formatSbClock(m.startTime) }}–{{ formatSbClock(m.endTime) }}
                </li>
              </ul>
            </template>
            <p v-else class="muted small">No weekly meeting pattern on file.</p>
          </section>
          <section class="sb-section">
            <h4>Providers</h4>
            <ul v-if="(selectedSkillEvent.providers || []).length" class="sb-list">
              <li v-for="p in selectedSkillEvent.providers" :key="p.id">{{ p.firstName }} {{ p.lastName }}</li>
            </ul>
            <p v-else class="muted">No providers listed yet.</p>
          </section>
          <section class="sb-section">
            <h4>This student</h4>
            <ul class="sb-list sb-flat">
              <li v-if="builderClientSummary?.initials">Initials: {{ builderClientSummary.initials }}</li>
              <li v-if="builderClientSummary?.grade">Grade: {{ builderClientSummary.grade }}</li>
              <li v-if="builderClientSummary?.ageYears != null">Age: {{ builderClientSummary.ageYears }}</li>
              <li v-else-if="builderClientSummary?.dateOfBirth">Date of birth: {{ builderClientSummary.dateOfBirth }}</li>
              <li>
                Documents / paperwork:
                {{ builderClientSummary?.paperworkStatusLabel || builderClientSummary?.documentStatus || '—' }}
              </li>
              <li v-if="builderClientSummary?.clientStatusLabel">Status: {{ builderClientSummary.clientStatusLabel }}</li>
            </ul>
          </section>
          <div class="sb-portal-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="!organizationSlugForPortal"
              :title="!organizationSlugForPortal ? 'Open from an org URL (e.g. /your-org/dashboard) to enable portal links' : ''"
              @click="goSkillBuilderEventPortal(selectedSkillEvent)"
            >
              Open event portal
            </button>
            <button type="button" class="btn btn-secondary btn-sm" @click="selectedSkillEvent = null">More events</button>
          </div>
          <div
            v-if="canCoordinatorConfirm && selectedSkillEvent.companyEventId && !selectedSkillEvent.activeForProviders"
            class="sb-row-actions"
            style="margin-top: 10px"
          >
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="confirmBusyId === selectedSkillEvent.companyEventId"
              @click="confirmEventForClient(selectedSkillEvent.companyEventId)"
            >
              Confirm active for providers
            </button>
          </div>
        </template>

        <template v-else>
          <section class="sb-section">
            <div class="sb-events-toolbar">
              <h4 class="sb-events-title">Events</h4>
              <label class="sb-past-toggle">
                <input v-model="showPastSkillEvents" type="checkbox" />
                Show past events
              </label>
            </div>
            <p v-if="upcomingSbEvents.length" class="sb-subh">Upcoming &amp; current</p>
            <ul v-if="upcomingSbEvents.length" class="sb-event-pick">
              <li v-for="ev in upcomingSbEvents" :key="`u-${ev.skillsGroupId}`">
                <button type="button" class="sb-event-btn" @click="selectedSkillEvent = ev">
                  <span class="sb-event-name">{{ ev.eventTitle || ev.skillsGroupName }}</span>
                  <span class="muted sb-event-when">{{ formatSbRange(ev) }}</span>
                  <span class="muted sb-event-school">{{ ev.schoolName }}</span>
                </button>
              </li>
            </ul>
            <p v-else class="muted">No current or upcoming events.</p>
            <template v-if="showPastSkillEvents && pastSbEvents.length">
              <p class="sb-subh">Past</p>
              <ul class="sb-event-pick">
                <li v-for="ev in pastSbEvents" :key="`p-${ev.skillsGroupId}`">
                  <button type="button" class="sb-event-btn" @click="selectedSkillEvent = ev">
                    <span class="sb-event-name">{{ ev.eventTitle || ev.skillsGroupName }}</span>
                    <span class="muted sb-event-when">{{ formatSbRange(ev) }}</span>
                    <span class="muted sb-event-school">{{ ev.schoolName }}</span>
                  </button>
                </li>
              </ul>
            </template>
          </section>

          <section class="sb-section">
            <h4>Approved non-guardian pickups</h4>
            <ul v-if="builderPickups.length" class="sb-list">
              <li v-for="p in builderPickups" :key="p.id">
                {{ p.display_name || p.displayName }}
                <span v-if="p.relationship" class="muted"> · {{ p.relationship }}</span>
                <span v-if="p.phone" class="muted"> · {{ p.phone }}</span>
              </li>
            </ul>
            <p v-else class="muted">None recorded.</p>
            <div v-if="canEditPickups" class="sb-mini-form">
              <input v-model="pickupDraft.name" class="input" placeholder="Name" />
              <input v-model="pickupDraft.relationship" class="input" placeholder="Relationship" />
              <input v-model="pickupDraft.phone" class="input" placeholder="Phone" />
              <button type="button" class="btn btn-primary btn-sm" :disabled="pickupSaving" @click="savePickup">
                {{ pickupSaving ? 'Saving…' : 'Add pickup' }}
              </button>
            </div>
          </section>

          <section class="sb-section">
            <h4>Program notes</h4>
            <p class="muted small">
              Client-scoped Skill Builders notes use category <strong>skill_builders</strong> in Messages / Notes. Event-wide
              discussion is in each <strong>event portal</strong>.
            </p>
          </section>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import { formatSkillBuilderWallTime12h } from '../../utils/skillBuildersDisplay.js';

const props = defineProps({
  client: { type: Object, required: true }
});

const emit = defineEmits(['program-updated']);

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());

const canCoordinatorConfirm = computed(() =>
  ['admin', 'staff', 'support', 'super_admin'].includes(roleNorm.value)
);

const canEditPickups = computed(() => {
  const r = roleNorm.value;
  return ['super_admin', 'admin', 'staff', 'support', 'provider', 'provider_plus', 'supervisor'].includes(r);
});

const organizationSlugForPortal = computed(() => String(route.params.organizationSlug || '').trim());

const agencyId = computed(() => Number(props.client?.agency_id || props.client?.agencyId || 0));
const clientId = computed(() => Number(props.client?.id || 0));

const builderLoading = ref(false);
const builderError = ref('');
const builderEvents = ref([]);
const builderClientSummary = ref(null);
const intakeComplete = ref(null);
const treatmentPlanComplete = ref(null);
const selectedSkillEvent = ref(null);
const showPastSkillEvents = ref(false);
const builderPickups = ref([]);
const pickupDraft = ref({ name: '', relationship: '', phone: '' });
const pickupSaving = ref(false);
const confirmBusyId = ref(null);

function sbEventEndMs(ev) {
  const raw = ev?.eventEndsAt || ev?.groupEndDate;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

const upcomingSbEvents = computed(() => {
  const now = Date.now();
  return (builderEvents.value || []).filter((ev) => sbEventEndMs(ev) >= now || !sbEventEndMs(ev));
});

const pastSbEvents = computed(() => {
  const now = Date.now();
  return (builderEvents.value || []).filter((ev) => sbEventEndMs(ev) > 0 && sbEventEndMs(ev) < now);
});

function formatSbRange(ev) {
  const a = ev?.eventStartsAt ? new Date(ev.eventStartsAt) : null;
  const b = ev?.eventEndsAt ? new Date(ev.eventEndsAt) : null;
  if (a && Number.isFinite(a.getTime())) {
    try {
      const opt = { dateStyle: 'medium' };
      const end = b && Number.isFinite(b.getTime()) ? b.toLocaleDateString(undefined, opt) : '';
      return end ? `${a.toLocaleDateString(undefined, opt)} – ${end}` : a.toLocaleDateString(undefined, opt);
    } catch {
      return '';
    }
  }
  if (ev?.groupStartDate || ev?.groupEndDate) {
    return `${formatDateShort(ev.groupStartDate)} – ${formatDateShort(ev.groupEndDate)}`;
  }
  return '';
}

function formatSbClock(t) {
  return formatSkillBuilderWallTime12h(t);
}

function formatDateShort(d) {
  if (!d) return '—';
  return String(d).slice(0, 10);
}

function goSkillBuilderEventPortal(ev) {
  const id = Number(ev?.companyEventId || 0);
  if (!id || !organizationSlugForPortal.value) return;
  router.push(`/${organizationSlugForPortal.value}/skill-builders/event/${id}`);
}

async function loadBuilderDetail() {
  const aid = agencyId.value;
  const cid = clientId.value;
  if (!aid || !cid) return;
  builderLoading.value = true;
  builderError.value = '';
  try {
    const res = await api.get(`/skill-builders/clients/${cid}/builder-detail`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    builderClientSummary.value = res.data?.clientSummary || null;
    builderEvents.value = Array.isArray(res.data?.events) ? res.data.events : [];
    builderPickups.value = Array.isArray(res.data?.transportPickups) ? res.data.transportPickups : [];
    intakeComplete.value = res.data?.intakeComplete ?? null;
    treatmentPlanComplete.value = res.data?.treatmentPlanComplete ?? null;
    selectedSkillEvent.value = null;
  } catch (e) {
    builderError.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    builderEvents.value = [];
    builderPickups.value = [];
    intakeComplete.value = null;
    treatmentPlanComplete.value = null;
  } finally {
    builderLoading.value = false;
  }
}

async function savePickup() {
  const aid = agencyId.value;
  const cid = clientId.value;
  const displayName = String(pickupDraft.value.name || '').trim();
  if (!aid || !cid || !displayName) return;
  pickupSaving.value = true;
  try {
    await api.post(`/skill-builders/clients/${cid}/transport-pickups`, {
      agencyId: aid,
      displayName,
      relationship: pickupDraft.value.relationship || '',
      phone: pickupDraft.value.phone || ''
    });
    pickupDraft.value = { name: '', relationship: '', phone: '' };
    await loadBuilderDetail();
    emit('program-updated');
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed to save');
  } finally {
    pickupSaving.value = false;
  }
}

async function confirmEventForClient(eventId) {
  const aid = agencyId.value;
  const cid = clientId.value;
  if (!aid || !cid || !eventId) return;
  confirmBusyId.value = eventId;
  try {
    await api.post(`/skill-builders/events/${eventId}/clients/${cid}/confirm-active`, { agencyId: aid });
    await loadBuilderDetail();
    emit('program-updated');
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed to confirm');
  } finally {
    confirmBusyId.value = null;
  }
}

watch(
  () => [props.client?.id, props.client?.agency_id, props.client?.agencyId],
  () => {
    loadBuilderDetail();
  },
  { immediate: true }
);
</script>

<style scoped>
.csbp {
  max-width: 720px;
}
.csbp-lead {
  margin: 0 0 14px;
  line-height: 1.45;
}
.csbp-readiness {
  margin-bottom: 12px;
}
.csbp-dot {
  margin: 0 6px;
}
.sb-tab-panel {
  margin-bottom: 12px;
}
.sb-tab-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.sb-tab-title {
  margin: 0;
  font-size: 1.1rem;
}
.sb-section {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: var(--bg, #fff);
}
.sb-section h4 {
  margin: 0 0 8px;
  font-size: 0.95rem;
}
.sb-list {
  margin: 0;
  padding-left: 1.2rem;
}
.sb-row-actions {
  margin-top: 6px;
}
.sb-mini-form {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  max-width: 420px;
}
.sb-events-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.sb-events-title {
  margin: 0;
  font-size: 1rem;
}
.sb-past-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
}
.sb-subh {
  margin: 12px 0 6px;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #64748b);
}
.sb-event-pick {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sb-event-btn {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--bg-alt, #f8fafc);
  cursor: pointer;
  transition: border-color 0.15s ease;
  font: inherit;
}
.sb-event-btn:hover {
  border-color: var(--primary, #0f766e);
}
.sb-event-name {
  display: block;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
}
.sb-event-when,
.sb-event-school {
  display: block;
  font-size: 0.82rem;
  margin-top: 2px;
}
.sb-portal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.sb-desc {
  margin: 8px 0 0;
  font-size: 0.9rem;
  white-space: pre-wrap;
}
.sb-flat {
  list-style: none;
  padding-left: 0;
}
.small {
  font-size: 0.82rem;
}
.muted {
  color: var(--text-secondary, #64748b);
}
.error {
  color: #b91c1c;
}
</style>
