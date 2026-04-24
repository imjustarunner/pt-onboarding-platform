<template>
  <div class="faf-root">
    <!-- Loading / error states -->
    <div v-if="loading" class="faf-loading">Loading availability form…</div>
    <div v-else-if="loadError" class="faf-error-screen">
      <p>{{ loadError }}</p>
      <router-link class="btn btn-secondary" to="/">Go to Dashboard</router-link>
    </div>

    <template v-else-if="form">
      <!-- Submitted confirmation banner -->
      <div v-if="alreadySubmitted" class="faf-submitted-banner">
        ✓ You've already submitted this form. You can update your responses and re-submit any time before the deadline.
      </div>

      <!-- ── Header ─────────────────────────────────────────────── -->
      <div class="faf-header">
        <h1 class="faf-title">{{ form.title }}</h1>
        <p v-if="form.subtitle" class="faf-subtitle">{{ form.subtitle }}</p>
        <p v-if="form.description" class="faf-desc">{{ form.description }}</p>
        <div v-if="form.deadline" class="faf-deadline">
          ⏰ Please respond by <strong>{{ fmtDate(form.deadline) }}</strong>
        </div>
      </div>

      <!-- ── How it works ───────────────────────────────────────── -->
      <div class="faf-howto">
        <div class="faf-howto-title">How to respond</div>
        <div class="faf-howto-items">
          <div class="faf-howto-item">
            <span class="faf-howto-icon faf-howto-slot">●</span>
            <span><strong>Want a Slot</strong> — you want to be assigned to this date. Slots are limited; you may also mark yourself as willing to waitlist or be on-call as a backup.</span>
          </div>
          <div class="faf-howto-item">
            <span class="faf-howto-icon faf-howto-waitlist">●</span>
            <span><strong>Waitlist Only</strong> — you can make this date work but only want to fill in if someone drops.</span>
          </div>
          <div class="faf-howto-item">
            <span class="faf-howto-icon faf-howto-oncall">●</span>
            <span><strong>On-Call Only</strong> — you're available to step in up to 1.5 hours before report time if needed.</span>
          </div>
          <div class="faf-howto-item">
            <span class="faf-howto-icon faf-howto-unavail">●</span>
            <span><strong>Not Available</strong> — you cannot make this date.</span>
          </div>
        </div>
      </div>

      <!-- ── Sessions ──────────────────────────────────────────── -->
      <div
        v-for="ev in form.events"
        :key="ev.id"
        class="faf-section"
      >
        <div class="faf-session-head">
          <div class="faf-session-name">{{ ev.event_title }}</div>
          <div class="faf-session-range">
            {{ fmtDate(ev.event_date) }}<template v-if="ev.end_date"> – {{ fmtDate(ev.end_date) }}</template>
          </div>
        </div>

        <!-- Location ranking for this session -->
        <div v-if="ev.locations_json && ev.locations_json.length > 1" class="faf-loc-rank">
          <div class="faf-loc-rank-head">Rank your preferred locations <span class="faf-loc-hint">(1 = top choice)</span></div>
          <div class="faf-loc-rank-list">
            <div
              v-for="(loc, locIdx) in ev.locations_json"
              :key="`loc-${ev.id}-${locIdx}`"
              class="faf-loc-rank-row"
            >
              <select
                class="faf-rank-select"
                :value="getRank(ev.id, loc)"
                @change="setRank(ev.id, loc, $event.target.value)"
              >
                <option value="">—</option>
                <option v-for="n in ev.locations_json.length" :key="n" :value="n">{{ n }}</option>
              </select>
              <span class="faf-loc-name">{{ loc }}</span>
            </div>
          </div>
        </div>
        <div v-else-if="ev.locations_json && ev.locations_json.length === 1" class="faf-loc-single">
          Location: <strong>{{ ev.locations_json[0] }}</strong>
        </div>

        <!-- Date rows -->
        <div v-if="!ev.session_dates || !ev.session_dates.length" class="faf-no-dates">
          No session dates configured for this session.
        </div>
        <div v-else class="faf-dates-list">
          <div
            v-for="sd in ev.session_dates"
            :key="sd.id"
            class="faf-date-card"
            :class="`faf-date-card--${getPref(ev.id, sd.session_date)}`"
          >
            <!-- Date info row -->
            <div class="faf-date-top">
              <div class="faf-date-label">
                <span class="faf-date-dow">{{ fmtDayOfWeek(sd.session_date) }}</span>
                <span class="faf-date-full">{{ fmtDate(sd.session_date) }}</span>
                <span v-if="sd.starts_at" class="faf-date-time">{{ fmtTime(sd.starts_at) }}</span>
              </div>
              <!-- Slot availability badge -->
              <div class="faf-slot-badge" :class="sd.openSlots === 0 ? 'faf-slot-badge--full' : 'faf-slot-badge--open'">
                <template v-if="sd.openSlots === 0">
                  Full — {{ sd.effectiveSlots }} slots filled
                </template>
                <template v-else>
                  {{ sd.openSlots }} of {{ sd.effectiveSlots }} slots open
                </template>
              </div>
            </div>

            <!-- Primary preference selector -->
            <div class="faf-pref-row">
              <button
                v-for="opt in PREF_OPTIONS"
                :key="opt.value"
                type="button"
                class="faf-pref-btn"
                :class="[
                  `faf-pref-btn--${opt.value}`,
                  { 'faf-pref-btn--active': getPref(ev.id, sd.session_date) === opt.value },
                  { 'faf-pref-btn--disabled-slot': opt.value === 'slot' && sd.openSlots === 0 && getPref(ev.id, sd.session_date) !== 'slot' }
                ]"
                @click="setPref(ev.id, sd.id, sd.session_date, opt.value)"
              >
                {{ opt.label }}
                <span v-if="opt.value === 'slot' && sd.openSlots === 0" class="faf-pref-full-note">(full)</span>
              </button>
            </div>

            <!-- Secondary willingness checkboxes (when preference is 'slot' or 'waitlist') -->
            <div
              v-if="['slot', 'waitlist'].includes(getPref(ev.id, sd.session_date))"
              class="faf-secondary-opts"
            >
              <label v-if="getPref(ev.id, sd.session_date) === 'slot'" class="faf-check-label">
                <input
                  type="checkbox"
                  :checked="getWaitlistWilling(ev.id, sd.session_date)"
                  @change="setWaitlistWilling(ev.id, sd.id, sd.session_date, $event.target.checked)"
                />
                <span>Also willing to waitlist if I'm not selected</span>
              </label>
              <label class="faf-check-label">
                <input
                  type="checkbox"
                  :checked="getOncallWilling(ev.id, sd.session_date)"
                  @change="setOncallWilling(ev.id, sd.id, sd.session_date, $event.target.checked)"
                />
                <span>Also willing to be on-call (step in up to 1.5 hrs before)</span>
              </label>
            </div>

            <!-- Comment -->
            <div class="faf-comment-wrap">
              <textarea
                class="faf-comment"
                rows="2"
                placeholder="Notes for this day… (optional)"
                :value="getComment(ev.id, sd.session_date)"
                @input="setComment(ev.id, sd.session_date, $event.target.value)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ── General notes ──────────────────────────────────────── -->
      <div class="faf-section">
        <div class="faf-section-head">General Notes <span class="faf-opt">(optional)</span></div>
        <textarea v-model="myGeneralNotes" class="faf-input" rows="3" placeholder="Anything else you'd like us to know?" />
      </div>

      <!-- ── Sticky footer ──────────────────────────────────────── -->
      <div class="faf-footer">
        <div v-if="saveMsg" class="faf-save-msg" :class="{ 'faf-save-msg--err': saveError }">{{ saveMsg }}</div>
        <div class="faf-footer-actions">
          <button type="button" class="btn btn-secondary" :disabled="saving" @click="save(false)">
            {{ saving && !submitting ? 'Saving…' : 'Save Draft' }}
          </button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="save(true)">
            {{ submitting ? 'Submitting…' : 'Submit Availability' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';

const route = useRoute();
const router = useRouter();

const requestId = route.params?.requestId;

// ── State ─────────────────────────────────────────────────────────────────────
const loading = ref(true);
const loadError = ref('');
const form = ref(null);
const alreadySubmitted = ref(false);

const myGeneralNotes = ref('');

// dateEntries keyed by `${eventId}__${entryDate}`
// → { preference, waitlistWilling, oncallWilling, comment, sessionDateId, companyEventId, entryDate }
const dateEntries = ref({});
// locationRanks keyed by `${eventId}__${location}` → rank (number)
const locationRanks = ref({});

const saving = ref(false);
const submitting = ref(false);
const saveMsg = ref('');
const saveError = ref(false);

const PREF_OPTIONS = [
  { value: 'slot',        label: 'Want a Slot' },
  { value: 'waitlist',    label: 'Waitlist Only' },
  { value: 'oncall',      label: 'On-Call Only' },
  { value: 'unavailable', label: 'Not Available' }
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(typeof d === 'string' && d.length === 10 ? d + 'T00:00:00' : d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtDayOfWeek = (d) => {
  if (!d) return '';
  const dt = new Date(typeof d === 'string' && d.length === 10 ? d + 'T00:00:00' : d);
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString(undefined, { weekday: 'long' });
};

const fmtTime = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const entryKey = (eventId, date) => `${eventId}__${date}`;
const rankKey = (eventId, loc) => `${eventId}__${loc}`;

const getEntry = (eventId, date) => dateEntries.value[entryKey(eventId, date)];
const getPref = (eventId, date) => getEntry(eventId, date)?.preference || 'unavailable';
const getWaitlistWilling = (eventId, date) => !!getEntry(eventId, date)?.waitlistWilling;
const getOncallWilling = (eventId, date) => !!getEntry(eventId, date)?.oncallWilling;
const getComment = (eventId, date) => getEntry(eventId, date)?.comment || '';
const getRank = (eventId, loc) => locationRanks.value[rankKey(eventId, loc)] || '';

const ensureEntry = (eventId, sessionDateId, date) => {
  const k = entryKey(eventId, date);
  if (!dateEntries.value[k]) {
    dateEntries.value[k] = {
      companyEventId: eventId,
      sessionDateId,
      entryDate: date,
      preference: 'unavailable',
      waitlistWilling: false,
      oncallWilling: false,
      comment: ''
    };
  }
  return dateEntries.value[k];
};

const setPref = (eventId, sessionDateId, date, value) => {
  const e = ensureEntry(eventId, sessionDateId, date);
  e.preference = value;
  // Clear secondary flags that don't apply to new preference
  if (value === 'oncall' || value === 'unavailable') {
    e.waitlistWilling = false;
    e.oncallWilling = false;
  }
  if (value === 'waitlist') e.waitlistWilling = false;
};

const setWaitlistWilling = (eventId, sessionDateId, date, val) => {
  ensureEntry(eventId, sessionDateId, date).waitlistWilling = val;
};

const setOncallWilling = (eventId, sessionDateId, date, val) => {
  ensureEntry(eventId, sessionDateId, date).oncallWilling = val;
};

const setComment = (eventId, date, value) => {
  const k = entryKey(eventId, date);
  if (!dateEntries.value[k]) dateEntries.value[k] = { companyEventId: eventId, sessionDateId: null, entryDate: date, preference: 'unavailable', waitlistWilling: false, oncallWilling: false, comment: '' };
  dateEntries.value[k].comment = value;
};

const setRank = (eventId, loc, value) => {
  locationRanks.value[rankKey(eventId, loc)] = value ? Number(value) : null;
};

// ── Hydrate existing submission ───────────────────────────────────────────────
const hydrateSubmission = (submission) => {
  if (!submission) return;
  myGeneralNotes.value = submission.general_notes || '';
  alreadySubmitted.value = !!submission.submitted_at;

  for (const de of (submission.dateEntries || [])) {
    const dateStr = de.entry_date?.slice(0, 10) ?? de.entry_date;
    const k = entryKey(de.company_event_id, dateStr);
    // Map legacy 'available' → 'slot'
    const rawAvail = de.availability || 'unavailable';
    const pref = rawAvail === 'available' ? 'slot' : rawAvail;
    dateEntries.value[k] = {
      companyEventId: de.company_event_id,
      sessionDateId: de.session_date_id,
      entryDate: dateStr,
      preference: pref,
      waitlistWilling: !!de.waitlist_willing,
      oncallWilling: !!de.oncall_willing,
      comment: de.comment || ''
    };
  }

  for (const lr of (submission.locationRanks || [])) {
    const k = `__re__${lr.request_event_id}__${lr.location}`;
    locationRanks.value[k] = lr.rank_order;
  }
};

const hydrateLocationRanks = () => {
  if (!form.value?.events) return;
  const reMap = {};
  for (const ev of form.value.events) reMap[ev.id] = ev.company_event_id;
  const newRanks = {};
  for (const [k, v] of Object.entries(locationRanks.value)) {
    if (k.startsWith('__re__')) {
      const [, , reId, ...locParts] = k.split('__');
      const eventId = reMap[Number(reId)];
      if (eventId) newRanks[rankKey(eventId, locParts.join('__'))] = v;
    } else {
      newRanks[k] = v;
    }
  }
  locationRanks.value = newRanks;
};

// ── Load form ─────────────────────────────────────────────────────────────────
const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const r = await api.get(`/facilitator-availability/${requestId}`);
    form.value = r.data;
    if (r.data?.submission) {
      hydrateSubmission(r.data.submission);
      hydrateLocationRanks();
    }
  } catch (e) {
    if (e?.response?.status === 401) {
      loadError.value = 'You must be logged in to fill out this form. Please log in and try again.';
    } else if (e?.response?.status === 404) {
      loadError.value = 'This availability form is not available or has been closed.';
    } else {
      loadError.value = 'Failed to load the form. Please try again.';
    }
  } finally {
    loading.value = false;
  }
};

// ── Build payload ─────────────────────────────────────────────────────────────
const buildPayload = (isSubmit) => {
  const entries = Object.values(dateEntries.value).filter((e) => e.entryDate && e.companyEventId);

  const ranks = [];
  if (form.value?.events) {
    for (const ev of form.value.events) {
      for (const loc of (ev.locations_json || [])) {
        const r = locationRanks.value[rankKey(ev.company_event_id, loc)];
        if (r) ranks.push({ requestEventId: ev.id, location: loc, rankOrder: r });
      }
    }
  }

  return {
    generalNotes: myGeneralNotes.value.trim() || null,
    submit: isSubmit,
    dateEntries: entries.map((e) => ({
      companyEventId: e.companyEventId,
      sessionDateId: e.sessionDateId || null,
      entryDate: e.entryDate,
      availability: e.preference,      // backend field name kept for compat
      waitlistWilling: !!e.waitlistWilling,
      oncallWilling: !!e.oncallWilling,
      comment: e.comment?.trim() || null
    })),
    locationRanks: ranks
  };
};

// ── Save / Submit ─────────────────────────────────────────────────────────────
const save = async (isSubmit) => {
  saving.value = true;
  submitting.value = isSubmit;
  saveMsg.value = '';
  saveError.value = false;
  try {
    await api.post(`/facilitator-availability/${requestId}/submit`, buildPayload(isSubmit));
    saveMsg.value = isSubmit
      ? '✓ Your availability has been submitted. Thank you!'
      : 'Draft saved.';
    if (isSubmit) {
      alreadySubmitted.value = true;
      setTimeout(() => router.push('/'), 3000);
    }
  } catch (e) {
    saveError.value = true;
    saveMsg.value = e?.response?.data?.error?.message || 'Failed to save. Please try again.';
  } finally {
    saving.value = false;
    submitting.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.faf-root { max-width: 860px; margin: 0 auto; padding: 28px 16px 110px; }

/* States */
.faf-loading, .faf-error-screen { text-align: center; padding: 80px 0; color: #64748b; font-size: 1rem; }
.faf-error-screen p { margin-bottom: 16px; }

/* Submitted banner */
.faf-submitted-banner {
  background: #dcfce7; border: 1px solid #86efac; color: #166534;
  border-radius: 10px; padding: 12px 18px; margin-bottom: 20px; font-size: .9rem;
}

/* Header */
.faf-header { margin-bottom: 20px; }
.faf-title { font-size: 1.7rem; font-weight: 800; color: #0f172a; margin: 0 0 6px; }
.faf-subtitle { font-size: 1rem; color: #475569; margin: 0 0 8px; }
.faf-desc { color: #64748b; font-size: .93rem; margin: 0 0 12px; white-space: pre-wrap; }
.faf-deadline {
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
  padding: 9px 16px; font-size: .88rem; color: #92400e; display: inline-flex;
  align-items: center; gap: 6px;
}

/* How it works */
.faf-howto {
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
  padding: 16px 20px; margin-bottom: 24px;
}
.faf-howto-title { font-size: .85rem; font-weight: 700; color: #374151; margin-bottom: 10px; text-transform: uppercase; letter-spacing: .05em; }
.faf-howto-items { display: grid; gap: 8px; }
.faf-howto-item { display: flex; gap: 10px; align-items: flex-start; font-size: .88rem; color: #374151; }
.faf-howto-icon { font-size: 10px; margin-top: 3px; flex-shrink: 0; }
.faf-howto-slot    { color: #2563eb; }
.faf-howto-waitlist { color: #d97706; }
.faf-howto-oncall  { color: #7c3aed; }
.faf-howto-unavail { color: #94a3b8; }

/* Section */
.faf-section { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 22px; margin-bottom: 20px; }
.faf-section-head { font-size: 1rem; font-weight: 700; color: #0f172a; margin-bottom: 14px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
.faf-opt { font-size: .82rem; font-weight: 400; color: #94a3b8; }

/* Session header */
.faf-session-head { margin-bottom: 16px; }
.faf-session-name { font-size: 1.1rem; font-weight: 700; color: #1e3a8a; }
.faf-session-range { font-size: .85rem; color: #64748b; margin-top: 2px; }

/* Location ranking */
.faf-loc-rank { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 16px; }
.faf-loc-rank-head { font-size: .88rem; font-weight: 600; color: #374151; margin-bottom: 10px; }
.faf-loc-hint { color: #94a3b8; font-weight: 400; }
.faf-loc-rank-list { display: grid; gap: 8px; }
.faf-loc-rank-row { display: flex; align-items: center; gap: 10px; }
.faf-rank-select { width: 64px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 8px; font-size: .9rem; }
.faf-loc-name { color: #0f172a; font-size: .92rem; }
.faf-loc-single { font-size: .88rem; color: #475569; margin-bottom: 12px; }
.faf-no-dates { color: #94a3b8; font-size: .88rem; padding: 12px 0; }

/* Date cards list */
.faf-dates-list { display: grid; gap: 12px; }

/* Individual date card */
.faf-date-card {
  border: 1.5px solid #e2e8f0; border-radius: 12px;
  padding: 14px 16px; background: #fff;
  transition: border-color .15s, background .15s;
}
.faf-date-card--slot        { border-color: #3b82f6; background: #eff6ff; }
.faf-date-card--waitlist    { border-color: #f59e0b; background: #fffbeb; }
.faf-date-card--oncall      { border-color: #8b5cf6; background: #f5f3ff; }
.faf-date-card--unavailable { border-color: #e2e8f0; background: #f8fafc; }

/* Date card top row: label + slot badge */
.faf-date-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 8px; }
.faf-date-label { display: flex; flex-direction: column; gap: 1px; }
.faf-date-dow  { font-size: .9rem; font-weight: 700; color: #0f172a; }
.faf-date-full { font-size: .82rem; color: #475569; }
.faf-date-time { font-size: .78rem; color: #64748b; }

/* Slot badge */
.faf-slot-badge {
  font-size: .75rem; font-weight: 700; border-radius: 999px;
  padding: 4px 12px; white-space: nowrap;
}
.faf-slot-badge--open { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
.faf-slot-badge--full { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

/* Preference buttons */
.faf-pref-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.faf-pref-btn {
  border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 7px 14px;
  font-size: .82rem; font-weight: 600; cursor: pointer; background: #fff;
  color: #475569; transition: all .12s; display: flex; align-items: center; gap: 4px;
}
.faf-pref-btn:hover { border-color: #94a3b8; background: #f8fafc; }
.faf-pref-btn--slot.faf-pref-btn--active        { background: #dbeafe; border-color: #3b82f6; color: #1e40af; }
.faf-pref-btn--waitlist.faf-pref-btn--active    { background: #fef3c7; border-color: #f59e0b; color: #92400e; }
.faf-pref-btn--oncall.faf-pref-btn--active      { background: #ede9fe; border-color: #8b5cf6; color: #5b21b6; }
.faf-pref-btn--unavailable.faf-pref-btn--active { background: #f1f5f9; border-color: #94a3b8; color: #475569; }
.faf-pref-full-note { font-size: .72rem; font-weight: 400; color: #ef4444; }
.faf-pref-btn--disabled-slot { opacity: .65; }

/* Secondary options */
.faf-secondary-opts { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; padding: 10px 14px; background: rgba(0,0,0,.03); border-radius: 8px; }
.faf-check-label { display: flex; align-items: center; gap: 8px; font-size: .85rem; color: #374151; cursor: pointer; }
.faf-check-label input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; accent-color: #3b82f6; }

/* Comment */
.faf-comment-wrap { margin-top: 4px; }
.faf-comment {
  width: 100%; border: 1px solid #e2e8f0; border-radius: 8px;
  padding: 7px 10px; font-size: .85rem; resize: vertical; box-sizing: border-box;
  background: rgba(255,255,255,.8);
}
.faf-comment:focus { outline: 2px solid #3b82f6; border-color: transparent; }

/* General notes */
.faf-input { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; font-size: .9rem; color: #0f172a; box-sizing: border-box; }
.faf-input:focus { outline: 2px solid #3b82f6; border-color: transparent; }

/* Sticky footer */
.faf-footer {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: rgba(255,255,255,.97); backdrop-filter: blur(8px);
  border-top: 1px solid #e2e8f0; padding: 12px 28px;
  display: flex; justify-content: flex-end; align-items: center; gap: 12px;
  z-index: 100; box-shadow: 0 -4px 20px rgba(15,23,42,.08);
}
.faf-footer-actions { display: flex; gap: 8px; }
.faf-save-msg { font-size: .88rem; color: #166534; }
.faf-save-msg--err { color: #dc2626; }

.btn { border: none; border-radius: 8px; padding: 10px 22px; font-size: .9rem; font-weight: 600; cursor: pointer; transition: opacity .15s; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-primary { background: #2563eb; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.btn-secondary { background: #f1f5f9; color: #374151; border: 1px solid #e2e8f0; text-decoration: none; display: inline-flex; align-items: center; }
.btn-secondary:hover:not(:disabled) { background: #e2e8f0; }

@media (max-width: 600px) {
  .faf-date-top { flex-direction: column; }
  .faf-pref-row { gap: 5px; }
  .faf-pref-btn { font-size: .78rem; padding: 6px 10px; }
}
</style>
