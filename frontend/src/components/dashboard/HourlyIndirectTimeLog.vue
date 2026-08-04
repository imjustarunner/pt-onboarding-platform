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
        <div class="itl-user" v-if="displayName">
          <span class="itl-avatar" aria-hidden="true">{{ initials }}</span>
          <span class="itl-user-name">{{ displayName }}</span>
        </div>
      </div>
    </header>

    <div class="itl-body">
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
          @click="openSubmissionsTab"
        >
          <IndirectTimeIcon name="list" :size="16" />
          My Submissions
        </button>
      </div>

      <div v-if="error" class="itl-error" role="alert">{{ error }}</div>
      <div v-if="success" class="itl-success" role="status">{{ success }}</div>

      <template v-if="mainTab === 'enter'">
        <ol class="itl-stepper" aria-label="Time entry steps">
          <li :class="stepClass(1)"><span class="itl-step-n">1</span> How to enter</li>
          <li :class="stepClass(2)"><span class="itl-step-n">2</span> Your time</li>
          <li :class="stepClass(3)"><span class="itl-step-n">3</span> Activities</li>
          <li :class="stepClass(4)"><span class="itl-step-n">4</span> Allocate &amp; submit</li>
        </ol>

        <!-- Step 1: entry method -->
        <section class="itl-card itl-step-card" aria-labelledby="itl-method-heading">
          <h3 id="itl-method-heading" class="itl-section-title">Step 1 — How would you like to enter your time?</h3>
          <div class="itl-method-grid">
            <button
              type="button"
              class="itl-method"
              :class="{ selected: entryMethod === 'clock' }"
              @click="chooseEntryMethod('clock')"
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
              @click="chooseEntryMethod('manual')"
            >
              <span class="itl-method-icon itl-method-icon--alt" aria-hidden="true">
                <IndirectTimeIcon name="calendar" :size="28" :stroke-width="1.75" />
              </span>
              <span class="itl-method-label">Post Start &amp; End Time</span>
            </button>
          </div>
        </section>

        <!-- Step 2: establish time -->
        <section
          v-if="hasChosenEntryMethod"
          class="itl-card itl-step-card"
          aria-labelledby="itl-time-heading"
        >
          <h3 id="itl-time-heading" class="itl-section-title">Step 2 — Your worked time</h3>

          <template v-if="entryMethod === 'clock'">
            <div class="itl-session itl-session--step">
              <div class="itl-session-left">
                <div class="itl-status-row">
                  <span class="itl-badge" :class="sessionBadgeClass">{{ sessionBadgeLabel }}</span>
                </div>
                <p class="itl-session-meta">{{ sessionMetaText }}</p>
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
              </div>
              <p v-if="isClockedIn && noteAidUsedDuringSession" class="itl-notes-session-hint">
                Note Aid (Tools &amp; Aids → AI Tools) is part of this clocked session — your timer keeps running.
                When you allocate time, include <strong>Clinical Documentation</strong> for documentation work.
              </p>
            </div>
            <p v-if="!hasEstablishedTime" class="itl-step-hint">
              Clock in to start. After you clock out (or while clocked in), your date and times appear below and you can select activities.
            </p>
          </template>

          <template v-else-if="entryMethod === 'manual'">
            <div class="itl-manual-times itl-manual-times--prominent">
              <label class="itl-field">
                <span>Date worked</span>
                <input v-model="claimDate" type="date" :max="todayYmd" required />
              </label>
              <label class="itl-field">
                <span>Start time</span>
                <input v-model="manualStart" type="time" />
              </label>
              <label class="itl-field">
                <span>End time</span>
                <input v-model="manualEnd" type="time" />
              </label>
            </div>
            <p v-if="!hasEstablishedTime" class="itl-step-hint">
              Enter a valid date, start, and end time (at least 1 minute) to continue.
            </p>
          </template>

          <div v-if="hasEstablishedTime" class="itl-time-hero" aria-label="Session summary">
            <div class="itl-time-hero-grid">
              <div class="itl-time-hero-cell">
                <span class="itl-time-hero-label">Date</span>
                <strong class="itl-time-hero-value">{{ displayClaimDateLabel }}</strong>
              </div>
              <div class="itl-time-hero-cell">
                <span class="itl-time-hero-label">Start</span>
                <strong class="itl-time-hero-value">{{ sessionBoundsHm.start || '—' }}</strong>
              </div>
              <div class="itl-time-hero-cell">
                <span class="itl-time-hero-label">End</span>
                <strong class="itl-time-hero-value">{{ sessionBoundsHm.end || '—' }}</strong>
              </div>
              <div class="itl-time-hero-cell itl-time-hero-cell--total">
                <span class="itl-time-hero-label">Total time</span>
                <strong class="itl-time-hero-value itl-time-hero-total">{{ formatHm(sessionTotalMinutes) }}</strong>
              </div>
            </div>
            <p class="itl-time-hero-tz">
              Times in {{ timezoneAbbrevAt(new Date(), displayTimeZone) || displayTimeZone }}
            </p>
          </div>
        </section>

        <!-- Step 3: activity types -->
        <section
          v-if="canShowActivityStep"
          class="itl-card itl-step-card"
          aria-labelledby="itl-types-heading"
        >
          <div class="itl-section-head">
            <h3 id="itl-types-heading" class="itl-section-title">Step 3 — Select activity type(s)</h3>
            <div class="itl-section-actions">
              <button type="button" class="itl-link-btn" @click="selectAllTypes">Select All</button>
              <button type="button" class="itl-link-btn" @click="clearAllTypes">Clear All</button>
            </div>
          </div>
          <div v-if="typesLoading" class="itl-muted">Loading activity types…</div>
          <div v-else-if="!visibleServiceTypes.length" class="itl-muted">No Log Time categories are available for your role yet.</div>
          <div v-else class="itl-dual-cols" :class="{ 'itl-dual-cols--three': showThreeColumns }">
            <div v-if="showIndirectColumn" class="itl-dual-col itl-dual-col--indirect">
              <div class="itl-dual-head">
                <span class="itl-dual-badge itl-dual-badge--indirect">Indirect Service Time</span>
                <span class="itl-dual-sub">Paid at Indirect rate · counts toward PTO</span>
              </div>
              <div class="itl-type-grid" role="group" aria-label="Indirect Service Time">
                <label
                  v-for="t in indirectServiceTypes"
                  :key="t.id"
                  class="itl-type-card"
                  :class="{ selected: selectedTypeIds.has(t.id) }"
                  @mousedown.prevent
                  @click.prevent="toggleType(t)"
                >
                  <input
                    type="checkbox"
                    class="itl-type-check"
                    :checked="selectedTypeIds.has(t.id)"
                    :aria-label="t.label"
                    tabindex="-1"
                  />
                  <span class="itl-type-icon" aria-hidden="true">
                    <IndirectTimeIcon :name="t.iconKey" :size="22" :stroke-width="1.75" />
                  </span>
                  <span class="itl-type-label">{{ t.label }}</span>
                </label>
              </div>
              <p class="itl-disclaimer">
                If you performed work outside these categories, ask management whether it belongs in an existing
                category or whether the Agency should add a new category in a future update.
              </p>
            </div>

            <div class="itl-dual-col itl-dual-col--support">
              <div class="itl-dual-head">
                <span class="itl-dual-badge itl-dual-badge--support">Support Activity Time</span>
                <span class="itl-dual-sub">Paid at Support Activity rate · counts toward indirect / PTO</span>
              </div>
              <div class="itl-type-grid" role="group" aria-label="Support Activity Time">
                <label
                  v-for="t in supportServiceTypes"
                  :key="t.id"
                  class="itl-type-card"
                  :class="{ selected: selectedTypeIds.has(t.id) }"
                  @mousedown.prevent
                  @click.prevent="toggleType(t)"
                >
                  <input
                    type="checkbox"
                    class="itl-type-check"
                    :checked="selectedTypeIds.has(t.id)"
                    :aria-label="t.label"
                    tabindex="-1"
                  />
                  <span class="itl-type-icon" aria-hidden="true">
                    <IndirectTimeIcon :name="t.iconKey" :size="22" :stroke-width="1.75" />
                  </span>
                  <span class="itl-type-label">{{ t.label }}</span>
                </label>
              </div>
              <p class="itl-disclaimer">
                Virtual meetings are auto-logged and submitted via this application — duplicate submissions are not
                required. This includes supervision, training, and onboarding meetings. If a meeting was not
                auto-submitted, submit it here, verify with your supervisor, or check My Submissions for those
                auto submissions. Peer-to-peer meetings are never compensable unless at the direction of administrative staff.
              </p>
            </div>

            <div v-if="showSupervisionColumn" class="itl-dual-col itl-dual-col--supervision">
              <div class="itl-dual-head">
                <span class="itl-dual-badge itl-dual-badge--supervision">Supervision Note Time</span>
                <span class="itl-dual-sub">Paid at Admin Time rate · counts toward indirect / PTO</span>
              </div>
              <div class="itl-type-grid" role="group" aria-label="Supervision Note Time">
                <label
                  v-for="t in supervisionNoteTypes"
                  :key="t.id"
                  class="itl-type-card"
                  :class="{ selected: selectedTypeIds.has(t.id) }"
                  @mousedown.prevent
                  @click.prevent="toggleType(t)"
                >
                  <input
                    type="checkbox"
                    class="itl-type-check"
                    :checked="selectedTypeIds.has(t.id)"
                    :aria-label="t.label"
                    tabindex="-1"
                  />
                  <span class="itl-type-icon" aria-hidden="true">
                    <IndirectTimeIcon :name="t.iconKey" :size="22" :stroke-width="1.75" />
                  </span>
                  <span class="itl-type-label">{{ t.label }}</span>
                </label>
              </div>
              <p class="itl-disclaimer">
                Use this for writing supervision notes and related admin after sessions. Supervisor attendance at
                Admin Meetings is auto-submitted and paid at your Admin Time rate — do not duplicate those claims.
              </p>
            </div>
          </div>
        </section>

        <!-- Step 4: allocate & submit -->
        <section
          v-if="canShowAllocateStep"
          class="itl-card itl-step-card itl-step-card--allocate"
          aria-labelledby="itl-allocate-heading"
        >
          <h3 id="itl-allocate-heading" class="itl-section-title">Step 4 — Allocate your time</h3>

          <IndirectTimeAllocationPanel
            ref="allocationPanelRef"
            :total-minutes="sessionTotalMinutes"
            :session-start-hm="sessionBoundsHm.start"
            :session-end-hm="sessionBoundsHm.end"
            :session-end-is-live="sessionEndIsLive"
            :service-types="visibleServiceTypes"
            :selected-type-ids="selectedTypeIdList"
            @update:selected-type-ids="onAllocationSelectedIds"
            @validity="allocationValid = $event"
          />

          <div v-if="selectedCategoryWarnings.length" class="itl-category-warnings" role="status">
            <p v-for="(w, idx) in selectedCategoryWarnings" :key="idx" class="itl-category-warning">
              {{ w }}
            </p>
          </div>
          <div v-if="duplicateWarning" class="itl-category-warnings itl-category-warnings--dup" role="status">
            <p class="itl-category-warning">{{ duplicateWarning }}</p>
          </div>

          <div class="itl-submit-wrap">
          <div class="itl-attest-card" :class="{ 'itl-attest-card--on': attestation }">
            <div class="itl-attest-head">
              <strong>I certify this time is accurate</strong>
              <label class="itl-switch" aria-label="Certify time submission">
                <input v-model="attestation" type="checkbox" />
                <span class="itl-switch-slider" />
              </label>
            </div>
            <p class="itl-attest-text">
              I confirm this time is complete and in compliance with workplace policies before submitting for payroll.
            </p>
          </div>
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
        </section>
      </template>

      <template v-else>
        <section class="itl-card">
          <div
            v-if="submissionViewMode === 'recent' && highlightSubmissionIds.size"
            class="itl-recent-only-banner"
          >
            <span>Showing the submission you just sent.</span>
            <button type="button" class="itl-link-btn" @click="showAllSubmissions">View all submissions</button>
          </div>
          <p class="itl-subs-intro hint">
            Manual Log Time and auto-submitted meeting/training claims appear here so you can avoid duplicates.
          </p>
          <div v-if="subsLoading" class="itl-muted">Loading submissions…</div>
          <div v-else-if="!displaySubmissions.length" class="itl-muted">No time submissions yet.</div>
          <ul v-else class="itl-subs">
            <li v-for="s in displaySubmissions" :key="s.id" class="itl-sub">
              <div class="itl-sub-main">
                <strong>{{ formatDisplayDate(s.claim_date) }}</strong>
                <span
                  v-if="isAutoSubmittedClaim(s)"
                  class="itl-sub-category itl-sub-category--auto"
                >Auto</span>
                <span
                  v-if="submissionCategoryLabel(s)"
                  class="itl-sub-category"
                  :data-category="s.payload?.categoryGroup || claimTypeCategory(s)"
                >{{ submissionCategoryLabel(s) }}</span>
                <span class="itl-sub-mins">{{ formatHm(submissionMinutes(s)) }}</span>
                <span class="itl-sub-status" :data-status="s.status">{{ submissionStatusLabel(s.status) }}</span>
              </div>
              <ul v-if="(s.payload?.allocations || []).length" class="itl-sub-allocs">
                <li v-for="(a, idx) in (s.payload?.allocations || [])" :key="idx">
                  {{ a.serviceTypeLabel }}
                  <template v-if="a.startTime && a.endTime"> — {{ a.startTime }}–{{ a.endTime }}</template>
                  — {{ formatHm(Number(a.minutes || 0)) }}
                  <template v-if="a.percent != null"> ({{ a.percent }}%)</template>
                  <span v-if="a.note" class="itl-sub-note"> — {{ a.note }}</span>
                </li>
              </ul>
              <p v-else-if="autoClaimDetail(s)" class="itl-sub-auto-detail">{{ autoClaimDetail(s) }}</p>
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
  normalizePayBucket,
  categoryGroupFromPayBucket,
  categoryGroupLabel,
  serviceCodeForCategoryGroup
} from '../../utils/hourlyDualRateContract.js';
import { isSupervisor } from '../../utils/helpers';

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

const EXCLUDED_INDIRECT_TYPE_KEYS = new Set(['other_indirect']);

/** Categories that often overlap with auto-submitted meeting/training claims. */
const AUTO_CLAIM_WARN_TYPE_KEYS = new Set([
  'outreach_activities',
  'staff_meeting',
  'onboarding_sa',
  'required_training',
  'clinical_supervision_sa'
]);

/** Categories that may already be billable as direct service. */
const BILLABLE_WARN_TYPE_KEYS = new Set([
  'care_coordination',
  'client_communication'
]);

const AUTO_CLAIM_TYPES = new Set(['meeting_training', 'mentor_cpa_meeting']);

function isExcludedIndirectType(t) {
  const key = String(t?.typeKey || t?.type_key || '').toLowerCase();
  return EXCLUDED_INDIRECT_TYPE_KEYS.has(key);
}

function typeKeyOf(t) {
  return String(t?.typeKey || t?.type_key || '').toLowerCase();
}

const isHourlyUser = computed(() => {
  const u = authStore.user || {};
  const raw = u.isHourlyWorker ?? u.is_hourly_worker;
  return raw === true || raw === 1 || raw === '1';
});
const isSupervisorUser = computed(() => isSupervisor(authStore.user));
const showIndirectColumn = computed(() => isHourlyUser.value);
const showSupervisionColumn = computed(() => isSupervisorUser.value);
const showThreeColumns = computed(() => showIndirectColumn.value && showSupervisionColumn.value);

const indirectServiceTypes = computed(() =>
  (serviceTypes.value || []).filter(
    (t) => normalizePayBucket(t.payBucket || t.pay_bucket) === 'indirect' && !isExcludedIndirectType(t)
  )
);
const supportServiceTypes = computed(() =>
  (serviceTypes.value || []).filter((t) => {
    const b = normalizePayBucket(t.payBucket || t.pay_bucket);
    return b === 'support' || b === 'other_1';
  })
);
const supervisionNoteTypes = computed(() =>
  (serviceTypes.value || []).filter(
    (t) => normalizePayBucket(t.payBucket || t.pay_bucket) === 'supervision_note'
  )
);
const visibleServiceTypes = computed(() => {
  const out = [];
  if (showIndirectColumn.value) out.push(...indirectServiceTypes.value);
  out.push(...supportServiceTypes.value);
  if (showSupervisionColumn.value) out.push(...supervisionNoteTypes.value);
  return out;
});

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
const entryMethod = ref(null);
const claimDate = ref(todayYmd);
const manualStart = ref('09:00');
const manualEnd = ref('11:30');
const attestation = ref(false);
const serviceTypes = ref([]);
const typesLoading = ref(false);
const selectedTypeIds = ref(new Set());
const allocationPanelRef = ref(null);
const allocationValid = ref(false);
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
const submissionViewMode = ref('all'); // 'all' | 'recent'
const highlightSubmissionIds = ref(new Set());

const displaySubmissions = computed(() => {
  if (submissionViewMode.value === 'recent' && highlightSubmissionIds.value.size) {
    return submissions.value.filter((s) => highlightSubmissionIds.value.has(Number(s.id)));
  }
  return submissions.value;
});

const selectedTypeRecords = computed(() =>
  (serviceTypes.value || []).filter((t) => selectedTypeIds.value.has(t.id))
);

const selectedCategoryWarnings = computed(() => {
  const keys = new Set(selectedTypeRecords.value.map(typeKeyOf));
  const out = [];
  if ([...keys].some((k) => AUTO_CLAIM_WARN_TYPE_KEYS.has(k))) {
    out.push(
      'Please ensure you do not have a current time claim auto-submitted prior to manually submitting. Check My Submissions for Auto claims first.'
    );
  }
  if ([...keys].some((k) => BILLABLE_WARN_TYPE_KEYS.has(k))) {
    out.push(
      'Please ensure this service does not satisfy a billable direct service prior to submitting this manual submission.'
    );
  }
  return out;
});

const claimDateForDuplicateCheck = computed(() => displayClaimDateYmd.value);

const duplicateWarning = computed(() => {
  const ymd = claimDateForDuplicateCheck.value;
  if (!ymd || !selectedTypeIds.value.size) return '';
  const keys = selectedTypeRecords.value.map(typeKeyOf);
  const wantsAutoOverlap = keys.some((k) => AUTO_CLAIM_WARN_TYPE_KEYS.has(k));
  if (!wantsAutoOverlap) return '';
  const sameDayAuto = (submissions.value || []).filter((s) => {
    if (!isAutoSubmittedClaim(s)) return false;
    const st = String(s.status || '').toLowerCase();
    if (!['submitted', 'approved', 'deferred'].includes(st)) return false;
    return String(s.claim_date || '').slice(0, 10) === ymd;
  });
  if (!sameDayAuto.length) return '';
  const labels = sameDayAuto
    .slice(0, 3)
    .map((s) => autoClaimDetail(s) || submissionCategoryLabel(s) || 'Auto claim')
    .join('; ');
  return `Possible duplicate: ${sameDayAuto.length} auto-submitted claim(s) already on ${formatDisplayDate(ymd)} (${labels}). Review My Submissions before submitting.`;
});

function openSubmissionsTab() {
  if (submissionViewMode.value !== 'recent') {
    submissionViewMode.value = 'all';
  }
  mainTab.value = 'submissions';
  loadSubmissions();
}

function showAllSubmissions() {
  submissionViewMode.value = 'all';
  highlightSubmissionIds.value = new Set();
}

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
  if (entryMethod.value === 'clock') return clockTotalMinutes.value;
  return 0;
});

const hasChosenEntryMethod = computed(() => entryMethod.value === 'clock' || entryMethod.value === 'manual');

const hasEstablishedTime = computed(() => {
  if (entryMethod.value === 'manual') {
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(String(claimDate.value || '')) &&
      manualTotalMinutes.value >= 1
    );
  }
  if (entryMethod.value === 'clock') {
    return isClockedIn.value || (session.value?.clockedInAt && sessionTotalMinutes.value >= 1);
  }
  return false;
});

const canShowActivityStep = computed(() => hasChosenEntryMethod.value && hasEstablishedTime.value);

const canShowAllocateStep = computed(
  () => canShowActivityStep.value && selectedTypeIds.value.size > 0
);

const displayClaimDateYmd = computed(() => {
  if (entryMethod.value === 'manual') return String(claimDate.value || '').slice(0, 10);
  if (session.value?.clockedInAt) {
    try {
      const d = new Date(session.value.clockedInAt);
      return d.toLocaleDateString('en-CA', { timeZone: displayTimeZone.value });
    } catch {
      return String(session.value.clockedInAt).slice(0, 10);
    }
  }
  return String(claimDate.value || todayYmd).slice(0, 10);
});

const displayClaimDateLabel = computed(() => formatDisplayDate(displayClaimDateYmd.value));

function stepClass(n) {
  const done =
    n === 1 ? hasChosenEntryMethod.value
    : n === 2 ? hasEstablishedTime.value
    : n === 3 ? selectedTypeIds.value.size > 0
    : n === 4 ? allocationValid.value && attestation.value
    : false;
  const active =
    n === 1 ? !hasChosenEntryMethod.value
    : n === 2 ? hasChosenEntryMethod.value && !hasEstablishedTime.value
    : n === 3 ? hasEstablishedTime.value && !selectedTypeIds.value.size
    : n === 4 ? selectedTypeIds.value.size > 0
    : false;
  return { done, active };
}

function chooseEntryMethod(method) {
  if (entryMethod.value === method) return;
  entryMethod.value = method;
  clearAllTypes();
  attestation.value = false;
}

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
  if (!hasChosenEntryMethod.value || !hasEstablishedTime.value) return false;
  if (!attestation.value) return false;
  if (entryMethod.value === 'manual' && !/^\d{4}-\d{2}-\d{2}$/.test(String(claimDate.value || ''))) return false;
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
  const writing = (serviceTypes.value || []).find((t) => {
    const key = String(t.typeKey || t.type_key || '').toLowerCase();
    return key === 'clinical_documentation' || key === 'writing_notes';
  });
  if (!writing?.id) return;
  if (selectedTypeIds.value.has(writing.id)) return;
  const next = new Set(selectedTypeIds.value);
  next.add(writing.id);
  selectedTypeIds.value = next;
}

function isAutoSubmittedClaim(s) {
  return AUTO_CLAIM_TYPES.has(String(s?.claim_type || '').toLowerCase());
}

function claimTypeCategory(s) {
  if (isAutoSubmittedClaim(s)) return 'support_activity';
  return String(s?.payload?.categoryGroup || '');
}

function submissionMinutes(s) {
  const mins = Number(s?.payload?.totalMinutes || 0);
  if (Number.isFinite(mins) && mins > 0) return mins;
  const hrs = Number(s?.credits_hours || s?.creditsHours || 0);
  if (Number.isFinite(hrs) && hrs > 0) return Math.round(hrs * 60);
  return 0;
}

function autoClaimDetail(s) {
  if (!isAutoSubmittedClaim(s)) return '';
  const p = s?.payload || {};
  const mt = String(p.meetingType || p.title || p.eventTitle || '').trim();
  const code = String(p.serviceCode || '').trim();
  if (mt && code) return `${mt} (${code})`;
  if (mt) return mt;
  if (code) return code;
  return 'Auto-submitted meeting / training';
}

function submissionCategoryLabel(s) {
  if (isAutoSubmittedClaim(s)) {
    return autoClaimDetail(s) || 'Support Activity (auto)';
  }
  const payload = s?.payload || {};
  if (payload.categoryLabel) return String(payload.categoryLabel);
  if (payload.categoryGroup) return categoryGroupLabel(payload.categoryGroup);
  return categoryGroupLabel(categoryGroupFromPayBucket(payload.bucket || payload.payBucket));
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
      (serviceTypes.value || [])
        .filter((t) => !isExcludedIndirectType(t))
        .map((t) => Number(t.id))
        .filter((n) => Number.isFinite(n))
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

watch(hasEstablishedTime, (ok) => {
  if (!ok) clearAllTypes();
});

watch(sessionTotalMinutes, (n, prev) => {
  if (n > 0 && selectedTypeIds.value.size && canShowAllocateStep.value && (!prev || prev === 0)) {
    allocationPanelRef.value?.tryEvenDistribute?.();
  }
});

async function loadTypes() {
  if (!agencyId.value) return;
  typesLoading.value = true;
  error.value = '';
  try {
    const resp = await api.get('/payroll/me/indirect-service-types', { params: { agencyId: agencyId.value } });
    const raw = Array.isArray(resp.data?.types) ? resp.data.types : [];
    serviceTypes.value = raw.filter((t) => !isExcludedIndirectType(t));
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
    if (session.value?.clockedInAt) {
      entryMethod.value = 'clock';
    }
  } catch (e) {
    // Non-fatal on initial load
    if (e.response?.status !== 403) {
      error.value = e.response?.data?.error?.message || e.message || 'Failed to load session';
    }
  }
}

async function clockIn() {
  if (!agencyId.value) return;
  entryMethod.value = 'clock';
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

function unrefAllocationMode(panel) {
  const m = panel?.allocationMode;
  if (m && typeof m === 'object' && 'value' in m) return m.value || 'duration';
  return m || 'duration';
}

function typePayBucket(typeId) {
  const t = (serviceTypes.value || []).find((x) => Number(x.id) === Number(typeId));
  return normalizePayBucket(t?.payBucket || t?.pay_bucket || 'indirect');
}

async function postIndirectTimeClaim({
  totalMinutes,
  allocations,
  payBucket,
  categoryGroup,
  startTime,
  endTime,
  allocationMode,
  usedNoteAid
}) {
  const group = categoryGroup || categoryGroupFromPayBucket(payBucket);
  const serviceCode = serviceCodeForCategoryGroup(group);
  const tagged = (allocations || []).map((a) => ({
    ...a,
    payBucket: payBucket || normalizePayBucket(a.payBucket)
  }));
  return await api.post('/payroll/me/time-claims', {
    agencyId: agencyId.value,
    claimType: 'indirect_time',
    claimDate: displayClaimDateYmd.value,
    payload: {
      entryMethod: entryMethod.value,
      allocationMode,
      startTime,
      endTime,
      totalMinutes,
      allocations: tagged,
      categoryGroup: group,
      categoryLabel: categoryGroupLabel(group),
      bucket: 'indirect',
      ...(serviceCode ? { serviceCode } : {}),
      sessionId: session.value?.id || null,
      noteAidUsedDuringSession: usedNoteAid,
      ...(usedNoteAid && indirectSessionStore.noteAidOpenedAt
        ? { noteAidOpenedAt: indirectSessionStore.noteAidOpenedAt }
        : {}),
      attestation: true
    }
  }).then((r) => r.data);
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
  if (duplicateWarning.value) {
    const okDup = window.confirm(
      `${duplicateWarning.value}\n\nSubmit this manual time anyway?`
    );
    if (!okDup) return;
  } else if (selectedCategoryWarnings.value.length) {
    const okWarn = window.confirm(
      `${selectedCategoryWarnings.value.join('\n\n')}\n\nContinue with submission?`
    );
    if (!okWarn) return;
  }
  submitting.value = true
  error.value = '';
  success.value = '';
  try {
    if (entryMethod.value === 'manual' && !/^\d{4}-\d{2}-\d{2}$/.test(String(claimDate.value || ''))) {
      throw new Error('Date worked is required');
    }
    if (entryMethod.value === 'clock' && isClockedIn.value) {
      await clockOut();
    }
    const allocations = panel?.getAllocationsForSubmit?.() || [];
    const startTime = sessionBoundsHm.value.start || manualStart.value;
    const endTime = sessionBoundsHm.value.end || manualEnd.value;
    const usedNoteAid = !!indirectSessionStore.noteAidUsedDuringSession;
    const allocationMode = unrefAllocationMode(panel);
    const createdIds = [];
    const byGroup = {
      indirect_service: [],
      support_activity: [],
      supervision_note: []
    };
    for (const a of allocations) {
      const bucket = typePayBucket(a.serviceTypeId);
      const group = categoryGroupFromPayBucket(bucket);
      if (!byGroup[group]) byGroup[group] = [];
      byGroup[group].push({ ...a, payBucket: bucket });
    }
    const parts = [];
    for (const group of ['indirect_service', 'support_activity', 'supervision_note']) {
      const allocs = byGroup[group] || [];
      const mins = allocs.reduce((s, a) => s + Number(a.minutes || 0), 0);
      if (mins < 1) continue;
      const payBucket = group === 'support_activity'
        ? 'support'
        : group === 'supervision_note'
          ? 'supervision_note'
          : 'indirect';
      const created = await postIndirectTimeClaim({
        totalMinutes: mins,
        allocations: allocs,
        payBucket,
        categoryGroup: group,
        startTime,
        endTime,
        allocationMode,
        usedNoteAid
      });
      if (created?.id) createdIds.push(Number(created.id));
      parts.push(`${formatHm(mins)} ${categoryGroupLabel(group)}`);
    }
    if (!parts.length) {
      throw new Error('Allocate minutes to at least one activity type');
    }
    success.value = `Submitted ${parts.join(' + ')} for payroll review.`;

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
    if (createdIds.length) {
      highlightSubmissionIds.value = new Set(createdIds.filter((id) => Number.isFinite(id) && id > 0));
      submissionViewMode.value = 'recent';
    } else {
      submissionViewMode.value = 'all';
      highlightSubmissionIds.value = new Set();
    }
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
  if (isAutoSubmittedClaim(s)) return false;
  const st = String(s?.status || '').toLowerCase();
  return ['submitted', 'deferred', 'rejected', 'withdrawn'].includes(st);
}

function canWithdrawSubmission(s) {
  if (isAutoSubmittedClaim(s)) return false;
  const st = String(s?.status || '').toLowerCase();
  return ['submitted', 'deferred', 'rejected'].includes(st);
}

function canDeleteSubmission(s) {
  if (isAutoSubmittedClaim(s)) return false;
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
    const allowed = new Set(['indirect_time', 'meeting_training', 'mentor_cpa_meeting']);
    submissions.value = rows
      .filter((c) => allowed.has(String(c?.claim_type || '').toLowerCase()))
      .sort((a, b) => {
        const da = String(b?.claim_date || '').localeCompare(String(a?.claim_date || ''));
        if (da) return da;
        return Number(b?.id || 0) - Number(a?.id || 0);
      });
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
  await Promise.all([loadTypes(), loadSession(), loadSubmissions()]);
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
.itl-stepper {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.itl-stepper li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  color: var(--itl-muted);
}
.itl-stepper li.done { color: #166534; }
.itl-stepper li.active { color: #111827; font-weight: 700; }
.itl-step-n {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #e5e7eb;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 800;
  flex-shrink: 0;
}
.itl-stepper li.done .itl-step-n,
.itl-stepper li.active .itl-step-n {
  background: #166534;
  color: #fff;
}
.itl-step-card { scroll-margin-top: 12px; }
.itl-step-hint {
  margin: 12px 0 0;
  font-size: 0.88rem;
  color: var(--itl-muted);
  line-height: 1.4;
}
.itl-time-hero {
  margin-top: 16px;
  padding: 16px 18px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
  border: 2px solid #bbf7d0;
}
.itl-time-hero-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 640px) {
  .itl-time-hero-grid { grid-template-columns: repeat(2, 1fr); }
}
.itl-time-hero-label {
  display: block;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  font-weight: 700;
  margin-bottom: 4px;
}
.itl-time-hero-value {
  font-size: 1.35rem;
  font-variant-numeric: tabular-nums;
  color: #111827;
}
.itl-time-hero-total { font-size: 1.6rem; color: #166534; }
.itl-time-hero-tz {
  margin: 10px 0 0;
  font-size: 0.78rem;
  color: #6b7280;
}
.itl-manual-times--prominent {
  margin-top: 4px;
  padding: 12px;
  border-radius: 10px;
  background: #f9fafb;
  border: 1px solid var(--itl-border);
}
.itl-session--step {
  margin-top: 8px;
  margin-bottom: 0;
}
.itl-type-card { cursor: pointer; }
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
.itl-dual-cols--three {
  grid-template-columns: 1fr 1fr 1fr;
}
@media (max-width: 1100px) {
  .itl-dual-cols--three { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 900px) {
  .itl-dual-cols,
  .itl-dual-cols--three { grid-template-columns: 1fr; }
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
.itl-dual-col--support {
  border-color: #93c5fd;
  background: #eff6ff;
}
.itl-dual-col--supervision {
  border-color: #c4b5fd;
  background: #f5f3ff;
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
.itl-dual-badge--support { background: #1d4ed8; color: #fff; }
.itl-dual-badge--supervision { background: #6d28d9; color: #fff; }
.itl-dual-sub { font-size: 0.8rem; color: var(--itl-muted); }
.itl-disclaimer {
  margin: 12px 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: #4b5563;
  background: rgba(255, 255, 255, 0.65);
  border-radius: 8px;
  padding: 8px 10px;
}
.itl-category-warnings {
  margin: 12px 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.itl-category-warning {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  padding: 10px 12px;
}
.itl-category-warnings--dup .itl-category-warning {
  color: #9a3412;
  background: #fff7ed;
  border-color: #fdba74;
}
.itl-subs-intro {
  margin: 0 0 12px;
  font-size: 0.85rem;
}
.itl-sub-auto-detail {
  margin: 6px 0 0;
  font-size: 0.85rem;
  color: var(--itl-muted, #6b7280);
}
.itl-sub-category--auto {
  background: #dbeafe !important;
  color: #1d4ed8 !important;
}
.itl-sub-category {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 2px 7px;
  border-radius: 999px;
  background: #e5e7eb;
  color: #374151;
}
.itl-sub-category[data-category="support_activity"] { background: #dbeafe; color: #1e40af; }
.itl-sub-category[data-category="supervision_note"] { background: #ede9fe; color: #5b21b6; }
.itl-sub-category[data-category="indirect_service"] { background: #dcfce7; color: #166534; }
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
.itl-submit-wrap { display: flex; flex-direction: column; gap: 12px; align-items: stretch; }
.itl-attest-card {
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  padding: 14px 16px;
  border: 2px solid var(--itl-border);
  border-radius: 12px;
  background: #fff;
  text-align: center;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.itl-attest-card--on {
  border-color: var(--itl-green);
  background: #f0fdf4;
  box-shadow: 0 0 0 3px rgba(22, 101, 52, 0.12);
}
.itl-attest-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 6px;
}
.itl-attest-head strong {
  font-size: 1rem;
  color: #111827;
}
.itl-attest-text {
  margin: 0;
  font-size: 0.88rem;
  color: var(--itl-muted);
  line-height: 1.45;
}
.itl-switch {
  position: relative;
  display: inline-flex;
  width: 48px;
  height: 28px;
  flex-shrink: 0;
}
.itl-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.itl-switch-slider {
  position: absolute;
  inset: 0;
  cursor: pointer;
  background: #d1d5db;
  border-radius: 999px;
  transition: background 0.2s;
}
.itl-switch-slider::before {
  content: '';
  position: absolute;
  height: 22px;
  width: 22px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
.itl-switch input:checked + .itl-switch-slider {
  background: var(--itl-green);
}
.itl-switch input:checked + .itl-switch-slider::before {
  transform: translateX(20px);
}
.itl-switch input:focus-visible + .itl-switch-slider {
  box-shadow: 0 0 0 3px rgba(22, 101, 52, 0.25);
}
.itl-recent-only-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
  font-size: 0.9rem;
  color: #166534;
}
.itl-submit {
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
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
