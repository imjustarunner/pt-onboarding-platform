<template>
  <aside class="pyu-needs">
    <header class="pyu-needs__head">
      <h2>School Needs</h2>
      <p class="muted">
        Open placements looking for an additional provider. Request a school below — round-trip distance from your home is shown for each.
      </p>
    </header>

    <div v-if="!canApply" class="pyu-needs__empty">
      <p class="muted">Sign in to your provider account to view open school placements and request one.</p>
    </div>
    <div v-else-if="loading" class="muted pyu-needs__state">Loading school needs…</div>
    <div v-else-if="error" class="error-banner">{{ error }}</div>
    <div v-else-if="!needs.length" class="pyu-needs__empty">
      <p class="muted">No open school placements posted right now.</p>
    </div>

    <ul v-else class="pyu-needs__list">
      <li v-for="need in needs" :key="need.id" class="pyu-needs__card">
        <div class="pyu-needs__card-top">
          <img
            v-if="schoolLogo(need)"
            :src="schoolLogo(need)"
            :alt="need.school?.schoolName || 'School'"
            class="pyu-needs__logo"
          />
          <div class="pyu-needs__card-title">
            <strong>{{ need.school?.schoolName || 'School' }}</strong>
            <span v-if="need.title" class="pyu-needs__subtitle">{{ need.title }}</span>
            <span class="pyu-needs__miles" :class="{ 'is-missing': need.homeSchoolRoundtripMiles == null }">
              {{ milesLabel(need.homeSchoolRoundtripMiles) }}
            </span>
          </div>
        </div>

        <p v-if="need.body" class="pyu-needs__body">{{ need.body }}</p>

        <div class="pyu-needs__meta">
          <span v-if="need.days?.length" class="pill pill--day">
            Need {{ need.days.join(' · ') }}
          </span>
          <span v-else class="pill">Preferred day needed</span>
          <span class="pill pill--slots">{{ need.slotsNeeded }} slot{{ need.slotsNeeded === 1 ? '' : 's' }}</span>
          <span v-if="need.status !== 'open'" class="pill">{{ need.status }}</span>
        </div>

        <div v-if="need.myApplication && need.myApplication.status !== 'withdrawn'" class="pyu-needs__applied">
          <p>
            <strong>{{ statusLabel(need.myApplication.status) }}</strong>
            <span v-if="need.myApplication.preferredDay"> · {{ need.myApplication.preferredDay }}</span>
          </p>
          <button
            v-if="need.myApplication.status === 'pending' && canApply"
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="busyId === need.id"
            @click="withdraw(need)"
          >
            {{ busyId === need.id ? '…' : 'Withdraw' }}
          </button>
        </div>

        <div v-else-if="need.status === 'open'" class="pyu-needs__apply">
          <p v-if="!canApply" class="muted tiny">Sign in to your account to request this placement.</p>
          <template v-else>
            <label class="lbl">
              {{ need.days?.length ? 'Which posted day can you work?' : 'Preferred day' }}
            </label>
            <select v-model="drafts[need.id].preferredDay" class="select">
              <option disabled value="">Select day…</option>
              <option v-for="d in dayOptions(need)" :key="d" :value="d">{{ d }}</option>
            </select>
            <label class="lbl">Notes (optional)</label>
            <textarea
              v-model="drafts[need.id].notes"
              class="textarea"
              rows="2"
              maxlength="500"
              placeholder="Anything we should know…"
            />
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="busyId === need.id || !drafts[need.id].preferredDay"
              @click="apply(need)"
            >
              {{ busyId === need.id ? 'Submitting…' : 'Request this school' }}
            </button>
          </template>
        </div>
      </li>
    </ul>
  </aside>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { logoSrc } from '../../utils/schoolReinit';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  schoolYear: { type: String, required: true },
  canApply: { type: Boolean, default: true },
});

const loading = ref(false);
const error = ref('');
const needs = ref([]);
const busyId = ref(0);
const drafts = reactive({});

function ensureDraft(id) {
  if (!drafts[id]) {
    drafts[id] = { preferredDay: '', notes: '' };
  }
}

function schoolLogo(need) {
  return logoSrc(need?.school || {}, { allowIcon: true });
}

function milesLabel(miles) {
  if (miles == null || !Number.isFinite(Number(miles))) {
    return 'Distance unavailable — add your home address in My Account';
  }
  return `${Number(miles).toFixed(1)} mi round trip from home`;
}

function dayOptions(need) {
  if (need?.days?.length) return need.days;
  return WEEKDAYS;
}

function statusLabel(status) {
  if (status === 'approved') return 'Approved';
  if (status === 'denied') return 'Not selected';
  if (status === 'pending') return 'Request submitted';
  return status;
}

async function load() {
  const agencyId = Number(props.agencyId);
  const schoolYear = String(props.schoolYear || '').trim();
  if (!agencyId || !schoolYear || !props.canApply) {
    needs.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/provider-year-update/me/school-needs', {
      params: { agencyId, schoolYear },
      skipGlobalLoading: true,
    });
    const list = res.data?.needs || [];
    needs.value = list;
    for (const n of list) {
      ensureDraft(n.id);
      if (n.days?.length === 1 && !drafts[n.id].preferredDay) {
        drafts[n.id].preferredDay = n.days[0];
      }
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to load school needs';
  } finally {
    loading.value = false;
  }
}

async function apply(need) {
  ensureDraft(need.id);
  const preferredDay = drafts[need.id].preferredDay;
  if (!preferredDay) return;
  busyId.value = need.id;
  error.value = '';
  try {
    const res = await api.post(`/provider-year-update/me/school-needs/${need.id}/apply`, {
      agencyId: Number(props.agencyId),
      preferredDay,
      notes: drafts[need.id].notes,
    });
    const updated = res.data?.need;
    if (updated) {
      needs.value = needs.value.map((n) => (n.id === need.id ? updated : n));
    } else {
      await load();
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not submit request';
  } finally {
    busyId.value = 0;
  }
}

async function withdraw(need) {
  busyId.value = need.id;
  error.value = '';
  try {
    await api.delete(`/provider-year-update/me/school-needs/${need.id}/apply`, {
      params: { agencyId: Number(props.agencyId) },
    });
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not withdraw';
  } finally {
    busyId.value = 0;
  }
}

watch(
  () => [props.agencyId, props.schoolYear, props.canApply],
  () => load(),
  { immediate: true }
);
</script>

<style scoped>
.pyu-needs {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px;
  position: sticky;
  top: 12px;
  max-height: calc(100vh - 24px);
  overflow: auto;
}
.pyu-needs__head h2 {
  margin: 0 0 6px;
  font-size: 1.1rem;
  color: var(--pyu-primary, #0c4a6e);
}
.pyu-needs__head p {
  margin: 0 0 14px;
  font-size: 0.82rem;
  line-height: 1.4;
}
.pyu-needs__state,
.pyu-needs__empty {
  padding: 8px 0 4px;
}
.pyu-needs__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pyu-needs__card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: #f8fafc;
}
.pyu-needs__card-top {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.pyu-needs__logo {
  width: 44px;
  height: 44px;
  object-fit: contain;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.pyu-needs__card-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pyu-needs__card-title strong {
  font-size: 0.95rem;
  color: #0f172a;
}
.pyu-needs__subtitle {
  font-size: 0.8rem;
  color: #475569;
}
.pyu-needs__miles {
  font-size: 0.75rem;
  font-weight: 600;
  color: #166534;
}
.pyu-needs__miles.is-missing {
  color: #b45309;
  font-weight: 500;
}
.pyu-needs__body {
  margin: 8px 0 0;
  font-size: 0.82rem;
  color: #334155;
  line-height: 1.4;
}
.pyu-needs__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.pill {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
}
.pill--day {
  background: #dbeafe;
  color: #1e40af;
}
.pill--slots {
  background: #fef3c7;
  color: #92400e;
}
.pyu-needs__apply,
.pyu-needs__applied {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pyu-needs__applied p {
  margin: 0;
  font-size: 0.82rem;
}
.lbl {
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
}
.select,
.textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  font: inherit;
  background: #fff;
  box-sizing: border-box;
}
.error-banner {
  background: #fee2e2;
  color: #991b1b;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 0.82rem;
  margin-bottom: 10px;
}
.muted { color: #64748b; }
.tiny { font-size: 0.78rem; }
</style>
