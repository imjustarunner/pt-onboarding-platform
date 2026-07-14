<template>
  <div class="my-lbw">
    <div class="my-lbw__intro">
      <p>
        Take the Life Balance Wheel anytime to reflect on how life feels right now.
        Retake it periodically to see how your scores and priorities shift.
      </p>
      <button type="button" class="my-lbw__btn primary" :disabled="starting || !resolvedAgencyId" @click="startNew">
        {{ starting ? 'Starting…' : 'Start new assessment' }}
      </button>
    </div>

    <label v-if="agencyOptions.length > 1 || showAgencyPicker" class="my-lbw__org">
      Save under organization
      <select v-model.number="pickedAgencyId">
        <option :value="0" disabled>Select organization…</option>
        <option v-for="a in agencyOptions" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
    </label>

    <p v-if="!resolvedAgencyId" class="my-lbw__err">
      Choose an organization above (or select one from the header) so assessments save to your account.
    </p>
    <p v-if="error" class="my-lbw__err">{{ error }}</p>

    <div v-if="latestCompleted" class="my-lbw__snapshot">
      <h4>Latest completed</h4>
      <p class="my-lbw__meta">
        {{ formatWhen(latestCompleted.completedAt) }}
        <template v-if="latestCompleted.summary?.average != null">
          · Average {{ latestCompleted.summary.average }}
        </template>
      </p>
      <LifeBalanceWheel
        v-if="previewCategories.length"
        :categories="previewCategories"
        :interactive="false"
        compact
      />
      <button type="button" class="my-lbw__btn ghost" @click="openAssessment(latestCompleted)">View details</button>
    </div>

    <section class="my-lbw__history">
      <h4>Your history</h4>
      <p v-if="loading" class="my-lbw__muted">Loading…</p>
      <ul v-else class="my-lbw__list">
        <li v-for="a in assessments" :key="a.id" class="my-lbw__row">
          <div>
            <strong class="my-lbw__status" :data-status="a.status">{{ statusLabel(a.status) }}</strong>
            <div class="my-lbw__meta">
              Started {{ formatWhen(a.startedAt || a.createdAt) }}
              <template v-if="a.completedAt"> · Completed {{ formatWhen(a.completedAt) }}</template>
              <template v-if="a.summary?.average != null"> · Avg {{ a.summary.average }}</template>
            </div>
          </div>
          <button type="button" class="my-lbw__btn ghost" @click="openAssessment(a)">
            {{ a.status === 'completed' ? 'Open' : 'Continue' }}
          </button>
        </li>
        <li v-if="!assessments.length" class="my-lbw__muted">
          No assessments yet. Start one whenever you want a check-in.
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import LifeBalanceWheel from '../lifeBalance/LifeBalanceWheel.vue';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  userId: { type: [Number, String], default: null }
});

const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const loading = ref(false);
const starting = ref(false);
const error = ref('');
const assessments = ref([]);
const preview = ref(null);
const pickedAgencyId = ref(0);

function normalizeAgency(a) {
  if (!a) return null;
  const id = Number(a.id || a.agency_id || a.agencyId || 0);
  if (!id) return null;
  return {
    id,
    name: a.name || a.agency_name || a.agencyName || `Organization #${id}`,
    slug: String(a.portal_url || a.portalUrl || a.slug || '').trim()
  };
}

const agencyOptions = computed(() => {
  const map = new Map();
  const push = (list) => {
    for (const raw of list || []) {
      const a = normalizeAgency(raw);
      if (a) map.set(a.id, a);
    }
  };
  push(agencyStore.userAgencies);
  push(agencyStore.agencies);
  const userAgencies = authStore.user?.agencyIds || authStore.user?.agencies || [];
  push(Array.isArray(userAgencies) ? userAgencies : []);
  try {
    const stored = JSON.parse(localStorage.getItem('userAgencies') || '[]');
    push(stored);
  } catch {
    // ignore
  }
  return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
});

const showAgencyPicker = computed(() => !Number(props.agencyId || 0) && !Number(
  (agencyStore.currentAgency?.value ?? agencyStore.currentAgency)?.id || 0
));

const resolvedAgencyId = computed(() => {
  const fromProp = Number(props.agencyId || 0);
  if (fromProp) return fromProp;
  const current = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
  const fromCurrent = Number(current?.id || 0);
  if (fromCurrent) return fromCurrent;
  const picked = Number(pickedAgencyId.value || 0);
  if (picked) return picked;
  return Number(agencyOptions.value[0]?.id || 0) || 0;
});

const resolvedUserId = computed(() => {
  const fromProp = Number(props.userId || 0);
  if (fromProp) return fromProp;
  return Number(authStore.user?.id || 0) || 0;
});

const orgSlug = computed(() => {
  const current = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
  const fromCurrent = String(current?.portal_url || current?.portalUrl || current?.slug || '').trim();
  if (fromCurrent) return fromCurrent;
  const match = agencyOptions.value.find((a) => a.id === resolvedAgencyId.value);
  return match?.slug || '';
});

const latestCompleted = computed(
  () => assessments.value.find((a) => a.status === 'completed') || null
);

const previewCategories = computed(() => {
  const a = preview.value;
  if (!a?.template?.categories) return [];
  const map = Object.fromEntries((a.responses || []).map((r) => [r.categoryKey, r]));
  return a.template.categories.map((c) => ({
    key: c.key,
    label: c.label,
    shortLabel: c.shortLabel,
    color: c.color,
    score: map[c.key]?.score ?? null
  }));
});

function formatWhen(d) {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleString();
}

function statusLabel(status) {
  const s = String(status || '');
  if (s === 'completed') return 'Completed';
  if (s === 'in_progress') return 'In progress';
  if (s === 'not_started') return 'Not started';
  return s || 'Unknown';
}

function syncPickedAgency() {
  if (pickedAgencyId.value) return;
  const fromProp = Number(props.agencyId || 0);
  if (fromProp) {
    pickedAgencyId.value = fromProp;
    return;
  }
  const current = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
  const fromCurrent = Number(current?.id || 0);
  if (fromCurrent) {
    pickedAgencyId.value = fromCurrent;
    return;
  }
  if (agencyOptions.value[0]?.id) {
    pickedAgencyId.value = agencyOptions.value[0].id;
  }
}

async function load() {
  syncPickedAgency();
  const agencyId = resolvedAgencyId.value;
  const userId = resolvedUserId.value;
  if (!agencyId || !userId) {
    assessments.value = [];
    preview.value = null;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const quiet = { skipGlobalLoading: true };
    const res = await api.get(`/life-balance/subjects/users/${userId}/assessments`, {
      params: { agencyId },
      ...quiet
    });
    assessments.value = res.data?.assessments || [];
    const latest = assessments.value.find((a) => a.status === 'completed');
    if (latest?.id) {
      const full = await api.get(`/life-balance/assessments/${latest.id}`, quiet);
      preview.value = full.data?.assessment || null;
    } else {
      preview.value = null;
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not load assessments';
    assessments.value = [];
  } finally {
    loading.value = false;
  }
}

function assessmentPath(assessment) {
  const id = assessment?.id;
  const token = assessment?.accessToken;
  const slug = orgSlug.value;
  if (slug && id) return `/${slug}/life-balance/assessment/${id}`;
  if (id) return `/life-balance/assessment/${id}`;
  if (token) return `/lbw/${encodeURIComponent(token)}`;
  return null;
}

function openAssessment(assessment) {
  const path = assessmentPath(assessment);
  if (path) router.push(path);
}

async function startNew() {
  const agencyId = resolvedAgencyId.value;
  if (!agencyId) return;
  starting.value = true;
  error.value = '';
  try {
    const res = await api.post(
      '/life-balance/assessments',
      { agencyId, self: true },
      { skipGlobalLoading: true }
    );
    const a = res.data?.assessment;
    if (a) {
      openAssessment(a);
      await load();
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not start assessment';
  } finally {
    starting.value = false;
  }
}

onMounted(async () => {
  if (!agencyOptions.value.length && typeof agencyStore.fetchUserAgencies === 'function') {
    try {
      await agencyStore.fetchUserAgencies();
    } catch {
      // ignore
    }
  }
  await load();
});
watch([() => props.agencyId, () => agencyStore.currentAgency, pickedAgencyId, () => agencyOptions.value.length], load);
</script>

<style scoped>
.my-lbw {
  display: grid;
  gap: 1.25rem;
}
.my-lbw__intro {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  justify-content: space-between;
  align-items: flex-start;
}
.my-lbw__intro p {
  margin: 0;
  max-width: 42rem;
  color: #4b5563;
  line-height: 1.5;
  font-size: 0.95rem;
}
.my-lbw__org {
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 650;
  max-width: 28rem;
}
.my-lbw__org select {
  font-weight: 400;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
}
.my-lbw__btn {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 10px;
  padding: 0.55rem 0.9rem;
  font-weight: 650;
  cursor: pointer;
  font-size: 0.9rem;
}
.my-lbw__btn.primary {
  background: #166534;
  border-color: #166534;
  color: #fff;
}
.my-lbw__btn.ghost {
  background: transparent;
}
.my-lbw__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.my-lbw__err {
  margin: 0;
  color: #991b1b;
  font-size: 0.9rem;
}
.my-lbw__muted {
  color: #6b7280;
  font-size: 0.9rem;
}
.my-lbw__snapshot,
.my-lbw__history {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem 1.1rem;
  background: #fff;
}
.my-lbw__snapshot h4,
.my-lbw__history h4 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}
.my-lbw__meta {
  font-size: 0.82rem;
  color: #6b7280;
  margin: 0.15rem 0 0.75rem;
}
.my-lbw__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.my-lbw__row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.65rem 0.75rem;
  border: 1px solid #f3f4f6;
  border-radius: 10px;
  background: #f9fafb;
}
.my-lbw__status[data-status='completed'] {
  color: #166534;
}
.my-lbw__status[data-status='in_progress'],
.my-lbw__status[data-status='not_started'] {
  color: #b45309;
}
</style>
