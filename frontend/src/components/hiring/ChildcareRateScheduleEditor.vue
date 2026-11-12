<template>
  <fieldset class="childcare-rates">
    <legend>Childcare hourly pay by child-count band</legend>
    <p>Category {{ category || 'not selected' }} · Childcare level {{ level || 'not selected' }}. Each amount is per caregiver, using the actual shared child count divided by active caregivers and rounded up.</p>
    <p v-if="flatRate != null && flatRate !== ''">Existing flat individual rate: {{ childcareMoney(flatRate) }}/hour. It remains the fallback unless a separate band override is approved.</p>
    <div class="rate-table"><table><thead><tr><th>Children per caregiver</th><th>Resolved hourly rate</th><th>Individual override / hour</th></tr></thead><tbody><tr v-for="band in CHILDCARE_BANDS" :key="band"><th>{{ band }} {{ band === 1 ? 'child' : 'children' }}</th><td :data-testid="`childcare-resolved-${band}`">{{ childcareMoney(resolved[band]) }}</td><td><label class="sr-only" :for="`${id}-${band}`">{{ band }}-child hourly-rate override</label><input :id="`${id}-${band}`" :value="modelValue[band] ?? ''" :aria-label="`${band}-child hourly-rate override`" type="number" min="0.01" max="100000" step="0.01" inputmode="decimal" placeholder="Use approved default" @input="update(band, $event.target.value)" /></td></tr></tbody></table></div>
    <p>Required work with no children uses the one-child base. More than four children per caregiver requires staffing review. These written amounts must be approved with their effective date before payroll applies them.</p>
  </fieldset>
</template>
<script setup>
import { computed, useId } from 'vue';
import { CHILDCARE_BANDS, resolvedChildcareBands, childcareMoney } from '../../utils/childcarePresentation';
const props = defineProps({ modelValue: { type: Object, default: () => ({}) }, category: [Number, String], level: [Number, String], policy: { type: Object, default: null }, flatRate: [Number, String] });
const emit = defineEmits(['update:modelValue']);
const id = useId();
const resolved = computed(() => resolvedChildcareBands({ category: props.category, level: props.level, policy: props.policy, overrides: props.modelValue, flatRate: props.flatRate }));
function update(band, value) { const next = { ...props.modelValue }; if (value === '') delete next[band]; else next[band] = value; emit('update:modelValue', next); }
</script>
<style scoped>
.childcare-rates{border:1px solid #bbcec2;border-radius:8px;padding:14px;margin:0}.childcare-rates p{font-size:.85rem;line-height:1.5}.rate-table{overflow:auto}table{width:100%;border-collapse:collapse;font-size:.85rem}th,td{padding:10px;text-align:left;border-bottom:1px solid #d9e4de}input{font:inherit;width:100%;min-width:120px;max-width:190px;border:1px solid #95b4a5;border-radius:6px;padding:8px;box-sizing:border-box}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
