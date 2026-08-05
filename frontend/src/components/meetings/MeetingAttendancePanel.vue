<template>
  <div class="map" :class="{ 'map--dark': dark }" data-testid="meeting-attendance-panel">
    <div class="map__head">
      <h4>
        {{ trackingEnabled ? t('Attendance', lang) : t('Participants', lang) }}
        <span v-if="presentCount" class="map__present" title="In room now">{{ presentCount }} {{ t('In room', lang) }}</span>
        <span v-if="raisedHands" class="map__hands" title="Hands raised">✋ {{ raisedHands }}</span>
        <span v-if="mutedCount" class="map__muted-summary" title="Muted participants">🔇 {{ mutedCount }}</span>
      </h4>
      <div class="map__actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="!copyNames" @click="copy(copyNames)">
          {{ t('Copy names', lang) }}
        </button>
        <button v-if="trackingEnabled" type="button" class="btn btn-secondary btn-sm" :disabled="!copyWithTime" @click="copy(copyWithTime)">
          {{ t('Copy with time', lang) }}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="load">{{ t('Refresh', lang) }}</button>
      </div>
    </div>
    <p v-if="meetingCompletedAt" class="muted map__meta">
      {{ t('Session completed', lang) }} {{ formatWhen(meetingCompletedAt) }}
    </p>
    <p v-if="!trackingEnabled" class="map__live-only" role="status">
      {{ t('Live participant list only — attendance time is not being tracked for this meeting.', lang) }}
    </p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading {{ trackingEnabled ? 'attendance' : 'participants' }}…</p>
    <template v-else>
      <ul v-if="presentParticipants.length" class="map__list">
        <li
          v-for="p in presentParticipants"
          :key="p.userId"
        >
          <span class="map__name">
            {{ p.name }}
            <span v-if="p.isHost" class="map__host">{{ t('Host', lang) }}</span>
            <span v-else-if="p.isRequired === false" class="map__optional">{{ t('Optional', lang) }}</span>
            <span v-else class="map__required">{{ t('Mandatory', lang) }}</span>
            <span v-if="participantHasRaisedHand(p)" class="map__hand-hint" title="Hand raised">✋</span>
            <span v-if="participantIsMuted(p)" class="map__mute-hint" title="Muted">{{ t('Muted', lang) }}</span>
            <span class="map__status map__status--active">{{ t('In room', lang) }}</span>
          </span>
          <span v-if="trackingEnabled" class="map__mins">
            {{ formatMins(p.totalMinutes) }}
            <small v-if="Number(p.segmentCount || 0) > 1" class="map__segments" title="Total time sums all join/leave segments">
              {{ p.segmentCount }} segments
            </small>
            <small v-if="Number(p.waitMinutes || 0) > 0" class="map__wait" title="Waiting-room time (not counted toward session pay)">
              wait {{ formatMins(p.waitMinutes) }}
            </small>
          </span>
        </li>
      </ul>
      <p v-else class="muted">
        {{ trackingEnabled ? 'No attendance recorded yet.' : 'No one is in the meeting right now.' }}
      </p>

      <!-- Invited but not yet in room -->
      <template v-if="absentParticipants.length">
        <button type="button" class="map__invited-toggle" @click="showAbsent = !showAbsent">
          {{ showAbsent ? 'Hide' : 'Show' }} {{ absentParticipants.length }} invited{{ showAbsent ? '' : ' not yet here' }}
          <span class="map__invited-caret" :class="{ 'map__invited-caret--open': showAbsent }">▾</span>
        </button>
        <ul v-if="showAbsent" class="map__list map__list--absent">
          <li
            v-for="p in absentParticipants"
            :key="p.userId"
            class="map__list-item--away"
          >
            <span class="map__name">
              {{ p.name }}
              <span v-if="p.isHost" class="map__host">Host</span>
              <span v-else-if="p.isRequired === false" class="map__optional">Optional</span>
              <span v-else class="map__required">Mandatory</span>
              <span v-if="p.leftAt" class="map__status map__status--left">Left {{ formatWhen(p.leftAt) }}</span>
              <span v-else class="map__status map__status--away">Not here</span>
            </span>
            <span v-if="trackingEnabled" class="map__mins">
              {{ formatMins(p.totalMinutes) }}
              <small v-if="Number(p.segmentCount || 0) > 1" class="map__segments">
                {{ p.segmentCount }} segments
              </small>
            </span>
          </li>
        </ul>
      </template>
    </template>
    <p v-if="copied" class="map__copied">Copied</p>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import api from '../../services/api';
import { t, useMeetingLang } from '../../composables/useMeetingI18n.js';

const emit = defineEmits(['tracking-status']);
const lang = useMeetingLang();
const showAbsent = ref(false);

const props = defineProps({
  eventId: { type: [Number, String], required: true },
  /** team-meeting (default) or supervision */
  meetingKind: { type: String, default: 'team-meeting' },
  /** When true, refresh totals every few seconds while the panel is mounted. */
  livePoll: { type: Boolean, default: false },
  /** Whether elapsed attendance time is enabled for this meeting. */
  trackingEnabled: { type: Boolean, default: true },
  /** Count of currently raised hands in the live room */
  raisedHands: { type: Number, default: 0 },
  /** Display names of participants with a raised hand */
  raisedHandNames: { type: Array, default: () => [] },
  /** Display names of participants who are muted */
  mutedNames: { type: Array, default: () => [] },
  /** Apply dark-context styles (meeting workspace background is dark) */
  dark: { type: Boolean, default: false }
});

const mutedCount = computed(() => (props.mutedNames || []).length);
const presentParticipants = computed(() => (participants.value || []).filter((p) => p.isPresent));
const absentParticipants = computed(() => (participants.value || []).filter((p) => !p.isPresent));
const presentCount = computed(() => presentParticipants.value.length);

const loading = ref(false);
const error = ref('');
const participants = ref([]);
const copyNames = ref('');
const copyWithTime = ref('');
const meetingCompletedAt = ref(null);
const copied = ref(false);
let pollTimer = null;

function formatMins(m) {
  const n = Number(m || 0);
  if (!Number.isFinite(n)) return '0m';
  return `${Math.round(n * 10) / 10}m`;
}

function formatWhen(raw) {
  try {
    return new Date(raw).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return String(raw || '');
  }
}

function normalizeParticipantName(name) {
  const parts = String(name || '')
    .split(/[·|]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^(you|host|participant|supervisor|supervisee|guest|co-?host)$/i.test(p));
  const core = parts.length ? parts[parts.length - 1] : String(name || '').trim();
  return core.toLowerCase();
}

function namesMatch(participantName, signalName) {
  const left = normalizeParticipantName(participantName);
  const right = normalizeParticipantName(signalName);
  if (!left || !right) return false;
  if (left === right || right.endsWith(left) || left.endsWith(right)) return true;
  // Email vs display-name: compare local-part before @.
  const leftLocal = left.includes('@') ? left.split('@')[0] : left;
  const rightLocal = right.includes('@') ? right.split('@')[0] : right;
  return !!leftLocal && !!rightLocal && (leftLocal === rightLocal
    || rightLocal.endsWith(leftLocal)
    || leftLocal.endsWith(rightLocal));
}

function participantHasRaisedHand(participant) {
  return (props.raisedHandNames || []).some((raw) => namesMatch(participant?.name, raw));
}

function participantIsMuted(participant) {
  return (props.mutedNames || []).some((raw) => namesMatch(participant?.name, raw));
}

function attendanceUrl() {
  const id = Number(props.eventId || 0);
  if (!id) return '';
  if (String(props.meetingKind || '').toLowerCase() === 'supervision') {
    return `/supervision/sessions/${id}/live-attendance`;
  }
  return `/team-meetings/${id}/attendance`;
}

async function load({ quiet = false } = {}) {
  const eid = Number(props.eventId || 0);
  if (!eid) return;
  const url = attendanceUrl();
  if (!url) return;
  if (!quiet) loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(url, {
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    participants.value = Array.isArray(data?.participants) ? data.participants : [];
    copyNames.value = String(data?.copyNamesCsv || '');
    copyWithTime.value = String(data?.copyNamesWithTimeCsv || '');
    meetingCompletedAt.value = data?.meetingCompletedAt || null;
    if (data?.attendanceTrackingEnabled != null) {
      emit('tracking-status', !!data.attendanceTrackingEnabled);
    }
  } catch (e) {
    if (!quiet) {
      error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load attendance';
    }
  } finally {
    if (!quiet) loading.value = false;
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  if (!props.livePoll) return;
  pollTimer = setInterval(() => { void load({ quiet: true }); }, 8000);
}

async function copy(text) {
  const t = String(text || '').trim();
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1600);
  } catch {
    error.value = 'Unable to copy to clipboard';
  }
}

watch(() => [props.eventId, props.meetingKind], () => {
  void load();
  startPolling();
});
watch(() => props.livePoll, () => startPolling());
onMounted(() => {
  void load();
  startPolling();
});
onUnmounted(stopPolling);

defineExpose({ load });
</script>

<style scoped>
.map { display: flex; flex-direction: column; gap: 10px; }
.map__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.map__head h4 { margin: 0; font-size: 0.95rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.map__present {
  font-size: 0.72rem;
  font-weight: 700;
  background: #dcfce7;
  color: #166534;
  border-radius: 999px;
  padding: 2px 8px;
}
.map__hands {
  font-size: 0.75rem;
  font-weight: 700;
  background: #fef3c7;
  color: #92400e;
  border-radius: 999px;
  padding: 2px 8px;
}
.map__muted-summary {
  font-size: 0.75rem;
  font-weight: 700;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 999px;
  padding: 2px 8px;
}
.map__hand-hint {
  margin-left: 4px;
  display: inline-grid;
  place-items: center;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  font-size: 0.82rem;
  background: #fef3c7;
  border: 1px solid #fcd34d;
}
.map__mute-hint {
  margin-left: 4px;
  display: inline-block;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #991b1b;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 999px;
  padding: 1px 6px;
  vertical-align: middle;
}
.map__status {
  margin-left: 6px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border-radius: 999px;
  padding: 1px 6px;
  vertical-align: middle;
}
.map__status--active { color: #166534; background: #dcfce7; }
.map__status--left { color: #9a3412; background: #ffedd5; }
.map__status--away { color: #64748b; background: #f1f5f9; }
.map__actions { display: flex; gap: 6px; flex-wrap: wrap; }
.map__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.map__list li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.86rem;
  align-items: flex-start;
  flex-wrap: wrap;
}
.map__name {
  flex: 1 1 12rem;
  min-width: 0;
  line-height: 1.35;
  word-break: break-word;
}
.map__list-item--away .map__mins { color: #94a3b8; }
.map__mins {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  white-space: nowrap;
  color: #64748b;
  font-size: 0.82rem;
  flex: 0 0 auto;
  margin-left: auto;
}
.map__wait {
  font-size: 0.68rem;
  font-weight: 650;
  color: #94a3b8;
}
.map__segments {
  font-size: 0.68rem;
  font-weight: 650;
  color: #64748b;
}
.map__host {
  margin-left: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #0f766e;
}
.map__required {
  margin-left: 6px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #9a3412;
  background: #ffedd5;
  border-radius: 999px;
  padding: 1px 7px;
}
.map__optional {
  margin-left: 6px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 999px;
  padding: 1px 7px;
}
.map__mins { font-variant-numeric: tabular-nums; color: #475569; flex-shrink: 0; }
.map__copied { margin: 0; font-size: 0.8rem; color: #15803d; }
.map__meta { margin: 0; font-size: 0.8rem; }
.map__live-only {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #eff6ff;
  color: #1e40af;
  font-size: 0.8rem;
  font-weight: 650;
  line-height: 1.4;
}
.map__list--absent { opacity: 0.82; }
.map__invited-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  padding: 4px 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  letter-spacing: 0.02em;
}
.map__invited-toggle:hover { color: #1e40af; }
.map__invited-caret {
  display: inline-block;
  transition: transform 0.18s;
  font-size: 0.85em;
}
.map__invited-caret--open { transform: rotate(180deg); }
.error { color: #b91c1c; margin: 0; font-size: 0.85rem; }
.muted { color: #64748b; margin: 0; font-size: 0.85rem; }

/* Dark-context overrides — used inside the dark meeting workspace */
:global([data-theme="dark"]) .map__live-only {
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
}
:global([data-theme="dark"]) .map__status--away {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.15);
}
:global([data-theme="dark"]) .map__status--left {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.12);
}
:global([data-theme="dark"]) .map__required {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
}
:global([data-theme="dark"]) .map__optional {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.12);
}
:global([data-theme="dark"]) .map__invited-toggle {
  color: #94a3b8;
}
:global([data-theme="dark"]) .map__invited-toggle:hover { color: #93c5fd; }
:global([data-theme="dark"]) .muted { color: #94a3b8; }

/* Meeting workspace dark context (workspace panel has dark background but not data-theme="dark") */
.map--dark .map__live-only {
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
}
.map--dark .map__status--away {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.15);
}
.map--dark .map__status--left {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.12);
}
.map--dark .map__required {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
}
.map--dark .map__optional {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.12);
}
.map--dark .map__invited-toggle { color: #94a3b8; }
.map--dark .map__invited-toggle:hover { color: #93c5fd; }
.map--dark .muted { color: #94a3b8; }
</style>
