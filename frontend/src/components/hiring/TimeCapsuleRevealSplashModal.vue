<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import TimeCapsuleHeroStage from './TimeCapsuleHeroStage.vue';

const route = useRoute();
const queue = ref([]);
const loading = ref(false);
const err = ref('');
const openedPredictions = ref([]);
const opening = ref(false);
const saving = ref(false);
const heroRef = ref(null);

const current = computed(() => queue.value[0] || null);
const visible = computed(() => !!current.value);
const revealed = computed(() => openedPredictions.value.length > 0);

const horizonLabel = (m) => {
  const n = Number(m);
  if (n === 12) return '12-month';
  if (n === 6) return '6-month';
  return `${n}-month`;
};

const candidateName = (row) =>
  `${String(row?.candidate_first_name || '').trim()} ${String(row?.candidate_last_name || '').trim()}`.trim() || 'Applicant';

const SNOOZE_DEFAULT_DAYS = 3;

async function loadQueue() {
  loading.value = true;
  err.value = '';
  openedPredictions.value = [];
  try {
    const ir = await api.get('/hiring/me/pending-interview-splashes');
    if (Array.isArray(ir.data) && ir.data.length > 0) {
      queue.value = [];
      return;
    }
    const r = await api.get('/hiring/me/pending-time-capsule-reveals');
    queue.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    queue.value = [];
  } finally {
    loading.value = false;
  }
}

async function onRevealClick() {
  if (!current.value || opening.value || saving.value) return;
  opening.value = true;
  err.value = '';
  try {
    await heroRef.value?.playOpeningIntroForced?.();
    const r = await api.post(`/hiring/me/time-capsule-reveals/${current.value.id}/open`);
    const list = Array.isArray(r.data?.predictions) ? r.data.predictions : [];
    if (list.length) {
      openedPredictions.value = list.map((p) => ({
        authorUserId: p.authorUserId,
        authorFirstName: String(p.authorFirstName || '').trim(),
        authorLastName: String(p.authorLastName || '').trim(),
        bodyText: String(p.bodyText || '').trim()
      }));
    } else {
      const single = String(r.data?.bodyText || '').trim();
      openedPredictions.value = single
        ? [
            {
              authorUserId: current.value?.author_user_id ?? null,
              authorFirstName: 'You',
              authorLastName: '',
              bodyText: single
            }
          ]
        : [];
    }
  } catch (e) {
    err.value = e.response?.data?.error?.message || e.message || 'Could not open capsule';
  } finally {
    opening.value = false;
  }
}

function snoozeWithReburyVideo() {
  if (!current.value || opening.value || saving.value) return;
  saving.value = true;
  err.value = '';
  const runSnooze = async () => {
    try {
      await api.post(`/hiring/me/time-capsule-reveals/${current.value.id}/snooze`, { days: SNOOZE_DEFAULT_DAYS });
      await loadQueue();
    } catch (e) {
      err.value = e.response?.data?.error?.message || e.message || 'Could not snooze';
    } finally {
      saving.value = false;
    }
  };
  heroRef.value?.playClosingThen(runSnooze);
}

async function acknowledge() {
  if (!current.value) return;
  saving.value = true;
  err.value = '';
  try {
    await api.post(`/hiring/me/time-capsule-reveals/${current.value.id}/acknowledge`);
    await loadQueue();
  } catch (e) {
    err.value = e.response?.data?.error?.message || e.message || 'Could not save';
  } finally {
    saving.value = false;
  }
}

watch(
  () => current.value?.id,
  () => {
    openedPredictions.value = [];
    err.value = '';
  }
);

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
    class="tcr-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="tcr-title"
  >
    <div class="tcr-card">
      <h2 id="tcr-title" class="tcr-sr-only">Time capsule</h2>

      <TimeCapsuleHeroStage
        :key="current.id"
        ref="heroRef"
        class="tcr-hero"
        :person-name="candidateName(current)"
        :anchor-at="current.anchor_at"
        :reveal-at="current.reveal_at"
        :actions-disabled="opening || saving"
        @reveal-now="onRevealClick"
        @reveal-later="snoozeWithReburyVideo"
      />

      <p class="tcr-sub">
        <template v-if="!revealed">
          Sealed <strong>{{ horizonLabel(current.horizon_months) }}</strong> predictions — use
          <strong>Reveal now</strong> or <strong>Reveal later</strong> on the image, then the opening clip runs if you
          reveal.
        </template>
        <template v-else>
          Every interviewer’s sealed <strong>{{ horizonLabel(current.horizon_months) }}</strong> prediction for this
          applicant.
        </template>
      </p>

      <div v-if="err" class="tcr-error">{{ err }}</div>

      <template v-if="!revealed">
        <p v-if="opening" class="tcr-muted tcr-hint">Opening capsule…</p>
        <p v-else-if="saving" class="tcr-muted tcr-hint">Reburying capsule…</p>
        <p v-else class="tcr-muted tcr-hint">
          Reveal later waits {{ SNOOZE_DEFAULT_DAYS }} days, then this splash returns.
        </p>
      </template>

      <template v-else>
        <div class="tcr-predictions">
          <div v-for="(p, idx) in openedPredictions" :key="`${p.authorUserId ?? idx}-${idx}`" class="tcr-pred-block">
            <div class="tcr-pred-author">
              {{ [p.authorFirstName, p.authorLastName].filter(Boolean).join(' ').trim() || 'Interviewer' }}
            </div>
            <pre class="tcr-pre">{{ p.bodyText }}</pre>
          </div>
        </div>
        <div class="tcr-actions">
          <button type="button" class="btn btn-primary" :disabled="saving" @click="acknowledge">
            {{ saving ? 'Saving…' : 'Done' }}
          </button>
        </div>
      </template>

      <p v-if="loading" class="tcr-muted tcr-foot">Checking…</p>
    </div>
  </div>
</template>

<style scoped>
.tcr-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.tcr-overlay {
  position: fixed;
  inset: 0;
  z-index: 12001;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.tcr-card {
  width: min(520px, 100%);
  max-height: min(92vh, 900px);
  overflow: auto;
  background: #fff;
  border-radius: 16px;
  padding: 18px 18px 16px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
  border: 1px solid #e5e7eb;
}
.tcr-hero {
  margin-bottom: 12px;
}
.tcr-sub {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.45;
  color: #334155;
  text-align: center;
}
.tcr-muted {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.tcr-hint {
  margin-top: 8px;
  text-align: center;
}
.tcr-foot {
  margin-top: 10px;
  text-align: center;
}
.tcr-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  margin: 10px 0;
}
.tcr-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
  justify-content: center;
}
.tcr-actions--dual {
  flex-direction: column;
  align-items: stretch;
}
.tcr-btn-wide {
  width: 100%;
  justify-content: center;
}
.tcr-predictions {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: min(40vh, 320px);
  overflow: auto;
}
.tcr-pred-block {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  background: #f8fafc;
}
.tcr-pred-author {
  font-weight: 700;
  font-size: 13px;
  color: #0f172a;
  margin-bottom: 6px;
}
.tcr-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.45;
  color: #334155;
}
.btn {
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
}
.btn-primary {
  background: #111827;
  color: #fff;
  border-color: #111827;
}
.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn-secondary {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #cbd5e1;
}
.btn-secondary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
