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
            <span><strong>On-Call Only</strong> — you're available to step in before report time if needed.</span>
          </div>
          <div class="faf-howto-item">
            <span class="faf-howto-icon faf-howto-unavail">●</span>
            <span><strong>Not Available</strong> — you cannot make this date.</span>
          </div>
        </div>
      </div>

      <!-- ── Location preference ranking ───────────────────────── -->
      <div v-if="locationRankingItems.length > 1" class="faf-section">
        <div class="faf-section-head">
          Preferred Locations
        </div>
        <p class="faf-loc-intro">
          Rank the locations you prefer. Each date below shows which locations and sessions are available that day.
        </p>
        <div class="faf-loc-rank-list">
          <div
            v-for="item in locationRankingItems"
            :key="item.key"
            class="faf-loc-rank-row"
          >
            <select
              class="faf-rank-select"
              :value="locationRanks[item.key] || ''"
              @change="locationRanks[item.key] = $event.target.value ? Number($event.target.value) : null"
            >
              <option value="">—</option>
              <option v-for="n in locationRankingItems.length" :key="n" :value="n">{{ n }}</option>
            </select>
            <span class="faf-loc-name">{{ item.label }}</span>
          </div>
        </div>
      </div>

      <!-- ── Unified date list ───────────────────────────────────── -->
      <div class="faf-section">
        <div class="faf-section-head">
          Your Availability
          <span v-if="formDateRange" class="faf-section-range">{{ formDateRange }}</span>
        </div>
        <div v-if="!allDates.length" class="faf-no-dates">No session dates configured.</div>
        <div v-else class="faf-dates-list">
          <div
            v-for="ud in allDates"
            :key="ud.date"
            class="faf-date-card"
            :class="`faf-date-card--${getDatePref(ud.date)}`"
          >
            <div class="faf-date-top">
              <div class="faf-date-label">
                <span class="faf-date-dow">{{ fmtDayOfWeek(ud.date) }}</span>
                <span class="faf-date-full">{{ fmtDate(ud.date) }}</span>
                <span v-if="ud.staffWindow" class="faf-date-time">{{ ud.staffWindow }}</span>
              </div>
              <div
                class="faf-slot-badge"
                :class="ud.demandLevel === 'high' ? 'faf-slot-badge--high' : 'faf-slot-badge--standard'"
              >
                {{ ud.demandLabel }} · {{ ud.effective }} workers needed
              </div>
            </div>

            <div v-if="ud.sessionLabels.length || ud.locations.length" class="faf-date-context">
              <div v-if="ud.sessionLabels.length" class="faf-date-context-row">
                <span class="faf-date-context-label">Session</span>
                <span class="faf-chip" v-for="label in ud.sessionLabels" :key="`session-${ud.date}-${label}`">{{ label }}</span>
              </div>
              <div v-if="ud.locations.length" class="faf-date-context-row">
                <span class="faf-date-context-label">Locations</span>
                <span class="faf-chip" v-for="loc in ud.locations" :key="`loc-${ud.date}-${loc}`">{{ loc }}</span>
              </div>
            </div>

            <!-- Primary preference -->
            <div class="faf-pref-row">
              <button
                v-for="opt in PREF_OPTIONS"
                :key="opt.value"
                type="button"
                class="faf-pref-btn"
                :class="[
                  `faf-pref-btn--${opt.value}`,
                  { 'faf-pref-btn--active': getDatePref(ud.date) === opt.value },
                ]"
                @click="setDatePref(ud.date, opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>

            <!-- Secondary willingness -->
            <div
              v-if="['slot', 'waitlist'].includes(getDatePref(ud.date))"
              class="faf-secondary-opts"
            >
              <label v-if="getDatePref(ud.date) === 'slot'" class="faf-check-label">
                <input
                  type="checkbox"
                  :checked="getDateWaitlistWilling(ud.date)"
                  @change="setDateWaitlistWilling(ud.date, $event.target.checked)"
                />
                <span>Also willing to waitlist if I'm not selected</span>
              </label>
              <label class="faf-check-label">
                <input
                  type="checkbox"
                  :checked="getDateOncallWilling(ud.date)"
                  @change="setDateOncallWilling(ud.date, $event.target.checked)"
                />
                <span>Also willing to be on-call before report time</span>
              </label>
            </div>

            <!-- Comment -->
            <div class="faf-comment-wrap">
              <textarea
                class="faf-comment"
                rows="2"
                placeholder="Notes for this day… (optional)"
                :value="getDateComment(ud.date)"
                @input="setDateComment(ud.date, $event.target.value)"
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
import { ref, computed, onMounted } from 'vue';
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

// dateEntries keyed by date string (YYYY-MM-DD) — one entry per date regardless of location.
// When saving we fan this out to all events that have that date.
const dateEntries = ref({});

// locationRanks keyed by a stable string per location item
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
  if (typeof d === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(d)) {
    const [hRaw, mRaw] = d.split(':');
    const h = Number(hRaw);
    const m = Number(mRaw);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${String(m).padStart(2, '0')} ${suffix}`;
  }
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const dateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return String(value).slice(0, 10);
};

const displayLocation = (ev, sd) => {
  return String(
    sd.location_label ||
    ev.event_title ||
    (ev.locations_json && ev.locations_json[0]) ||
    ''
  ).trim();
};

const displaySessionLabel = (ev) => {
  return String(ev.public_session_label || ev.publicSessionLabel || '').trim();
};

const staffWindowFor = (ev, sd) => {
  const start = ev.employee_report_time || ev.employeeReportTime || sd.starts_at || null;
  const end = ev.employee_departure_time || ev.employeeDepartureTime || sd.ends_at || null;
  if (start && end) return `${fmtTime(start)} - ${fmtTime(end)}`;
  if (start) return fmtTime(start);
  return '';
};

const addUnique = (arr, value) => {
  const v = String(value || '').trim();
  if (v && !arr.includes(v)) arr.push(v);
};

// ── Unified date list ─────────────────────────────────────────────────────────
// Aggregate all session dates across all events so each calendar date appears once.
// Slot counts are summed across every event that runs on that date.
const allDates = computed(() => {
  const map = new Map();
  for (const ev of form.value?.events || []) {
    for (const sd of ev.session_dates || []) {
      const d = dateKey(sd.session_date);
      if (!d) continue;
      if (!map.has(d)) {
        map.set(d, {
          date: d,
          effective: 0,
          filled: 0,
          locations: [],
          sessionLabels: [],
          staffWindows: []
        });
      }
      const entry = map.get(d);
      entry.effective += Number(sd.effectiveSlots) || 2;
      entry.filled   += Number(sd.filledSlots)    || 0;
      addUnique(entry.locations, displayLocation(ev, sd));
      addUnique(entry.sessionLabels, displaySessionLabel(ev));
      addUnique(entry.staffWindows, staffWindowFor(ev, sd));
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      ...v,
      openSlots: Math.max(0, v.effective - v.filled),
      staffWindow: v.staffWindows.length === 1 ? v.staffWindows[0] : (v.staffWindows.length > 1 ? 'Multiple staff windows' : ''),
      demandLevel: v.effective >= 12 ? 'high' : 'standard',
      demandLabel: v.effective >= 12 ? 'High staffing need' : 'Standard staffing need'
    }));
});

const formDateRange = computed(() => {
  if (!allDates.value.length) return '';
  const first = allDates.value[0].date;
  const last  = allDates.value[allDates.value.length - 1].date;
  return first === last ? fmtDate(first) : `${fmtDate(first)} – ${fmtDate(last)}`;
});

// ── Location ranking items ────────────────────────────────────────────────────
// Build a flat list of locations to rank:
//  • If there are multiple events, each event is its own location (ranked by session-date location label/title).
//  • If there's only one event but it has multiple locations_json entries, rank those.
const locationRankingItems = computed(() => {
  const events = form.value?.events || [];
  if (events.length > 1) {
    return events.map((ev) => ({
      key: `ev__${ev.id}`,
      label: eventLocationLabel(ev),
      requestEventId: ev.id,
      location: eventLocationLabel(ev)
    }));
  }
  if (events.length === 1) {
    const locs = events[0].locations_json || [];
    if (locs.length > 1) {
      return locs.map((loc, i) => ({
        key: `loc__${events[0].id}__${i}`,
        label: loc,
        requestEventId: events[0].id,
        location: loc
      }));
    }
  }
  return [];
});

const eventLocationLabel = (ev) => {
  const firstDate = Array.isArray(ev.session_dates) ? ev.session_dates[0] : null;
  return String(firstDate?.location_label || ev.event_title || `Location ${ev.id}`).trim();
};

// ── Per-date accessors ────────────────────────────────────────────────────────
const ensureDateEntry = (date) => {
  if (!dateEntries.value[date]) {
    dateEntries.value[date] = { preference: 'unavailable', waitlistWilling: false, oncallWilling: false, comment: '' };
  }
  return dateEntries.value[date];
};

const getDatePref         = (date) => dateEntries.value[date]?.preference || 'unavailable';
const getDateWaitlistWilling = (date) => !!dateEntries.value[date]?.waitlistWilling;
const getDateOncallWilling   = (date) => !!dateEntries.value[date]?.oncallWilling;
const getDateComment         = (date) => dateEntries.value[date]?.comment || '';

const setDatePref = (date, value) => {
  const e = ensureDateEntry(date);
  e.preference = value;
  if (value === 'oncall' || value === 'unavailable') { e.waitlistWilling = false; e.oncallWilling = false; }
  if (value === 'waitlist') e.waitlistWilling = false;
};
const setDateWaitlistWilling = (date, val) => { ensureDateEntry(date).waitlistWilling = val; };
const setDateOncallWilling   = (date, val) => { ensureDateEntry(date).oncallWilling = val; };
const setDateComment         = (date, val) => { ensureDateEntry(date).comment = val; };

// ── Hydrate existing submission ───────────────────────────────────────────────
const hydrateSubmission = (submission) => {
  if (!submission) return;
  myGeneralNotes.value = submission.general_notes || '';
  alreadySubmitted.value = !!submission.submitted_at;

  // Collapse per-event date entries to per-date (take first non-unavailable, else first)
  const byDate = {};
  for (const de of (submission.dateEntries || [])) {
    const d = dateKey(de.entry_date);
    if (!d) continue;
    const rawAvail = de.availability || 'unavailable';
    const pref = rawAvail === 'available' ? 'slot' : rawAvail;
    if (!byDate[d] || pref !== 'unavailable') {
      byDate[d] = {
        preference: pref,
        waitlistWilling: !!de.waitlist_willing,
        oncallWilling: !!de.oncall_willing,
        comment: de.comment || ''
      };
    }
  }
  dateEntries.value = byDate;

  // Hydrate location ranks
  for (const lr of (submission.locationRanks || [])) {
    // Try to match against locationRankingItems after form is set
    // Store by requestEventId + location for later remapping
    locationRanks.value[`__pending__${lr.request_event_id}__${lr.location}`] = lr.rank_order;
  }
};

const resolveLocationRanks = () => {
  const items = locationRankingItems.value;
  if (!items.length) return;
  const resolved = {};
  for (const [k, v] of Object.entries(locationRanks.value)) {
    if (k.startsWith('__pending__')) {
      const parts = k.split('__');
      const reId = Number(parts[2]);
      const loc = parts.slice(3).join('__');
      const match = items.find((i) => i.requestEventId === reId && i.location === loc);
      if (match) resolved[match.key] = v;
    } else {
      resolved[k] = v;
    }
  }
  locationRanks.value = resolved;
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
      resolveLocationRanks();
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
// Fan each per-date entry out to every event (location) that runs on that date.
const buildPayload = (isSubmit) => {
  const entries = [];
  for (const ev of form.value?.events || []) {
    for (const sd of ev.session_dates || []) {
      const d = dateKey(sd.session_date);
      const entry = dateEntries.value[d];
      if (!entry) continue;
      entries.push({
        ...(ev.program_id ? { programId: ev.program_id } : { companyEventId: ev.company_event_id }),
        sessionDateId: sd.id || null,
        entryDate: d,
        availability: entry.preference,
        waitlistWilling: !!entry.waitlistWilling,
        oncallWilling: !!entry.oncallWilling,
        comment: entry.comment?.trim() || null
      });
    }
  }

  const ranks = locationRankingItems.value
    .map((item) => {
      const r = locationRanks.value[item.key];
      return r ? { requestEventId: item.requestEventId, location: item.location, rankOrder: Number(r) } : null;
    })
    .filter(Boolean);

  return {
    generalNotes: myGeneralNotes.value.trim() || null,
    submit: isSubmit,
    dateEntries: entries,
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
.faf-section-head {
  font-size: 1rem; font-weight: 700; color: #0f172a; margin-bottom: 14px;
  border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
}
.faf-section-range { font-size: .82rem; font-weight: 400; color: #64748b; }
.faf-opt { font-size: .82rem; font-weight: 400; color: #94a3b8; }

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

.faf-date-context {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: rgba(255,255,255,.65);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.faf-date-context-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.faf-date-context-label {
  min-width: 70px;
  font-size: .75rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: .04em;
}
.faf-chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 3px 9px;
  font-size: .78rem;
  font-weight: 600;
  color: #334155;
}

/* Slot badge */
.faf-slot-badge {
  font-size: .75rem; font-weight: 700; border-radius: 999px;
  padding: 4px 12px; white-space: nowrap;
}
.faf-slot-badge--open { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
.faf-slot-badge--full { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
.faf-slot-badge--standard { background: #e0f2fe; color: #075985; border: 1px solid #7dd3fc; }
.faf-slot-badge--high { background: #fef3c7; color: #92400e; border: 1px solid #fbbf24; }

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

/* Location ranking */
.faf-loc-intro { font-size: .88rem; color: #475569; margin: 0 0 14px; }
.faf-loc-rank-list { display: grid; gap: 10px; }
.faf-loc-rank-row { display: flex; align-items: center; gap: 12px; }
.faf-rank-select { width: 68px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; font-size: .9rem; }
.faf-loc-name { color: #0f172a; font-size: .93rem; font-weight: 500; }

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
