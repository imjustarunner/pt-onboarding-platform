<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';

const route = useRoute();
const queue = ref([]);
const loading = ref(false);
const step = ref(1);
const saving = ref(false);
const err = ref('');

const current = computed(() => queue.value[0] || null);

const impression = ref('');
const rating = ref(4);
const prediction6m = ref('');
const prediction12m = ref('');

const visible = computed(() => !!current.value);

function syncStepFromQueue() {
  err.value = '';
  const cur = queue.value[0];
  if (!cur) {
    step.value = 1;
    impression.value = '';
    rating.value = 4;
    prediction6m.value = '';
    prediction12m.value = '';
    return;
  }
  const att = String(cur.splash_attendance || 'pending').toLowerCase();
  if (att === 'attended') {
    const p12 = String(cur.prediction_12m || '').trim();
    if (!p12) {
      step.value = 2;
      impression.value = String(cur.impression || '');
      rating.value = Number(cur.rating) || 4;
      prediction6m.value = String(cur.prediction_6m || '');
      prediction12m.value = String(cur.prediction_12m || '');
      return;
    }
  }
  step.value = 1;
  impression.value = '';
  rating.value = 4;
  prediction6m.value = '';
  prediction12m.value = '';
}

async function loadQueue() {
  loading.value = true;
  err.value = '';
  try {
    const r = await api.get('/hiring/me/pending-interview-splashes');
    queue.value = Array.isArray(r.data) ? r.data : [];
    syncStepFromQueue();
  } catch {
    queue.value = [];
  } finally {
    loading.value = false;
  }
}

async function submitAttendance(attended) {
  if (!current.value) return;
  saving.value = true;
  err.value = '';
  try {
    await api.post('/hiring/me/interview-splash', {
      hiringProfileId: current.value.hiring_profile_id,
      attended
    });
    if (!attended) {
      await loadQueue();
      return;
    }
    step.value = 2;
  } catch (e) {
    err.value = e.response?.data?.error?.message || e.message || 'Could not save';
  } finally {
    saving.value = false;
  }
}

async function submitCapsule() {
  if (!current.value) return;
  saving.value = true;
  err.value = '';
  try {
    await api.post('/hiring/me/interview-splash', {
      hiringProfileId: current.value.hiring_profile_id,
      attended: true,
      impression: impression.value.trim(),
      rating: Number(rating.value),
      prediction6m: prediction6m.value.trim(),
      prediction12m: prediction12m.value.trim()
    });
    await loadQueue();
  } catch (e) {
    err.value = e.response?.data?.error?.message || e.message || 'Could not save';
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadQueue();
});

watch(
  () => route.fullPath,
  () => {
    loadQueue();
  }
);
</script>

<template>
  <div
    v-if="visible"
    class="ics-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="ics-title"
  >
    <div class="ics-card">
      <h2 id="ics-title" class="ics-title">Interview follow-up</h2>
      <p class="ics-sub">
        {{ current.candidate_first_name }} {{ current.candidate_last_name }}
      </p>
      <p class="ics-muted">
        The scheduled interview time has passed. Complete this short follow-up before continuing.
      </p>

      <div v-if="err" class="ics-error">{{ err }}</div>

      <template v-if="step === 1">
        <p class="ics-q">Did you attend this interview?</p>
        <div class="ics-actions">
          <button type="button" class="btn btn-primary" :disabled="saving" @click="submitAttendance(true)">
            {{ saving ? 'Saving…' : 'Yes, I attended' }}
          </button>
          <button type="button" class="btn btn-secondary" :disabled="saving" @click="submitAttendance(false)">
            Did not attend
          </button>
        </div>
      </template>

      <template v-else>
        <label class="ics-label">Your impression</label>
        <textarea v-model="impression" class="textarea" rows="3" placeholder="Brief impression of the candidate…" />

        <label class="ics-label">Rating (1–5)</label>
        <select v-model.number="rating" class="input">
          <option v-for="n in 5" :key="n" :value="n">{{ n }}</option>
        </select>

        <label class="ics-label">6-month prediction (sealed until then)</label>
        <textarea v-model="prediction6m" class="textarea" rows="2" placeholder="Where do you see this candidate in 6 months?" />

        <label class="ics-label">12-month prediction (sealed until then)</label>
        <textarea v-model="prediction12m" class="textarea" rows="2" placeholder="Where do you see this candidate in 12 months?" />

        <div class="ics-actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="saving || !impression.trim() || !prediction6m.trim() || !prediction12m.trim()"
            @click="submitCapsule"
          >
            {{ saving ? 'Submitting…' : 'Submit and continue' }}
          </button>
        </div>
      </template>

      <p v-if="loading" class="ics-muted ics-foot">Checking for more…</p>
    </div>
  </div>
</template>

<style scoped>
.ics-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.ics-card {
  width: 520px;
  max-width: 100%;
  background: #fff;
  border-radius: 16px;
  padding: 22px 22px 18px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
  border: 1px solid #e5e7eb;
}
.ics-title {
  margin: 0 0 6px;
  font-size: 1.25rem;
}
.ics-sub {
  margin: 0 0 8px;
  font-weight: 600;
  color: #111827;
}
.ics-muted {
  margin: 0 0 12px;
  font-size: 13px;
  color: #6b7280;
}
.ics-foot {
  margin-top: 10px;
  margin-bottom: 0;
}
.ics-q {
  margin: 12px 0 10px;
  font-weight: 600;
}
.ics-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}
.ics-label {
  display: block;
  margin: 10px 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.textarea,
.input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 14px;
}
.textarea {
  resize: vertical;
  min-height: 64px;
}
.ics-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 8px;
}
.btn {
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid transparent;
}
.btn-primary {
  background: #111827;
  color: #fff;
  border-color: #111827;
}
.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn-secondary {
  background: #f3f4f6;
  color: #111827;
  border-color: #e5e7eb;
}
</style>
