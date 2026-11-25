<script setup>
import { computed } from 'vue';
import { diagnosticCriteriaGroups } from '../../utils/diagnosticCriteriaReview.js';

const props = defineProps({ criteria: { type: Array, default: () => [] }, editable: Boolean, disabled: Boolean });
const emit = defineEmits(['change']);
const groups = computed(() => diagnosticCriteriaGroups(props.criteria));
const types = { symptom: 'Symptom', frequency: 'Frequency', duration: 'Duration', impairment: 'Functional impact', exclusion: 'Exclusion', differential: 'Differential diagnosis' };
const states = { unconfirmed: 'Needs confirmation', present: 'Supported', absent: 'Assessed and not met' };
function change(item, field, value) {
  emit('change', { id: item.id, field, value });
}
</script>

<template>
  <section v-for="group in groups" :key="group.key" class="criteria-group" aria-label="DSM criteria group">
    <p v-if="group.items.some(item => item.kind === 'symptom')" class="criteria-count">
      {{ group.minimum === null ? 'A minimum symptom count could not be verified from the reference.' : `${group.met} documented · ${group.minimum} required` }}
    </p>
    <article v-for="item in group.items" :key="item.id" class="criteria-row" :class="{ 'needs-review': item.status !== 'present' }">
      <div>
        <small>{{ types[item.kind] }}</small>
        <h4>{{ item.label }}</h4>
        <label v-if="editable" class="criteria-input">Clinician review
          <select :disabled="disabled" :value="item.status" @change="change(item, 'status', $event.target.value)">
            <option v-for="(label, value) in states" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <p v-else>{{ states[item.status] || states.unconfirmed }}</p>
        <label v-if="editable && item.kind === 'frequency'" class="criteria-input">Reported frequency
          <input :disabled="disabled" :value="item.frequency" maxlength="300" @input="change(item, 'frequency', $event.target.value)" />
        </label>
        <label v-if="editable && item.kind === 'duration'" class="criteria-input">Assessed duration
          <input :disabled="disabled" :value="item.duration" maxlength="300" @input="change(item, 'duration', $event.target.value)" />
        </label>
        <p v-if="!editable && (item.frequency || item.duration)">{{ [item.frequency, item.duration].filter(Boolean).join(' · ') }}</p>
      </div>
      <div class="criteria-evidence">
        <strong>Documented evidence</strong>
        <p>{{ item.evidence || 'No supporting statement identified in the reviewed content.' }}</p>
      </div>
    </article>
  </section>
</template>

<style scoped>
.criteria-group{margin-block:12px}
.criteria-count{font-weight:650;margin:8px 0}
.criteria-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;padding:12px;margin:8px 0;border:1px solid #d7e2ea;border-radius:8px;background:#fff;color:#193650}
.criteria-row.needs-review{border-color:#e2c482;background:#fffaf0}
.criteria-row h4,.criteria-row p{margin:5px 0;overflow-wrap:anywhere}
.criteria-row small{font-weight:650;color:#516579}
.criteria-evidence{border-inline-start:1px solid #d7e2ea;padding-inline-start:14px}
.criteria-input{display:grid;gap:4px;margin-top:8px}
.criteria-input select,.criteria-input input{box-sizing:border-box;width:100%;min-height:36px;padding:5px 8px;font:inherit;color:inherit;background:#fff;border:1px solid #b8cbd7;border-radius:6px}
@media(max-width:600px){.criteria-row{grid-template-columns:1fr}.criteria-evidence{padding:10px 0 0;border-inline-start:0;border-top:1px solid #d7e2ea}}
</style>
