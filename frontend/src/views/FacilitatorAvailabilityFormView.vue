<template>
  <div class="faf-root">
    <!-- Loading / error states -->
    <div v-if="loading" class="faf-loading">Loading availability form…</div>
    <div v-else-if="loadError" class="faf-error-screen">
      <p>{{ loadError }}</p>
      <button class="btn btn-secondary" type="button" @click="$router.back()">Go Back</button>
    </div>

    <template v-else-if="form">
      <!-- Submitted confirmation banner -->
      <div v-if="alreadySubmitted" class="faf-submitted-banner">
        You have already submitted this availability form. You may update and re-submit below.
      </div>

      <!-- ── Header ─────────────────────────────────────────────── -->
      <div class="faf-header">
        <h1 class="faf-title">{{ form.title }}</h1>
        <p v-if="form.subtitle" class="faf-subtitle">{{ form.subtitle }}</p>
        <p v-if="form.description" class="faf-desc">{{ form.description }}</p>
        <div v-if="form.deadline" class="faf-deadline">
          Please respond by <strong>{{ fmtDate(form.deadline) }}</strong>
        </div>
      </div>

      <!-- ── On-Call ────────────────────────────────────────────── -->
      <div v-if="form.on_call_enabled" class="faf-section faf-oncall-section">
        <div class="faf-section-head">On-Call Availability</div>
        <label class="faf-oncall-label">
          <input type="checkbox" v-model="myOnCall" />
          <span>
            I am willing to be <strong>on-call</strong>
            <span class="faf-oncall-hint"> — step in for a last-minute absence up to 1.5 hours before the report time.</span>
          </span>
        </label>
      </div>

      <!-- ── Sessions ──────────────────────────────────────────── -->
      <div
        v-for="(ev, evIdx) in form.events"
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
        <div v-else>
          <div class="faf-dates-head">
            <span>Date</span>
            <span class="faf-dates-avail-head">Availability</span>
            <span>Comment / Notes</span>
          </div>
          <div
            v-for="sd in ev.session_dates"
            :key="sd.id"
            class="faf-date-row"
            :class="`faf-date-row--${getAvailability(ev.id, sd.session_date)}`"
          >
            <div class="faf-date-label">
              <div class="faf-date-day">{{ fmtDayOfWeek(sd.session_date) }}</div>
              <div class="faf-date-full">{{ fmtDate(sd.session_date) }}</div>
              <div v-if="sd.starts_at" class="faf-date-time">{{ fmtTime(sd.starts_at) }}</div>
            </div>

            <div class="faf-avail-toggle">
              <button
                v-for="opt in AVAIL_OPTIONS"
                :key="opt.value"
                type="button"
                class="faf-avail-btn"
                :class="{ 'faf-avail-btn--active': getAvailability(ev.id, sd.session_date) === opt.value, [`faf-avail-btn--${opt.value}`]: true }"
                @click="setAvailability(ev.id, sd.id, sd.session_date, opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>

            <div class="faf-comment-wrap">
              <textarea
                class="faf-comment"
                rows="2"
                placeholder="Any notes for this day? (optional)"
                :value="getComment(ev.id, sd.session_date)"
                @input="setComment(ev.id, sd.session_date, $event.target.value)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ── General notes ──────────────────────────────────────── -->
      <div class="faf-section">
        <div class="faf-section-head">General Notes (optional)</div>
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

// Employee's current answers
const myOnCall = ref(false);
const myGeneralNotes = ref('');

// dateEntries keyed by `${eventId}__${entryDate}` → { availability, comment, sessionDateId, companyEventId, entryDate }
const dateEntries = ref({});
// locationRanks keyed by `${eventId}__${location}` → rank (number)
const locationRanks = ref({});

const saving = ref(false);
const submitting = ref(false);
const saveMsg = ref('');
const saveError = ref(false);

const AVAIL_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'unavailable', label: 'Unavailable' }
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
  return dt.toLocaleDateString(undefined, { weekday: 'short' });
};

const fmtTime = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const entryKey = (eventId, date) => `${eventId}__${date}`;
const rankKey = (eventId, loc) => `${eventId}__${loc}`;

const getAvailability = (eventId, date) => dateEntries.value[entryKey(eventId, date)]?.availability || 'unavailable';
const getComment = (eventId, date) => dateEntries.value[entryKey(eventId, date)]?.comment || '';
const getRank = (eventId, loc) => locationRanks.value[rankKey(eventId, loc)] || '';

const setAvailability = (eventId, sessionDateId, date, value) => {
  const k = entryKey(eventId, date);
  if (!dateEntries.value[k]) dateEntries.value[k] = { companyEventId: eventId, sessionDateId, entryDate: date, availability: 'unavailable', comment: '' };
  dateEntries.value[k].availability = value;
};

const setComment = (eventId, date, value) => {
  const k = entryKey(eventId, date);
  if (!dateEntries.value[k]) dateEntries.value[k] = { companyEventId: eventId, sessionDateId: null, entryDate: date, availability: 'unavailable', comment: '' };
  dateEntries.value[k].comment = value;
};

const setRank = (eventId, loc, value) => {
  const k = rankKey(eventId, loc);
  locationRanks.value[k] = value ? Number(value) : null;
};

// ── Hydrate existing submission ───────────────────────────────────────────────
const hydrateSubmission = (submission) => {
  if (!submission) return;
  myOnCall.value = !!submission.is_on_call;
  myGeneralNotes.value = submission.general_notes || '';
  alreadySubmitted.value = !!submission.submitted_at;

  for (const de of (submission.dateEntries || [])) {
    const k = entryKey(de.company_event_id, de.entry_date?.slice(0, 10) ?? de.entry_date);
    dateEntries.value[k] = {
      companyEventId: de.company_event_id,
      sessionDateId: de.session_date_id,
      entryDate: de.entry_date?.slice(0, 10) ?? de.entry_date,
      availability: de.availability || 'unavailable',
      comment: de.comment || ''
    };
  }

  for (const lr of (submission.locationRanks || [])) {
    // Need to match requestEventId → eventId; stored on lr.request_event_id
    // We'll index by request_event_id for now and resolve during save
    const k = `__re__${lr.request_event_id}__${lr.location}`;
    locationRanks.value[k] = lr.rank_order;
  }
};

// ── Hydrate location ranks from loaded form ───────────────────────────────────
const hydrateLocationRanks = () => {
  // Convert __re__ keyed ranks (by request_event_id) to eventId keyed ranks
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
    loadError.value = e?.response?.status === 404
      ? 'This availability form is not available.'
      : 'Failed to load the form. Please try again.';
  } finally {
    loading.value = false;
  }
};

// ── Build payload for save ────────────────────────────────────────────────────
const buildPayload = (isSubmit) => {
  const entries = Object.values(dateEntries.value).filter((e) => e.entryDate && e.companyEventId);

  const ranks = [];
  if (form.value?.events) {
    for (const ev of form.value.events) {
      for (const loc of (ev.locations_json || [])) {
        const r = locationRanks.value[rankKey(ev.company_event_id, loc)];
        if (r) {
          ranks.push({ requestEventId: ev.id, location: loc, rankOrder: r });
        }
      }
    }
  }

  return {
    isOnCall: myOnCall.value,
    generalNotes: myGeneralNotes.value.trim() || null,
    submit: isSubmit,
    dateEntries: entries.map((e) => ({
      companyEventId: e.companyEventId,
      sessionDateId: e.sessionDateId || null,
      entryDate: e.entryDate,
      availability: e.availability,
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
      ? 'Your availability has been submitted. Thank you!'
      : 'Draft saved.';
    if (isSubmit) {
      alreadySubmitted.value = true;
      setTimeout(() => router.push('/'), 2000);
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
.faf-root { max-width: 820px; margin: 0 auto; padding: 24px 16px 100px; }

.faf-loading, .faf-error-screen { text-align: center; padding: 60px 0; color: #64748b; }

.faf-submitted-banner { background: #dcfce7; border: 1px solid #86efac; color: #166534; border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; font-size: .9rem; }

.faf-header { margin-bottom: 24px; }
.faf-title { font-size: 1.6rem; font-weight: 700; color: #0f172a; margin: 0 0 6px; }
.faf-subtitle { font-size: 1rem; color: #475569; margin: 0 0 8px; }
.faf-desc { color: #64748b; font-size: .93rem; margin: 0 0 10px; white-space: pre-wrap; }
.faf-deadline { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 14px; font-size: .88rem; color: #92400e; display: inline-block; }

.faf-section { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; margin-bottom: 20px; }
.faf-section-head { font-size: 1rem; font-weight: 700; color: #0f172a; margin-bottom: 14px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }

/* On-call */
.faf-oncall-section { background: #f0f7ff; border-color: #bfdbfe; }
.faf-oncall-label { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; font-size: .95rem; color: #1e40af; }
.faf-oncall-hint { color: #475569; font-weight: 400; }

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

/* Date rows header */
.faf-dates-head { display: grid; grid-template-columns: 110px 1fr 1fr; gap: 8px; padding: 6px 10px; font-size: .78rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .04em; }
.faf-dates-avail-head { text-align: center; }
.faf-no-dates { color: #94a3b8; font-size: .88rem; padding: 12px 0; }

/* Date row */
.faf-date-row { display: grid; grid-template-columns: 110px 1fr 1fr; gap: 8px; padding: 10px 10px; border-top: 1px solid #f1f5f9; align-items: start; }
.faf-date-row--available { background: #f0fdf4; }
.faf-date-row--waitlist { background: #fffbeb; }
.faf-date-label { }
.faf-date-day { font-size: .85rem; font-weight: 700; color: #374151; }
.faf-date-full { font-size: .82rem; color: #64748b; }
.faf-date-time { font-size: .78rem; color: #94a3b8; margin-top: 2px; }

/* Availability toggle */
.faf-avail-toggle { display: flex; gap: 5px; flex-wrap: wrap; align-items: flex-start; }
.faf-avail-btn { border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; font-size: .8rem; font-weight: 600; cursor: pointer; background: #fff; color: #64748b; transition: all .12s; }
.faf-avail-btn--available.faf-avail-btn--active { background: #dcfce7; border-color: #22c55e; color: #166534; }
.faf-avail-btn--waitlist.faf-avail-btn--active { background: #fef9c3; border-color: #eab308; color: #854d0e; }
.faf-avail-btn--unavailable.faf-avail-btn--active { background: #f1f5f9; border-color: #94a3b8; color: #475569; }
.faf-avail-btn:hover:not(.faf-avail-btn--active) { background: #f8fafc; border-color: #94a3b8; }

/* Comment */
.faf-comment { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; font-size: .85rem; resize: vertical; box-sizing: border-box; }
.faf-comment:focus { outline: 2px solid #3b82f6; border-color: transparent; }

/* General notes */
.faf-input { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; font-size: .9rem; color: #0f172a; box-sizing: border-box; }
.faf-input:focus { outline: 2px solid #3b82f6; border-color: transparent; }

/* Sticky footer */
.faf-footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #e2e8f0; padding: 12px 24px; display: flex; justify-content: flex-end; align-items: center; gap: 12px; z-index: 100; box-shadow: 0 -4px 16px rgba(15,23,42,.07); }
.faf-footer-actions { display: flex; gap: 8px; }
.faf-save-msg { font-size: .88rem; color: #166534; }
.faf-save-msg--err { color: #dc2626; }

.btn { border: none; border-radius: 8px; padding: 9px 20px; font-size: .9rem; font-weight: 600; cursor: pointer; transition: opacity .15s; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-primary { background: #2563eb; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.btn-secondary { background: #f1f5f9; color: #374151; border: 1px solid #e2e8f0; }
.btn-secondary:hover:not(:disabled) { background: #e2e8f0; }

@media (max-width: 600px) {
  .faf-dates-head, .faf-date-row { grid-template-columns: 90px 1fr; }
  .faf-dates-avail-head, .faf-avail-toggle, .faf-comment-wrap { grid-column: 1 / -1; }
  .faf-comment-wrap { grid-column: 1 / -1; }
}
</style>
