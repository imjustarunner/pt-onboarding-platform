<template>
  <div class="dyn-q">
    <div v-for="q in visibleQuestions" :key="q.question_key" class="dyn-q__item">
      <label v-if="q.input_type === 'boolean'" class="dyn-q__bool">
        <input
          type="checkbox"
          :checked="Boolean(model[q.question_key])"
          @change="set(q.question_key, $event.target.checked)"
        />
        <span>
          {{ q.label }}
          <em v-if="q.required">*</em>
          <small v-if="q.help_text">{{ q.help_text }}</small>
        </span>
      </label>

      <div v-else-if="isScaleType(q.input_type)" class="dyn-q__scale">
        <div class="dyn-q__scale-label">
          {{ q.label }} <em v-if="q.required">*</em>
          <small v-if="q.help_text">{{ q.help_text }}</small>
        </div>
        <div class="dyn-q__scale-row" :class="{ 'dyn-q__scale-row--nps': q.input_type === 'nps' }">
          <button
            v-for="opt in scalePoints(q)"
            :key="`${q.question_key}-${opt.value}`"
            type="button"
            class="dyn-q__scale-btn"
            :class="{ selected: Number(model[q.question_key]) === Number(opt.value) }"
            @click="set(q.question_key, Number(opt.value))"
          >
            <span class="dyn-q__scale-val">{{ opt.label }}</span>
          </button>
        </div>
        <div v-if="edgeLabels(q).left || edgeLabels(q).right" class="dyn-q__scale-edges">
          <span>{{ edgeLabels(q).left }}</span>
          <span>{{ edgeLabels(q).right }}</span>
        </div>
      </div>

      <label v-else-if="q.input_type === 'number'">
        {{ q.label }} <em v-if="q.required">*</em>
        <small v-if="q.help_text">{{ q.help_text }}</small>
        <input
          type="number"
          :value="model[q.question_key] ?? ''"
          min="0"
          step="1"
          @input="set(q.question_key, $event.target.value === '' ? null : Number($event.target.value))"
        />
      </label>
      <label v-else-if="q.input_type === 'textarea'">
        {{ q.label }} <em v-if="q.required">*</em>
        <small v-if="q.help_text">{{ q.help_text }}</small>
        <textarea
          rows="3"
          :value="model[q.question_key] ?? ''"
          @input="set(q.question_key, $event.target.value)"
        />
      </label>
      <label v-else-if="q.input_type === 'select' && optionsFor(q).length">
        {{ q.label }} <em v-if="q.required">*</em>
        <small v-if="q.help_text">{{ q.help_text }}</small>
        <select
          :value="model[q.question_key] ?? ''"
          @change="set(q.question_key, $event.target.value)"
        >
          <option value="">Select…</option>
          <option v-for="opt in optionsFor(q)" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <label v-else-if="q.input_type !== 'select'">
        {{ q.label }} <em v-if="q.required">*</em>
        <small v-if="q.help_text">{{ q.help_text }}</small>
        <input
          type="text"
          :value="model[q.question_key] ?? ''"
          @input="set(q.question_key, $event.target.value)"
        />
      </label>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  sectionKey: { type: String, required: true },
  questions: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['update:modelValue']);

const model = computed(() => props.modelValue || {});

/** Skip keys already rendered as dedicated UI in the parent section. */
const SKIP_KEYS = new Set([
  'first_day_of_school',
  'bts_itsco_invited',
  'bts_partner_invited',
  'bts_marketing_table',
  'bts_active_signups',
  'fall_checkin_slot_id',
  'fall_checkin_modality',
]);

const visibleQuestions = computed(() =>
  (props.questions || []).filter((q) => q.enabled !== 0 && q.enabled !== false && !SKIP_KEYS.has(q.question_key))
);

function set(key, value) {
  emit('update:modelValue', { ...model.value, [key]: value });
}

function isScaleType(type) {
  return ['likert', 'nps', 'rating'].includes(String(type || ''));
}

function optionsFor(q) {
  let opts = q.options_json;
  if (typeof opts === 'string') {
    try {
      opts = JSON.parse(opts);
    } catch {
      opts = [];
    }
  }
  if (!Array.isArray(opts)) return [];
  return opts.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? String(o.value) }
  );
}

function scalePoints(q) {
  const opts = optionsFor(q);
  if (opts.length) return opts.map((o) => ({ value: Number(o.value), label: String(o.label) }));
  if (q.input_type === 'nps') {
    return Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) }));
  }
  const max = q.input_type === 'rating' ? 5 : 5;
  return Array.from({ length: max }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
}

function edgeLabels(q) {
  const help = String(q.help_text || '');
  if (help.includes('·')) {
    const [left, right] = help.split('·').map((s) => s.trim());
    return { left: left || '', right: right || '' };
  }
  if (q.input_type === 'nps') return { left: 'Not likely', right: 'Extremely likely' };
  if (q.input_type === 'likert' || q.input_type === 'rating') return { left: 'Poor', right: 'Excellent' };
  return { left: '', right: '' };
}
</script>

<style scoped>
.dyn-q {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}
.dyn-q__item label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 600;
}
.dyn-q__item small {
  font-weight: 400;
  color: #64748b;
}
.dyn-q__item em {
  color: #b91c1c;
  font-style: normal;
}
.dyn-q__item input,
.dyn-q__item textarea,
.dyn-q__item select {
  font: inherit;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}
.dyn-q__bool {
  flex-direction: row !important;
  align-items: flex-start;
  gap: 10px !important;
}
.dyn-q__bool input {
  margin-top: 2px;
  width: 18px;
  height: 18px;
}
.dyn-q__bool span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dyn-q__scale {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dyn-q__scale-label {
  font-size: 0.85rem;
  font-weight: 600;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dyn-q__scale-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dyn-q__scale-row--nps {
  gap: 4px;
}
.dyn-q__scale-btn {
  min-width: 40px;
  height: 40px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-weight: 700;
  color: #334155;
  padding: 0 8px;
}
.dyn-q__scale-row--nps .dyn-q__scale-btn {
  min-width: 32px;
  height: 36px;
  font-size: 0.8rem;
}
.dyn-q__scale-btn.selected {
  background: #0c4a6e;
  border-color: #0c4a6e;
  color: #fff;
}
.dyn-q__scale-edges {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #64748b;
}
</style>
