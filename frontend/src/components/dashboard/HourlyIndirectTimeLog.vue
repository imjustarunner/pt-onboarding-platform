<template>
  <div class="itl" data-tour="hourly-indirect-time-log">
    <header class="itl-top">
      <div class="itl-top-left">
        <span class="itl-top-icon" aria-hidden="true">
          <IndirectTimeIcon name="clock" :size="22" />
        </span>
        <h2 class="itl-title">Time Submission</h2>
      </div>
      <div class="itl-top-right">
        <div class="itl-date" aria-label="Submission date">
          <IndirectTimeIcon name="calendar" :size="16" />
          <input v-model="claimDate" type="date" class="itl-date-input" :max="todayYmd" />
        </div>
        <div class="itl-user" v-if="displayName">
          <span class="itl-avatar" aria-hidden="true">{{ initials }}</span>
          <span class="itl-user-name">{{ displayName }}</span>
        </div>
      </div>
    </header>

    <div class="itl-body">
      <!-- Current session -->
      <section class="itl-card itl-session" aria-labelledby="itl-session-heading">
        <div class="itl-session-left">
          <div class="itl-status-row">
            <span class="itl-badge" :class="sessionBadgeClass">{{ sessionBadgeLabel }}</span>
          </div>
          <p id="itl-session-heading" class="itl-session-meta">{{ sessionMetaText }}</p>
          <div v-if="canAdjustClockOut" class="itl-adjust-out">
            <label class="itl-adjust-out-label">
              <span>Adjust clock-out (earlier only)</span>
              <input
                v-model="adjustClockOutLocal"
                type="time"
                class="itl-adjust-out-input"
                :min="clockInTimeLocal"
                :max="originalClockOutTimeLocal"
                @change="applyClockOutAdjust"
              />
            </label>
            <p class="itl-adjust-out-hint">
              If you forgot to clock out earlier, move this back. Cannot be before clock-in or after {{ formatTimeOfDay(originalClockOutAt) }}.
            </p>
          </div>
        </div>
        <div class="itl-session-center">
          <div class="itl-timer" aria-live="polite">{{ formattedElapsed }}</div>
          <div class="itl-timer-label">HH:MM:SS</div>
        </div>
        <div class="itl-session-actions">
          <button
            v-if="!isClockedIn && !canAdjustClockOut"
            type="button"
            class="itl-btn itl-btn-primary"
            :disabled="sessionBusy || !agencyId"
            @click="clockIn"
          >
            <IndirectTimeIcon name="play" :size="16" />
            Clock In
          </button>
          <template v-else-if="isClockedIn">
            <button
              v-if="canUseNoteAid"
              type="button"
              class="itl-btn itl-btn-notes"
              :disabled="sessionBusy"
              @click="openDoMyNotes"
            >
              <IndirectTimeIcon name="file-text" :size="16" />
              Do my notes
            </button>
            <button
              type="button"
              class="itl-btn itl-btn-ghost"
              :disabled="sessionBusy"
              @click="toggleBreak"
            >
              <IndirectTimeIcon :name="isOnBreak ? 'play' : 'pause'" :size="16" />
              {{ isOnBreak ? 'Resume' : 'Take a Break' }}
            </button>
            <button
              type="button"
              class="itl-btn itl-btn-danger"
              :disabled="sessionBusy"
              @click="clockOut"
            >
              <IndirectTimeIcon name="stop" :size="16" />
              Clock Out
            </button>
          </template>
          <p v-else-if="canAdjustClockOut" class="itl-adjust-done-hint">
            Clocked out — allocate time below, then submit.
          </p>
        </div>
        <p v-if="isClockedIn && noteAidUsedDuringSession" class="itl-notes-session-hint">
          Note Aid (Tools &amp; Aids → AI Tools) is part of this clocked session — your timer keeps running.
          When you allocate time, include <strong>Writing Notes</strong> for documentation work.
        </p>
      </section>

      <div class="itl-tabs" role="tablist" aria-label="Time log sections">
        <button
          type="button"
          role="tab"
          class="itl-tab"
          :class="{ active: mainTab === 'enter' }"
          :aria-selected="mainTab === 'enter'"
          @click="mainTab = 'enter'"
        >
          <IndirectTimeIcon name="clock" :size="16" />
          Enter Time
        </button>
        <button
          type="button"
          role="tab"
          class="itl-tab"
          :class="{ active: mainTab === 'submissions' }"
          :aria-selected="mainTab === 'submissions'"
          @click="mainTab = 'submissions'; loadSubmissions()"
        >
          <IndirectTimeIcon name="list" :size="16" />
          My Submissions
        </button>
      </div>

      <div v-if="error" class="itl-error" role="alert">{{ error }}</div>
      <div v-if="success" class="itl-success" role="status">{{ success }}</div>

      <template v-if="mainTab === 'enter'">
        <section class="itl-card" aria-labelledby="itl-method-heading">
          <h3 id="itl-method-heading" class="itl-section-title">How would you like to enter your time?</h3>
          <div class="itl-method-grid">
            <button
              type="button"
              class="itl-method"
              :class="{ selected: entryMethod === 'clock' }"
              @click="entryMethod = 'clock'"
            >
              <span class="itl-method-icon" aria-hidden="true">
                <IndirectTimeIcon name="clock" :size="28" :stroke-width="1.75" />
              </span>
              <span class="itl-method-label">Clock In / Clock Out</span>
              <span class="itl-pill">Recommended</span>
            </button>
            <button
              type="button"
              class="itl-method"
              :class="{ selected: entryMethod === 'manual' }"
              @click="entryMethod = 'manual'"
            >
              <span class="itl-method-icon itl-method-icon--alt" aria-hidden="true">
                <IndirectTimeIcon name="calendar" :size="28" :stroke-width="1.75" />
              </span>
              <span class="itl-method-label">Post Start &amp; End Time</span>
            </button>
          </div>

          <div v-if="entryMethod === 'manual'" class="itl-manual-times">
            <label class="itl-field">
              <span>Start time</span>
              <input v-model="manualStart" type="time" />
            </label>
            <label class="itl-field">
              <span>End time</span>
              <input v-model="manualEnd" type="time" />
            </label>
            <div class="itl-manual-total">
              Session total: <strong>{{ formatHm(manualTotalMinutes) }}</strong>
            </div>
          </div>
          <p v-else class="itl-hint">
            Use Clock In / Clock Out above, then allocate that worked time across service types below.
            {{ clockTotalMinutes > 0 ? ` Worked: ${formatHm(clockTotalMinutes)}.` : '' }}
          </p>
        </section>

        <section class="itl-card" aria-labelledby="itl-types-heading">
          <div class="itl-section-head">
            <h3 id="itl-types-heading" class="itl-section-title">
              {{ dualRateEnabled ? 'Select Service Type(s)' : 'Select Indirect Service Type(s)' }}
            </h3>
            <div class="itl-section-actions">
              <button type="button" class="itl-link-btn" @click="selectAllTypes">Select All</button>
              <button type="button" class="itl-link-btn" @click="clearAllTypes">Clear All</button>
            </div>
          </div>
          <div v-if="typesLoading" class="itl-muted">Loading service types…</div>
          <div v-else-if="!serviceTypes.length" class="itl-muted">No indirect service types are configured yet. Ask an admin to add them in Payroll Settings.</div>
          <div v-else-if="dualRateEnabled" class="itl-dual-cols">
            <div class="itl-dual-col itl-dual-col--indirect">
              <div class="itl-dual-head">
                <span class="itl-dual-badge itl-dual-badge--indirect">Type 1 – Indirect</span>
                <span class="itl-dual-sub">Paid at Indirect rate</span>
              </div>
              <div class="itl-type-grid" role="group" aria-label="Indirect service types">
                <label
                  v-for="t in indirectServiceTypes"
                  :key="t.id"
                  class="itl-type-card"
                  :class="{ selected: selectedTypeIds.has(t.id) }"
                >
                  <input
                    type="checkbox"
                    class="itl-type-check"
                    :checked="selectedTypeIds.has(t.id)"
                    :aria-label="t.label"
                    @change="toggleType(t)"
                  />
                  <span class="itl-type-icon" aria-hidden="true">
                    <IndirectTimeIcon :name="t.iconKey" :size="22" :stroke-width="1.75" />
                  </span>
                  <span class="itl-type-label">{{ t.label }}</span>
                  <span v-if="t.description" class="itl-type-desc">{{ t.description }}</span>
                </label>
              </div>
            </div>
            <div class="itl-dual-col itl-dual-col--other1">
              <div class="itl-dual-head">
                <span class="itl-dual-badge itl-dual-badge--other1">Type 2 – Other 1</span>
                <span class="itl-dual-sub">Paid at Other 1 rate</span>
              </div>
              <div class="itl-type-grid" role="group" aria-label="Other 1 service types">
                <label
                  v-for="t in other1ServiceTypes"
                  :key="t.id"
                  class="itl-type-card"
                  :class="{ selected: selectedTypeIds.has(t.id) }"
                >
                  <input
                    type="checkbox"
                    class="itl-type-check"
                    :checked="selectedTypeIds.has(t.id)"
                    :aria-label="t.label"
                    @change="toggleType(t)"
                  />
                  <span class="itl-type-icon" aria-hidden="true">
                    <IndirectTimeIcon :name="t.iconKey" :size="22" :stroke-width="1.75" />
                  </span>
                  <span class="itl-type-label">{{ t.label }}</span>
                  <span v-if="t.description" class="itl-type-desc">{{ t.description }}</span>
                </label>
              </div>
            </div>
          </div>
          <div v-else class="itl-type-grid" role="group" aria-label="Indirect service types">
            <label
              v-for="t in visibleServiceTypes"
              :key="t.id"
              class="itl-type-card"
              :class="{ selected: selectedTypeIds.has(t.id) }"
            >
              <input
                type="checkbox"
                class="itl-type-check"
                :checked="selectedTypeIds.has(t.id)"
                :aria-label="t.label"
                @change="toggleType(t)"
              />
              <span class="itl-type-icon" aria-hidden="true">
                <IndirectTimeIcon :name="t.iconKey" :size="22" :stroke-width="1.75" />
              </span>
              <span class="itl-type-label">{{ t.label }}</span>
              <span v-if="t.description" class="itl-type-desc">{{ t.description }}</span>
            </label>
          </div>
        </section>

        <IndirectTimeAllocationPanel
          v-if="selectedTypeIds.size"
          ref="allocationPanelRef"
          :total-minutes="sessionTotalMinutes"
          :session-start-hm="sessionBoundsHm.start"
          :session-end-hm="sessionBoundsHm.end"
          :session-end-is-live="sessionEndIsLive"
          :service-types="serviceTypes"
          :selected-type-ids="selectedTypeIdList"
          :recent-ratio="recentIndirectRatio"
          :recent-period-label="recentRatioPeriodLabel"
          @update:selected-type-ids="onAllocationSelectedIds"
          @validity="allocationValid = $event"
        />

        <div class="itl-submit-wrap">
          <label class="itl-attest">
            <input v-model="attestation" type="checkbox" />
            <span>I certify this time is accurate, complete, and in compliance with workplace policies.</span>
          </label>
          <button
            type="button"
            class="itl-submit"
            :disabled="submitting || !canSubmit"
            @click="submitTime"
          >
            {{ submitting ? 'Submitting…' : 'Submit Time' }}
          </button>
          <p class="itl-secure">
            <IndirectTimeIcon name="lock" :size="14" />
            Your time is saved securely. Submit when you're ready.
          </p>
        </div>
      </template>

      <template v-else>
        <section class="itl-card">
          <div v-if="subsLoading" class="itl-muted">Loading submissions…</div>
          <div v-else-if="!submissions.length" class="itl-muted">No indirect time submissions yet.</div>
          <ul v-else class="itl-subs">
            <li v-for="s in submissions" :key="s.id" class="itl-sub">
              <div class="itl-sub-main">
                <strong>{{ formatDisplayDate(s.claim_date) }}</strong>
                <span class="itl-sub-mins">{{ formatHm(Number(s.payload?.totalMinutes || 0)) }}</span>
                <span class="itl-sub-status" :data-status="s.status">{{ submissionStatusLabel(s.status) }}</span>
              </div>
              <ul class="itl-sub-allocs">
                <li v-for="(a, idx) in (s.payload?.allocations || [])" :key="idx">
                  {{ a.serviceTypeLabel }}
                  <template v-if="a.startTime && a.endTime"> — {{ a.startTime }}–{{ a.endTime }}</template>
                  — {{ formatHm(Number(a.minutes || 0)) }}
                  <template v-if="a.percent != null"> ({{ a.percent }}%)</template>
                  <span v-if="a.note" class="itl-sub-note"> — {{ a.note }}</span>
                </li>
              </ul>
              <div class="itl-sub-actions">
                <button
                  v-if="canEditSubmission(s)"
                  type="button"
                  class="itl-link-btn"
                  @click="editSubmissionInPayroll(s)"
                >
                  Edit in My Payroll
                </button>
                <button
                  v-if="canWithdrawSubmission(s)"
                  type="button"
                  class="itl-link-btn"
                  :disabled="deletingId === s.id"
                  @click="withdrawSubmission(s)"
                >
                  {{ deletingId === s.id ? 'Withdrawing…' : 'Withdraw' }}
                </button>
                <button
                  v-if="canDeleteSubmission(s)"
                  type="button"
                  class="itl-link-btn itl-danger-text"
                  :disabled="deletingId === s.id"
                  @click="hardDeleteSubmission(s)"
                >
                  {{ deletingId === s.id ? 'Deleting…' : 'Delete' }}
                </button>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useUserPreferencesStore } from '../../store/userPreferences';
import { useIndirectTimeSessionStore } from '../../store/indirectTimeSession';
import IndirectTimeAllocationPanel from './IndirectTimeAllocationPanel.vue';
import {
  detectLocalTimezone,
  timezoneAbbrevAt
} from '../../utils/timezones';
import IndirectTimeIcon from './IndirectTimeIcon.vue';
import { getClaimStatusLabel } from '../../utils/payrollUiHelpers';
import {
  isNoteAidEmployeeRole,
  isNoteAidEnabledForAgencyFlags
} from '../../config/noteAidAccess';
import {
  isHourlyDualRateEnabled,
  normalizePayBucket
} from '../../utils/hourlyDualRateContract.js';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  enabled: { type: Boolean, default: true }
});

const emit = defineEmits(['submitted']);

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const prefsStore = useUserPreferencesStore();
const indirectSessionStore = useIndirectTimeSessionStore();
const router = useRouter();
const route = useRoute();

const dualRateEnabled = computed(() => isHourlyDualRateEnabled(authStore.user));
const indirectServiceTypes = computed(() =>
  (serviceTypes.value || []).filter((t) => normalizePayBucket(t.payBucket || t.pay_bucket) === 'indirect')
);
const other1ServiceTypes = computed(() =>
  (serviceTypes.value || []).filter((t) => normalizePayBucket(t.payBucket || t.pay_bucket) === 'other_1')
);
/** Non dual-rate workers only see Indirect types (Other 1 is dual-contract only). */
const visibleServiceTypes = computed(() =>
  dualRateEnabled.value ? (serviceTypes.value || []) : indirectServiceTypes.value
);

const noteAidUsedDuringSession = computed(() => !!indirectSessionStore.noteAidUsedDuringSession);

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
}

const canUseNoteAid = computed(() => {
  if (!isNoteAidEmployeeRole(authStore.user?.role)) return false;
  const flags = parseFeatureFlags(agencyStore.currentAgency?.feature_flags);
  return isNoteAidEnabledForAgencyFlags(flags);
});
const displayTimeZone = computed(() => {
  const fromPrefs = String(prefsStore.timezone || '').trim();
  if (fromPrefs) return fromPrefs;
  return detectLocalTimezone();
});
const todayYmd = new Date().toISOString().slice(0, 10);

const mainTab = ref('enter');
const entryMethod = ref('clock');
const claimDate = ref(todayYmd);
const manualStart = ref('09:00');
const manualEnd = ref('11:30');
const attestation = ref(false);
const serviceTypes = ref([]);
const typesLoading = ref(false);
const selectedTypeIds = ref(new Set());
const allocationPanelRef = ref(null);
const allocationValid = ref(false);
const recentIndirectRatio = ref(null);
const recentRatioPeriodLabel = ref('');
/** Local copy for form state; synced with global nav store when open. */
const session = ref(null);
/** Server clock-out at moment of stop (max for earlier adjustment). */
const originalClockOutAt = ref(null);
const adjustClockOutLocal = ref('');
const sessionBusy = ref(false);
const tickNow = ref(Date.now());
let tickTimer = null;

function publishSession(next) {
  session.value = next || null;
  const st = String(next?.status || '');
  if (st === 'open' || st === 'on_break') {
    originalClockOutAt.value = null;
    adjustClockOutLocal.value = '';
    indirectSessionStore.setSession(next);
  } else {
    // Keep closed session locally for allocation after clock-out; clear global chip.
    indirectSessionStore.clearSession();
  }
}

function isoToTimeInputValue(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: displayTimeZone.value,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(d);
    const hh = parts.find((p) => p.type === 'hour')?.value || '00';
    const mm = parts.find((p) => p.type === 'minute')?.value || '00';
    // Intl can return "24" for midnight in some environments
    const hNum = hh === '24' ? '00' : hh;
    return `${hNum.padStart(2, '0')}:${mm.padStart(2, '0')}`;
  } catch {
    return '';
  }
}

/** Combine claim date + HH:MM in display TZ → UTC ISO. */
function localTimeOnClaimDateToIso(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const ymd = String(claimDate.value || todayYmd).slice(0, 10);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  // Build a UTC guess then refine via iterative format (handles DST).
  const tz = displayTimeZone.value;
  let guess = new Date(`${ymd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(guess);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const gy = Number(get('year'));
    const gmo = Number(get('month'));
    const gd = Number(get('day'));
    let gh = Number(get('hour'));
    if (gh === 24) gh = 0;
    const gmin = Number(get('minute'));
    const wantY = Number(ymd.slice(0, 4));
    const wantMo = Number(ymd.slice(5, 7));
    const wantD = Number(ymd.slice(8, 10));
    const deltaMin =
      ((wantY - gy) * 525600) +
      ((wantMo - gmo) * 43200) +
      ((wantD - gd) * 1440) +
      ((hour - gh) * 60) +
      (minute - gmin);
    if (deltaMin === 0) break;
    guess = new Date(guess.getTime() + deltaMin * 60 * 1000);
  }
  return guess.toISOString();
}

function beginLocalClockOutAdjust(closed) {
  if (!closed?.clockedOutAt) return;
  originalClockOutAt.value = closed.clockedOutAtOriginal || closed.clockedOutAt;
  adjustClockOutLocal.value = isoToTimeInputValue(closed.clockedOutAt);
  indirectSessionStore.beginClockOutAdjust(closed);
}

const canAdjustClockOut = computed(() => {
  return !!(
    session.value?.clockedOutAt &&
    session.value?.clockedInAt &&
    String(session.value.status || '') === 'closed'
  );
});

const clockInTimeLocal = computed(() =>
  session.value?.clockedInAt ? isoToTimeInputValue(session.value.clockedInAt) : ''
);

const originalClockOutTimeLocal = computed(() =>
  originalClockOutAt.value ? isoToTimeInputValue(originalClockOutAt.value) : ''
);

async function applyClockOutAdjust() {
  if (!canAdjustClockOut.value || !session.value) return;
  const nextIso = localTimeOnClaimDateToIso(adjustClockOutLocal.value);
  if (!nextIso) return;
  const inMs = new Date(session.value.clockedInAt).getTime();
  const maxMs = new Date(
    originalClockOutAt.value ||
      session.value.clockedOutAtOriginal ||
      session.value.clockedOutAt
  ).getTime();
  let outMs = new Date(nextIso).getTime();
  if (!Number.isFinite(outMs)) return;
  // Clamp: not before clock-in, not after original clock-out.
  if (Number.isFinite(inMs) && outMs < inMs + 60_000) outMs = inMs + 60_000;
  if (Number.isFinite(maxMs) && outMs > maxMs) outMs = maxMs;
  const clamped = new Date(outMs).toISOString();
  adjustClockOutLocal.value = isoToTimeInputValue(clamped);
  if (clamped === session.value.clockedOutAt) return;
  session.value = {
    ...session.value,
    clockedOutAt: clamped,
    workedSeconds: Math.max(
      0,
      Math.floor((outMs - inMs) / 1000) - Number(session.value.breakSecondsTotal || 0)
    )
  };
  indirectSessionStore.setAdjustableClockOutAt(clamped);
  if (!session.value.id || !agencyId.value) return;
  try {
    const resp = await api.patch(
      `/payroll/me/indirect-time-session/${session.value.id}/clock-out`,
      { agencyId: agencyId.value, clockedOutAt: clamped }
    );
    if (resp.data?.session) {
      session.value = {
        ...session.value,
        ...resp.data.session
      };
      adjustClockOutLocal.value = isoToTimeInputValue(session.value.clockedOutAt);
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to adjust clock-out';
  }
}
const error = ref('');
const success = ref('');
const submitting = ref(false);
const submissions = ref([]);
const subsLoading = ref(false);
const deletingId = ref(null);

const displayName = computed(() => {
  const u = authStore.user || {};
  const name = [u.first_name || u.firstName, u.last_name || u.lastName].filter(Boolean).join(' ').trim();
  return name || u.email || '';
});

const initials = computed(() => {
  const parts = displayName.value.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');
});

const isClockedIn = computed(() => {
  const st = String(session.value?.status || '');
  return st === 'open' || st === 'on_break';
});

const isOnBreak = computed(() => String(session.value?.status || '') === 'on_break');

const sessionBadgeLabel = computed(() => {
  if (isOnBreak.value) return 'ON BREAK';
  if (isClockedIn.value) return 'CLOCKED IN';
  if (session.value?.clockedOutAt) return 'CLOCKED OUT';
  return 'NOT CLOCKED IN';
});

const sessionBadgeClass = computed(() => {
  if (isOnBreak.value) return 'warn';
  if (isClockedIn.value) return 'ok';
  return 'idle';
});

const sessionMetaText = computed(() => {
  if (isClockedIn.value && session.value?.clockedInAt) {
    return `Session started: ${formatTimeOfDay(session.value.clockedInAt)}`;
  }
  if (session.value?.clockedOutAt) {
    const adjusted =
      originalClockOutAt.value &&
      session.value.clockedOutAt !== originalClockOutAt.value
        ? ` (adjusted from ${formatTimeOfDay(originalClockOutAt.value)})`
        : '';
    return `Session ended: ${formatTimeOfDay(session.value.clockedOutAt)}${adjusted}`;
  }
  return `Clock in to start tracking, or post start & end time below. Times shown in ${timezoneAbbrevAt(new Date(), displayTimeZone.value) || displayTimeZone.value}.`;
});

const liveWorkedSeconds = computed(() => {
  if (!session.value?.clockedInAt) return 0;
  if (!isClockedIn.value && session.value?.workedSeconds != null) {
    return Number(session.value.workedSeconds) || 0;
  }
  // Recompute from timestamps using tickNow for live updates.
  const start = new Date(session.value.clockedInAt).getTime();
  const end = session.value.clockedOutAt
    ? new Date(session.value.clockedOutAt).getTime()
    : tickNow.value;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  let breakSecs = Number(session.value.breakSecondsTotal || 0);
  if (isOnBreak.value && session.value.breakStartedAt) {
    const bs = new Date(session.value.breakStartedAt).getTime();
    if (Number.isFinite(bs) && end > bs) breakSecs += Math.floor((end - bs) / 1000);
  }
  return Math.max(0, Math.floor((end - start) / 1000) - breakSecs);
});

const formattedElapsed = computed(() => formatHms(liveWorkedSeconds.value));

const clockTotalMinutes = computed(() => Math.floor(liveWorkedSeconds.value / 60));

const manualTotalMinutes = computed(() => minutesBetween(manualStart.value, manualEnd.value));

const sessionTotalMinutes = computed(() => {
  if (entryMethod.value === 'manual') return manualTotalMinutes.value;
  return clockTotalMinutes.value;
});

const selectedTypeIdList = computed(() => [...selectedTypeIds.value]);

const sessionBoundsHm = computed(() => {
  // Depend on tick so live "now" end advances while still clocked in.
  void tickNow.value;
  if (entryMethod.value === 'manual') {
    return { start: manualStart.value, end: manualEnd.value };
  }
  if (session.value?.clockedInAt) {
    return {
      start: isoToTimeInputValue(session.value.clockedInAt),
      end: session.value.clockedOutAt
        ? isoToTimeInputValue(session.value.clockedOutAt)
        : isoToTimeInputValue(new Date(tickNow.value).toISOString())
    };
  }
  return { start: manualStart.value, end: manualEnd.value };
});

/** True while clocked in — last activity end tracks live "now". */
const sessionEndIsLive = computed(() => {
  if (entryMethod.value === 'manual') return false;
  const st = String(session.value?.status || '');
  return (st === 'open' || st === 'on_break') && !session.value?.clockedOutAt;
});

const canSubmit = computed(() => {
  if (!props.enabled || !agencyId.value) return false;
  if (!attestation.value) return false;
  if (!(sessionTotalMinutes.value >= 1)) return false;
  if (!selectedTypeIds.value.size) return false;
  return !!allocationValid.value;
});

const agencyId = computed(() => {
  const n = Number(props.agencyId);
  return Number.isFinite(n) && n > 0 ? n : null;
});

function formatHms(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatHm(mins) {
  const m = Math.max(0, Math.floor(Number(mins) || 0));
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseHhmm(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function minutesBetween(startRaw, endRaw) {
  const a = String(startRaw || '').match(/^(\d{1,2}):(\d{2})$/);
  const b = String(endRaw || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!a || !b) return 0;
  let start = Number(a[1]) * 60 + Number(a[2]);
  let end = Number(b[1]) * 60 + Number(b[2]);
  if (end <= start) end += 24 * 60;
  return end - start;
}

function formatTimeOfDay(isoOrMysql) {
  try {
    const raw = String(isoOrMysql || '').trim();
    // Naive MySQL DATETIME from UTC pool → treat as UTC.
    const normalized = raw && !/Z$|[+-]\d{2}:\d{2}$/.test(raw) && !raw.includes('T')
      ? `${raw.replace(' ', 'T')}Z`
      : raw;
    const d = new Date(normalized || isoOrMysql);
    if (Number.isNaN(d.getTime())) return String(isoOrMysql);
    const tz = displayTimeZone.value;
    const time = d.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit'
    });
    const abbr = timezoneAbbrevAt(d, tz);
    return abbr ? `${time} ${abbr}` : time;
  } catch {
    return String(isoOrMysql);
  }
}

function formatDisplayDate(ymd) {
  try {
    const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(ymd);
  }
}

function toggleType(t) {
  const next = new Set(selectedTypeIds.value);
  if (next.has(t.id)) next.delete(t.id);
  else next.add(t.id);
  selectedTypeIds.value = next;
}

function selectAllTypes() {
  selectedTypeIds.value = new Set(visibleServiceTypes.value.map((t) => t.id));
}

function clearAllTypes() {
  selectedTypeIds.value = new Set();
  allocationPanelRef.value?.clearRows?.();
}

function ensureWritingNotesSelected() {
  const writing = (serviceTypes.value || []).find(
    (t) => String(t.typeKey || '').toLowerCase() === 'writing_notes'
  );
  if (!writing?.id) return;
  if (selectedTypeIds.value.has(writing.id)) return;
  const next = new Set(selectedTypeIds.value);
  next.add(writing.id);
  selectedTypeIds.value = next;
}

function selectionStorageKey() {
  return agencyId.value ? `itl-selected-types-${agencyId.value}` : null;
}

function persistSelectedTypes() {
  const key = selectionStorageKey();
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify([...selectedTypeIds.value]));
  } catch {
    /* ignore */
  }
}

function restoreSelectedTypes() {
  const key = selectionStorageKey();
  if (!key) return;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids) || !ids.length) return;
    const valid = new Set(
      (serviceTypes.value || []).map((t) => Number(t.id)).filter((n) => Number.isFinite(n))
    );
    const next = new Set(ids.map(Number).filter((id) => valid.has(id)));
    if (next.size) selectedTypeIds.value = next;
  } catch {
    /* ignore */
  }
}

function openDoMyNotes() {
  if (!canUseNoteAid.value || !isClockedIn.value) return;
  // Soft link only: clock keeps running; open via Tools & Aids → AI Tools → Note Aid.
  indirectSessionStore.markNoteAidOpened();
  ensureWritingNotesSelected();
  persistSelectedTypes();
  success.value = 'Opening Note Aid (Tools & Aids → AI Tools) — your Log Time clock keeps running.';
  router.push({
    query: {
      ...(route.query || {}),
      tab: 'tools_aids',
      toolsTab: 'ai',
      openAiTool: 'note-aid',
      fromIndirectSession: '1'
    }
  }).catch(() => {});
}

function onAllocationSelectedIds(ids) {
  selectedTypeIds.value = new Set((ids || []).map(Number));
}

watch(sessionTotalMinutes, (n, prev) => {
  if (n > 0 && selectedTypeIds.value.size && (!prev || prev === 0)) {
    allocationPanelRef.value?.tryEvenDistribute?.();
  }
});

async function loadTypes() {
  if (!agencyId.value) return;
  typesLoading.value = true;
  error.value = '';
  try {
    const resp = await api.get('/payroll/me/indirect-service-types', { params: { agencyId: agencyId.value } });
    serviceTypes.value = Array.isArray(resp.data?.types) ? resp.data.types : [];
    if (indirectSessionStore.noteAidUsedDuringSession) {
      restoreSelectedTypes();
      ensureWritingNotesSelected();
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load service types';
  } finally {
    typesLoading.value = false;
  }
}

async function loadSession() {
  if (!agencyId.value) return;
  // Prefer handoff from timedown Clock Out (open-session API won't return closed).
  const pending = indirectSessionStore.takePendingClosedSession();
  if (pending?.session) {
    session.value = pending.session;
    originalClockOutAt.value =
      pending.originalClockOutAt ||
      pending.session.clockedOutAtOriginal ||
      pending.session.clockedOutAt;
    adjustClockOutLocal.value = isoToTimeInputValue(pending.session.clockedOutAt);
    entryMethod.value = 'clock';
    allocationPanelRef.value?.tryEvenDistribute?.();
    return;
  }
  try {
    const resp = await api.get('/payroll/me/indirect-time-session', { params: { agencyId: agencyId.value } });
    publishSession(resp.data?.session || null);
  } catch (e) {
    // Non-fatal on initial load
    if (e.response?.status !== 403) {
      error.value = e.response?.data?.error?.message || e.message || 'Failed to load session';
    }
  }
}

async function clockIn() {
  if (!agencyId.value) return;
  sessionBusy.value = true;
  error.value = '';
  try {
    indirectSessionStore.clearNoteAidSessionFlag();
    try { sessionStorage.removeItem('itl-note-aid-declined-clockin'); } catch { /* ignore */ }
    const resp = await api.post('/payroll/me/indirect-time-session/clock-in', { agencyId: agencyId.value });
    publishSession(resp.data?.session || null);
    entryMethod.value = 'clock';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to clock in';
  } finally {
    sessionBusy.value = false;
  }
}

async function toggleBreak() {
  if (!agencyId.value) return;
  sessionBusy.value = true;
  error.value = '';
  try {
    const resp = await api.post('/payroll/me/indirect-time-session/break', {
      agencyId: agencyId.value,
      action: isOnBreak.value ? 'end' : 'start'
    });
    publishSession(resp.data?.session || null);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to update break';
  } finally {
    sessionBusy.value = false;
  }
}

async function clockOut() {
  if (!agencyId.value) return;
  sessionBusy.value = true;
  error.value = '';
  try {
    const resp = await api.post('/payroll/me/indirect-time-session/clock-out', { agencyId: agencyId.value });
    // Keep closed session locally for allocation; clear global chip via publishSession.
    const closed = resp.data?.session || null;
    session.value = closed;
    indirectSessionStore.clearSession();
    beginLocalClockOutAdjust(closed);
    entryMethod.value = 'clock';
    allocationPanelRef.value?.tryEvenDistribute?.();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to clock out';
  } finally {
    sessionBusy.value = false;
  }
}

async function loadRatioHint() {
  if (!agencyId.value) return;
  try {
    const resp = await api.get('/payroll/me/dashboard-summary', {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    const di = resp.data?.directIndirect;
    if (!di || di.disabled) {
      recentIndirectRatio.value = null;
      recentRatioPeriodLabel.value = '';
      return;
    }
    const last = di.last || di.avg90 || null;
    const ratio = last?.ratio;
    recentIndirectRatio.value = Number.isFinite(Number(ratio)) ? Number(ratio) : null;
    recentRatioPeriodLabel.value = di.last?.ratio != null
      ? 'last pay period'
      : (di.avg90?.ratio != null ? '90-day average' : '');
  } catch {
    recentIndirectRatio.value = null;
    recentRatioPeriodLabel.value = '';
  }
}

function unrefAllocationMode(panel) {
  const m = panel?.allocationMode;
  if (m && typeof m === 'object' && 'value' in m) return m.value || 'duration';
  return m || 'duration';
}

function typePayBucket(typeId) {
  const t = (serviceTypes.value || []).find((x) => Number(x.id) === Number(typeId));
  return normalizePayBucket(t?.payBucket || t?.pay_bucket || 'indirect');
}

async function postIndirectTimeClaim({ totalMinutes, allocations, bucket, startTime, endTime, allocationMode, usedNoteAid }) {
  const tagged = (allocations || []).map((a) => ({
    ...a,
    payBucket: bucket
  }));
  await api.post('/payroll/me/time-claims', {
    agencyId: agencyId.value,
    claimType: 'indirect_time',
    claimDate: claimDate.value,
    payload: {
      entryMethod: entryMethod.value,
      allocationMode,
      startTime,
      endTime,
      totalMinutes,
      allocations: tagged,
      bucket,
      sessionId: session.value?.id || null,
      noteAidUsedDuringSession: usedNoteAid,
      ...(usedNoteAid && indirectSessionStore.noteAidOpenedAt
        ? { noteAidOpenedAt: indirectSessionStore.noteAidOpenedAt }
        : {}),
      attestation: true
    }
  });
}

async function submitTime() {
  if (!canSubmit.value || !agencyId.value) return;
  const panel = allocationPanelRef.value;
  const emptyNotes = panel?.getEmptyNoteLabels?.() || [];
  if (emptyNotes.length) {
    const list = emptyNotes.slice(0, 6).join(', ') + (emptyNotes.length > 6 ? '…' : '');
    const ok = window.confirm(
      `You have ${emptyNotes.length} activit${emptyNotes.length === 1 ? 'y' : 'ies'} without a note (${list}).\n\n` +
      'We suggest a short note for each activity. Submit without notes anyway?'
    );
    if (!ok) return;
  }
  submitting.value = true;
  error.value = '';
  success.value = '';
  try {
    if (entryMethod.value === 'clock' && isClockedIn.value) {
      await clockOut();
    }
    const allocations = panel?.getAllocationsForSubmit?.() || [];
    const startTime = sessionBoundsHm.value.start || manualStart.value;
    const endTime = sessionBoundsHm.value.end || manualEnd.value;
    const usedNoteAid = !!indirectSessionStore.noteAidUsedDuringSession;
    const allocationMode = unrefAllocationMode(panel);

    if (dualRateEnabled.value) {
      const indirectAlloc = [];
      const other1Alloc = [];
      for (const a of allocations) {
        const bucket = typePayBucket(a.serviceTypeId);
        if (bucket === 'other_1') other1Alloc.push(a);
        else indirectAlloc.push(a);
      }
      const indirectMins = indirectAlloc.reduce((s, a) => s + Number(a.minutes || 0), 0);
      const other1Mins = other1Alloc.reduce((s, a) => s + Number(a.minutes || 0), 0);
      if (indirectMins < 1 && other1Mins < 1) {
        throw new Error('Allocate minutes to at least one service type');
      }
      if (indirectMins >= 1) {
        await postIndirectTimeClaim({
          totalMinutes: indirectMins,
          allocations: indirectAlloc,
          bucket: 'indirect',
          startTime,
          endTime,
          allocationMode,
          usedNoteAid
        });
      }
      if (other1Mins >= 1) {
        await postIndirectTimeClaim({
          totalMinutes: other1Mins,
          allocations: other1Alloc,
          bucket: 'other_1',
          startTime,
          endTime,
          allocationMode,
          usedNoteAid
        });
      }
      const parts = [];
      if (indirectMins >= 1) parts.push(`${formatHm(indirectMins)} Indirect`);
      if (other1Mins >= 1) parts.push(`${formatHm(other1Mins)} Other 1`);
      success.value = `Submitted ${parts.join(' + ')} for payroll review.`;
    } else {
      const totalMinutes = sessionTotalMinutes.value;
      await postIndirectTimeClaim({
        totalMinutes,
        allocations,
        bucket: 'indirect',
        startTime,
        endTime,
        allocationMode,
        usedNoteAid
      });
      success.value = 'Time submitted for payroll review. Use Edit in My Payroll if you need to change it (a reason is required).';
    }

    attestation.value = false;
    clearAllTypes();
    try {
      const key = selectionStorageKey();
      if (key) sessionStorage.removeItem(key);
    } catch { /* ignore */ }
    originalClockOutAt.value = null;
    adjustClockOutLocal.value = '';
    indirectSessionStore.clearNoteAidSessionFlag();
    indirectSessionStore.clearClockOutAdjust();
    publishSession(null);
    await loadSession();
    emit('submitted');
    mainTab.value = 'submissions';
    await loadSubmissions();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to submit time';
  } finally {
    submitting.value = false;
  }
}

function submissionStatusLabel(status) {
  return getClaimStatusLabel(status);
}

function canEditSubmission(s) {
  const st = String(s?.status || '').toLowerCase();
  return ['submitted', 'deferred', 'rejected', 'withdrawn'].includes(st);
}

function canWithdrawSubmission(s) {
  const st = String(s?.status || '').toLowerCase();
  return ['submitted', 'deferred', 'rejected'].includes(st);
}

function canDeleteSubmission(s) {
  const st = String(s?.status || '').toLowerCase();
  return ['withdrawn', 'deferred', 'rejected'].includes(st);
}

function editSubmissionInPayroll(s) {
  if (!s?.id) return;
  router.push({
    query: {
      ...(route.query || {}),
      tab: 'my',
      my: 'payroll',
      timeClaimId: String(s.id)
    }
  }).catch(() => {});
}

async function withdrawSubmission(s) {
  if (!s?.id || !agencyId.value) return;
  const ok = window.confirm(
    'Withdraw this submission from payroll review?\n\nIt will stay here as “Needs resubmit” so you can edit it in My Payroll. It will not be paid until you resubmit.'
  );
  if (!ok) return;
  deletingId.value = s.id;
  error.value = '';
  try {
    await api.delete(`/payroll/me/time-claims/${s.id}`, { params: { agencyId: agencyId.value } });
    success.value = 'Withdrawn. It’s still listed as Needs resubmit — edit it in My Payroll when ready.';
    await loadSubmissions();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to withdraw';
  } finally {
    deletingId.value = null;
  }
}

async function hardDeleteSubmission(s) {
  if (!s?.id || !agencyId.value) return;
  const first = window.confirm(
    'DELETE this time permanently?\n\nIf you delete it, you cannot be paid for this time. Prefer Withdraw, then Edit in My Payroll, if you still want to be paid.'
  );
  if (!first) return;
  const typed = window.prompt(
    'Type DELETE to permanently remove this claim. This cannot be undone.'
  );
  if (String(typed || '').trim().toUpperCase() !== 'DELETE') {
    window.alert('Delete cancelled.');
    return;
  }
  deletingId.value = s.id;
  error.value = '';
  try {
    await api.delete(`/payroll/me/time-claims/${s.id}`, {
      params: { agencyId: agencyId.value, hard: 1, confirmDelete: 'DELETE' }
    });
    success.value = 'Submission deleted permanently.';
    await loadSubmissions();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to delete';
  } finally {
    deletingId.value = null;
  }
}

async function loadSubmissions() {
  if (!agencyId.value) return;
  subsLoading.value = true;
  try {
    const resp = await api.get('/payroll/me/time-claims', { params: { agencyId: agencyId.value } });
    const rows = Array.isArray(resp.data) ? resp.data : (resp.data?.claims || resp.data?.rows || []);
    submissions.value = rows.filter((c) => String(c?.claim_type || '').toLowerCase() === 'indirect_time');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load submissions';
  } finally {
    subsLoading.value = false;
  }
}

function startTick() {
  stopTick();
  tickTimer = setInterval(() => {
    tickNow.value = Date.now();
  }, 1000);
}

function stopTick() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

async function bootstrap() {
  if (!props.enabled || !agencyId.value) return;
  await Promise.all([loadTypes(), loadSession(), loadRatioHint()]);
  startTick();
}

watch(
  () => [props.enabled, agencyId.value],
  ([en]) => {
    if (en) bootstrap();
    else stopTick();
  },
  { immediate: true }
);

// Timedown Clock Out while already on Log Time
watch(
  () => indirectSessionStore.lastClosedSession?.id,
  (id) => {
    if (id && props.enabled) loadSession();
  }
);

onMounted(() => {
  if (props.enabled) bootstrap();
});

onUnmounted(() => stopTick());
</script>

<style scoped>
.itl {
  --itl-green: #166534;
  --itl-green-dark: #14532d;
  --itl-green-soft: #dcfce7;
  --itl-border: #e5e7eb;
  --itl-muted: #6b7280;
  --itl-bg: #f3f4f6;
  background: var(--itl-bg);
  border-radius: 12px;
  overflow: hidden;
  min-height: 100%;
}
.itl-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 18px;
  background: var(--itl-green);
  color: #fff;
}
.itl-top-left, .itl-top-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.itl-top-icon {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: rgba(255,255,255,0.15);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.itl-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
}
.itl-date {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 4px 8px;
}
.itl-date-input {
  border: none;
  background: transparent;
  color: #fff;
  font-size: 0.9rem;
}
.itl-date-input::-webkit-calendar-picker-indicator { filter: invert(1); }
.itl-user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.itl-avatar {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: #fff;
  color: var(--itl-green);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
}
.itl-user-name { font-size: 0.9rem; font-weight: 600; }
.itl-body { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.itl-card {
  background: #fff;
  border: 1px solid var(--itl-border);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.itl-session {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: center;
}
@media (max-width: 720px) {
  .itl-session { grid-template-columns: 1fr; text-align: center; }
  .itl-session-actions { justify-content: center; }
}
.itl-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}
.itl-badge.ok { background: var(--itl-green-soft); color: var(--itl-green); }
.itl-badge.warn { background: #fef3c7; color: #b45309; }
.itl-badge.idle { background: #f3f4f6; color: #6b7280; }
.itl-session-meta { margin: 8px 0 0; color: var(--itl-muted); font-size: 0.9rem; }
.itl-adjust-out {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #fde68a;
  background: #fffbeb;
  border-radius: 8px;
  max-width: 320px;
}
.itl-adjust-out-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #92400e;
}
.itl-adjust-out-input {
  width: 100%;
  max-width: 160px;
  padding: 8px 10px;
  border: 1px solid #f59e0b;
  border-radius: 6px;
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}
.itl-adjust-out-hint {
  margin: 8px 0 0;
  font-size: 0.78rem;
  color: #a16207;
  line-height: 1.35;
}
.itl-adjust-done-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--itl-muted);
  max-width: 160px;
  text-align: right;
}
.itl-timer {
  font-size: 2.4rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #111827;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.itl-timer-label {
  text-align: center;
  font-size: 0.7rem;
  color: var(--itl-muted);
  letter-spacing: 0.08em;
  margin-top: 4px;
}
.itl-session-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.itl-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--itl-border);
  background: #fff;
  color: #111827;
}
.itl-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.itl-btn-primary { background: var(--itl-green); border-color: var(--itl-green); color: #fff; }
.itl-btn-notes {
  background: #ecfdf5;
  border-color: #166534;
  color: #14532d;
}
.itl-btn-notes:hover:not(:disabled) { background: #d1fae5; }
.itl-btn-ghost:hover { background: #f9fafb; }
.itl-btn-danger { border-color: #ef4444; color: #dc2626; }
.itl-notes-session-hint {
  grid-column: 1 / -1;
  margin: 4px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  font-size: 0.82rem;
  color: #14532d;
  line-height: 1.4;
}
.itl-tabs {
  display: flex;
  gap: 18px;
  border-bottom: 1px solid var(--itl-border);
  padding: 0 4px;
}
.itl-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 10px 2px;
  color: var(--itl-muted);
  font-weight: 600;
  cursor: pointer;
}
.itl-tab.active {
  color: var(--itl-green);
  border-bottom-color: var(--itl-green);
}
.itl-section-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--itl-green-dark);
}
.itl-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.itl-section-actions { display: flex; gap: 10px; }
.itl-link-btn {
  background: none;
  border: none;
  color: var(--itl-green);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0;
}
.itl-method-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}
@media (max-width: 560px) {
  .itl-method-grid { grid-template-columns: 1fr; }
}
.itl-method {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  text-align: left;
  border: 2px solid var(--itl-border);
  border-radius: 12px;
  padding: 16px;
  background: #fff;
  cursor: pointer;
}
.itl-method.selected { border-color: var(--itl-green); background: #f0fdf4; }
.itl-method-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--itl-green-soft);
  color: var(--itl-green);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.itl-method-icon--alt { background: #ede9fe; color: #6d28d9; }
.itl-method-label { font-weight: 700; color: #111827; }
.itl-pill {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: var(--itl-green);
  color: #fff;
  border-radius: 999px;
  padding: 3px 8px;
}
.itl-manual-times {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  margin-top: 14px;
}
.itl-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
  color: var(--itl-muted);
  font-weight: 600;
}
.itl-field input {
  border: 1px solid var(--itl-border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.95rem;
  color: #111827;
}
.itl-manual-total { font-size: 0.9rem; color: #374151; padding-bottom: 8px; }
.itl-hint { margin: 12px 0 0; color: var(--itl-muted); font-size: 0.9rem; }
.itl-dual-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 900px) {
  .itl-dual-cols { grid-template-columns: 1fr; }
}
.itl-dual-col {
  border: 1px solid var(--itl-border);
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}
.itl-dual-col--indirect {
  border-color: #86efac;
  background: #f0fdf4;
}
.itl-dual-col--other1 {
  border-color: #93c5fd;
  background: #eff6ff;
}
.itl-dual-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}
.itl-dual-badge {
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 6px;
}
.itl-dual-badge--indirect { background: #166534; color: #fff; }
.itl-dual-badge--other1 { background: #1d4ed8; color: #fff; }
.itl-dual-sub { font-size: 0.8rem; color: var(--itl-muted); }
.itl-type-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 900px) {
  .itl-type-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .itl-type-grid { grid-template-columns: 1fr; }
}
.itl-type-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--itl-border);
  border-radius: 10px;
  padding: 12px 12px 12px 12px;
  cursor: pointer;
  background: #fff;
  min-height: 96px;
}
.itl-type-card.selected {
  border-color: var(--itl-green);
  background: #f0fdf4;
  box-shadow: inset 0 0 0 1px var(--itl-green);
}
.itl-type-check {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 16px;
  height: 16px;
  accent-color: var(--itl-green);
}
.itl-type-icon { color: var(--itl-green); margin-bottom: 4px; }
.itl-type-label {
  font-weight: 700;
  font-size: 0.88rem;
  color: var(--itl-green-dark);
  padding-right: 18px;
}
.itl-type-desc { font-size: 0.75rem; color: var(--itl-muted); line-height: 1.3; }
.itl-total-chip {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--itl-green);
  background: var(--itl-green-soft);
  border-radius: 999px;
  padding: 4px 10px;
}
.itl-table-wrap { overflow-x: auto; }
.itl-table {
  width: 100%;
  border-collapse: collapse;
}
.itl-table th, .itl-table td {
  text-align: left;
  padding: 10px 8px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.9rem;
}
.itl-table th { color: var(--itl-muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
.itl-hhmm {
  width: 88px;
  border: 1px solid var(--itl-border);
  border-radius: 8px;
  padding: 6px 8px;
  font-variant-numeric: tabular-nums;
}
.itl-col-actions { width: 44px; text-align: right; }
.itl-icon-btn {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 4px;
}
.itl-icon-btn:hover { color: #dc2626; }
.itl-alloc-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.itl-allocated { font-size: 0.9rem; color: #374151; }
.itl-mismatch { color: #dc2626; }
.itl-add-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.itl-chip {
  border: 1px solid var(--itl-border);
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.8rem;
  cursor: pointer;
}
.itl-chip:hover { border-color: var(--itl-green); color: var(--itl-green); }
.itl-warn { margin: 10px 0 0; color: #b45309; font-size: 0.85rem; }
.itl-submit-wrap { display: flex; flex-direction: column; gap: 10px; }
.itl-attest {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 0.85rem;
  color: #374151;
}
.itl-attest input { margin-top: 2px; accent-color: var(--itl-green); }
.itl-submit {
  width: 100%;
  border: none;
  border-radius: 10px;
  background: var(--itl-green);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  padding: 14px 16px;
  cursor: pointer;
}
.itl-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.itl-submit:not(:disabled):hover { background: var(--itl-green-dark); }
.itl-secure {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  color: var(--itl-muted);
  font-size: 0.8rem;
}
.itl-error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
}
.itl-success {
  background: #f0fdf4;
  color: var(--itl-green-dark);
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
}
.itl-muted { color: var(--itl-muted); font-size: 0.9rem; }
.itl-subs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.itl-sub {
  border: 1px solid var(--itl-border);
  border-radius: 10px;
  padding: 12px;
}
.itl-sub-main {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.itl-sub-mins { font-variant-numeric: tabular-nums; color: #374151; }
.itl-sub-status {
  text-transform: capitalize;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #4b5563;
}
.itl-sub-status[data-status="approved"] { background: var(--itl-green-soft); color: var(--itl-green); }
.itl-sub-status[data-status="rejected"] { background: #fef2f2; color: #b91c1c; }
.itl-sub-status[data-status="withdrawn"] { background: #fffbeb; color: #b45309; }
.itl-sub-status[data-status="deferred"] { background: #fffbeb; color: #b45309; }
.itl-sub-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
}
.itl-sub-allocs {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--itl-muted);
  font-size: 0.85rem;
}
.itl-sub-note {
  display: block;
  margin-top: 2px;
  color: #4b5563;
  font-style: italic;
}
.itl-danger-text { color: #dc2626; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  border: 0;
}
</style>
