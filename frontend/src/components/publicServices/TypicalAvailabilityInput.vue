<template>
  <fieldset class="typical-hours" :disabled="disabled">
    <legend>Typical in-office availability</legend>
    <p>Choose the times you generally see clients in the office. This is a public summary, not a list of bookable appointments. School hours are not included.</p>
    <div class="broad-times">
      <label v-for="option in broad" :key="option"><input type="checkbox" :checked="selected.includes(option)" @change="toggle(option, $event.target.checked)"/>{{ option }}</label>
    </div>
    <table>
      <caption>Or choose specific days and times</caption>
      <thead><tr><th scope="col">Day</th><th v-for="period in periods" :key="period" scope="col">{{ period }}</th></tr></thead>
      <tbody><tr v-for="day in days" :key="day"><th scope="row">{{ day }}</th><td v-for="period in periods" :key="period"><input type="checkbox" :aria-label="`${day} ${period.toLowerCase()}`" :checked="selected.includes(`${day} ${period.toLowerCase()}`)" @change="toggle(`${day} ${period.toLowerCase()}`, $event.target.checked)"/></td></tr></tbody>
    </table>
    <div v-if="custom.length" class="saved-times"><p>Other saved typical hours</p><label v-for="value in custom" :key="value"><input type="checkbox" checked @change="toggle(value, false)"/>{{ value }}</label></div>
    <p class="summary">{{ selected.length ? selected.join(' · ') : 'No typical hours selected.' }}</p>
  </fieldset>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({ modelValue: { type: String, default: '' }, disabled: Boolean });
const emit = defineEmits(['update:modelValue']);
const broad = ['Weekdays', 'Weekends', 'Mornings', 'Afternoons', 'Evenings'];
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const periods = ['Mornings', 'Afternoons', 'Evenings'];
const selected = computed(() => [...new Set(props.modelValue.split(',').map(value => value.trim()).filter(Boolean))]);
const options = new Set([...broad, ...days.flatMap(day => periods.map(period => `${day} ${period.toLowerCase()}`))]);
const custom = computed(() => selected.value.filter(value => !options.has(value)));
function toggle(value, checked) {
  emit('update:modelValue', (checked ? [...new Set([...selected.value, value])] : selected.value.filter(item => item !== value)).join(', '));
}
</script>

<style scoped>
.typical-hours{min-width:0;margin:16px 0;padding:16px;border:1px solid var(--border-color,#cbdad4);border-radius:10px;color:inherit}.typical-hours legend{font-weight:700}.typical-hours p{font-size:.9rem;line-height:1.5}.broad-times{display:flex;flex-wrap:wrap;gap:10px 18px}.typical-hours label{display:flex;align-items:center;gap:8px;margin:6px 0;font-weight:400}.typical-hours input[type=checkbox]{width:18px;height:18px;padding:0;flex-shrink:0;accent-color:var(--primary-color,#185d46)}table{width:100%;border-collapse:collapse;margin-top:14px}caption{text-align:left;margin-bottom:8px;font-size:.9rem}th,td{padding:9px 3px;border-bottom:1px solid var(--border-color,#e2eae6);font-size:.85rem;text-align:center}th:first-child{text-align:left}.summary{font-weight:600}fieldset:disabled{opacity:.75}
</style>
