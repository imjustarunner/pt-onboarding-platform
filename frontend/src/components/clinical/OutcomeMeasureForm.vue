<template>
  <div class="measure-form">
    <p class="measure-instructions">{{ measure.instructions }}</p>
    <p v-if="measure.kind === 'original_pilot'" class="measure-context"><strong>Original NLU pilot · Not validated.</strong> {{ measure.population }}. Results support discussion, not diagnosis or eligibility decisions.</p>
    <p v-if="preview" class="measure-context">Blank instrument preview · Open a client’s Assessments &amp; Evaluations to record responses.</p>
    <p v-if="safetyFlag" class="measure-safety" role="alert"><strong>Direct safety follow-up needed.</strong> Item 9 was endorsed. Assess suicide/self-harm concerns now and follow the agency safety procedure. This form does not send an emergency notification.</p>
    <template v-for="(item, index) in visibleItems" :key="item.key">
      <p v-if="item.section && item.section !== visibleItems[index - 1]?.section" class="measure-section">{{ item.section }}</p>
      <fieldset :disabled="disabled || preview" :data-question="item.key">
        <legend><span class="measure-number">{{ index + 1 }}</span> {{ item.label }} <small v-if="item.optional">(optional)</small></legend>
        <p v-if="item.helper">{{ item.helper }}</p>
        <p v-if="preview && item.when?.length" class="measure-conditional">Follow-up question · shown when the relevant earlier response applies.</p>
        <textarea v-if="item.type === 'text'" :aria-label="item.label" maxlength="1500" rows="3" :value="modelValue[item.key] || ''" @input="set(item.key, $event.target.value)" />
        <input v-else-if="item.type === 'number'" type="number" :aria-label="item.label" :min="item.min" :max="item.max" step="1" :value="modelValue[item.key] ?? ''" @input="set(item.key, $event.target.value)" />
        <div v-else class="measure-options">
          <label v-for="option in item.options" :key="option.value" :class="{ selected: selected(item, option.value) }">
            <input :type="item.type === 'checkboxes' ? 'checkbox' : 'radio'" :name="`${instanceId}-${item.key}`" :value="option.value" :checked="selected(item, option.value)" @change="choose(item, option.value, $event.target.checked)" />
            <span>{{ option.label }}</span>
          </label>
        </div>
        <button v-if="!preview && modelValue[item.key] != null" class="measure-clear" type="button" @click="clear(item.key)">Leave unanswered</button>
      </fieldset>
    </template>
    <p class="measure-attribution">{{ measure.rights.attribution }}</p>
    <p class="measure-source"><a :href="measure.rights.sourceUrl" target="_blank" rel="noopener noreferrer">Instrument source ↗</a> · {{ measure.instrumentVersion }} · English</p>
  </div>
</template>
<script setup>
import { computed, useId } from 'vue';
import { outcomeItemVisible } from '../../utils/outcomeMeasureFields.js';
const props = defineProps({ measure: { type: Object, required: true }, modelValue: { type: Object, default: () => ({}) }, preview: Boolean, disabled: Boolean });
const emit = defineEmits(['update:modelValue']);
const instanceId = useId();
const visibleItems = computed(() => props.measure.items.filter(item => props.preview || outcomeItemVisible(item, props.modelValue)));
const safetyFlag = computed(() => !props.preview && props.measure.id === 'phq-9' && Number(props.modelValue.q9) > 0);
const selected = (item, value) => item.type === 'checkboxes' ? (props.modelValue[item.key] || []).includes(value) : props.modelValue[item.key] === value;
function update(next) {
  for (const item of props.measure.items) if (!outcomeItemVisible(item, next)) delete next[item.key];
  emit('update:modelValue', next);
}
function set(key, value) { update({ ...props.modelValue, [key]: value }); }
function clear(key) { const next = { ...props.modelValue }; delete next[key]; update(next); }
function choose(item, value, checked) {
  if (item.type !== 'checkboxes') return set(item.key, value);
  let values = [...(props.modelValue[item.key] || [])].filter(v => v !== value);
  if (checked) values = value === '5' ? ['5'] : [...values.filter(v => v !== '5'), value];
  set(item.key, values);
}
</script>
<style scoped>
.measure-form{color:var(--text-primary,#253b38);font-family:inherit;line-height:1.65}.measure-instructions{padding:20px;background:#edf4ef;border-left:3px solid #497564;border-radius:3px;font-size:14px}.measure-context,.measure-conditional{font-size:12px;color:#53635f}.measure-safety{padding:18px;background:#fff0eb;border:1px solid #c5644b;border-radius:8px;color:#762e20}.measure-safety strong{display:block}.measure-section{font-weight:700;margin-top:28px}fieldset{margin:24px 0;border:0;border-bottom:1px solid #e1e7e3;padding:0 0 22px;min-width:0}legend{font-weight:600;font-size:14px;padding:0;line-height:1.7}.measure-number{color:#698075;font-variant-numeric:tabular-nums;margin-right:6px}legend small{font-weight:400}.measure-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:8px;margin-top:14px}.measure-options label{display:flex;align-items:center;gap:9px;border:1px solid #d3dfd7;padding:12px;border-radius:8px;font-size:12px;cursor:pointer;background:#fff;color:#263b34}.measure-options label.selected{background:#e5efe6;border-color:#44715c}.measure-options input{accent-color:#32624c;flex-shrink:0}.measure-clear{font:inherit;font-size:11px;color:#53645b;background:none;border:0;padding:8px 0;cursor:pointer}.measure-form textarea{width:100%;box-sizing:border-box;padding:12px;font:inherit;margin-top:10px;border:1px solid #bfcec5;border-radius:6px;resize:vertical}.measure-attribution{font-size:11px;color:#5b6e63;margin-top:28px}.measure-source{font-size:11px;overflow-wrap:anywhere}.measure-source a{color:#28583d}:focus-visible{outline:2px solid #386552;outline-offset:3px}fieldset:disabled label{cursor:default}
</style>
