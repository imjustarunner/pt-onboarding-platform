<template>
  <div class="tms-panel">
    <div class="tms-head">
      <strong>Tutor match suggestions</strong>
      <button type="button" class="tms-btn" :disabled="loading" @click="load">{{ loading ? 'Matching…' : 'Refresh' }}</button>
    </div>
    <p v-if="message" class="tms-warn">{{ message }}</p>
    <p v-if="error" class="tms-error">{{ error }}</p>
    <div v-if="!matches.length && !loading" class="tms-muted">No comfort preferences on file yet — you can still assign any tutor (override allowed).</div>
    <button
      v-for="m in matches"
      :key="m.userId"
      type="button"
      class="tms-row"
      :class="{ selected: selectedUserId === m.userId }"
      @click="select(m)"
    >
      <div>
        <strong>{{ m.firstName }} {{ m.lastName }}</strong>
        <div class="tms-muted">Score {{ m.score }} · {{ (m.reasons || []).join(', ') || 'no overlap yet' }}</div>
        <div v-if="m.warnings?.length" class="tms-warn">{{ m.warnings.join(' · ') }}</div>
      </div>
      <span class="tms-badge">{{ m.preferencesIncomplete ? 'Incomplete prefs' : 'Ranked' }}</span>
    </button>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import { matchTutors } from '@/services/tutoringLearningOs';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  subjectArea: { type: String, default: null },
  gradeLevel: { type: String, default: null },
  ageRange: { type: String, default: null },
  serviceType: { type: String, default: 'tutoring' },
  emotionalNeeds: { type: Array, default: () => [] },
  modelValue: { type: [Number, String], default: null }
});

const emit = defineEmits(['update:modelValue', 'select']);

const matches = ref([]);
const message = ref('');
const error = ref('');
const loading = ref(false);
const selectedUserId = ref(props.modelValue ? Number(props.modelValue) : null);

async function load() {
  if (!props.agencyId) return;
  loading.value = true;
  error.value = '';
  try {
    const data = await matchTutors({
      agencyId: Number(props.agencyId),
      subjectArea: props.subjectArea,
      gradeLevel: props.gradeLevel,
      ageRange: props.ageRange,
      serviceType: props.serviceType,
      emotionalNeeds: props.emotionalNeeds
    });
    matches.value = data.matches || [];
    message.value = data.message || '';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    loading.value = false;
  }
}

function select(m) {
  selectedUserId.value = m.userId;
  emit('update:modelValue', m.userId);
  emit('select', m);
}

watch(
  () => [props.agencyId, props.subjectArea, props.gradeLevel, props.serviceType],
  () => load(),
  { deep: true }
);

onMounted(load);
</script>

<style scoped>
.tms-panel { display: flex; flex-direction: column; gap: 0.45rem; }
.tms-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.tms-btn { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.82rem; }
.tms-row {
  display: flex; justify-content: space-between; gap: 0.75rem; align-items: flex-start;
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.55rem 0.7rem; background: #fff; text-align: left; cursor: pointer;
}
.tms-row.selected { border-color: #2563eb; background: #eff6ff; }
.tms-muted { color: #64748b; font-size: 0.8rem; }
.tms-warn { color: #b45309; font-size: 0.8rem; }
.tms-error { color: #b91c1c; font-size: 0.85rem; }
.tms-badge { font-size: 0.7rem; background: #f1f5f9; border-radius: 999px; padding: 0.15rem 0.45rem; white-space: nowrap; }
</style>
