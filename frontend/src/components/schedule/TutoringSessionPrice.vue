<template>
  <section class="tutoring-price" aria-label="Tutoring session price">
    <p v-if="loading" role="status">Loading the organization’s session price…</p>
    <template v-else-if="quote">
      <p><strong>Session price: {{ money(modelValue?.amountCents ?? quote.amountCents) }}</strong>
        · {{ formatLabel }} · {{ durationMinutes }} minutes</p>
      <p class="muted">{{ sourceLabel }}<template v-if="quote.rateUnit === 'hour'"> · {{ money(quote.rateCents) }} per hour</template>.</p>
    </template>
    <p v-else role="status">Select a service and format to review its price before booking.</p>
    <fieldset v-if="canSet && quote && !packageId" :disabled="loading">
      <legend>Price for this appointment</legend>
      <label><input type="radio" :name="radioName" :checked="!custom" @change="useDefault" /> Use organization rate</label>
      <label><input type="radio" :name="radioName" :checked="custom" @change="useCustom" /> Custom session price</label>
      <template v-if="custom">
        <label>Session price ($)<input v-model="dollars" inputmode="decimal" type="text" aria-label="Custom session price in dollars" @input="publish" /></label>
        <label>Reason<input v-model="reason" type="text" maxlength="500" aria-label="Reason for custom session price" @input="publish" /></label>
        <p v-if="dollars && amountCents === null" role="alert">Enter zero or more with at most two decimal places.</p>
        <p>This price applies to this appointment. It does not change employee pay or a purchased package.</p>
      </template>
    </fieldset>
    <p v-if="packageId">This appointment uses the selected package credit; no separate session price applies.</p>
    <p v-else-if="!canSet && quote" class="muted">Contact the office for questions about the agreed session price.</p>
  </section>
</template>
<script setup>
import { computed, ref, useId, watch } from 'vue';
const props = defineProps({ modelValue: { type: Object, default: null }, quote: { type: Object, default: null },
  canSet: Boolean, loading: Boolean, packageId: { type: Number, default: 0 }, durationMinutes: Number, formatLabel: String, contextKey: String });
const emit = defineEmits(['update:modelValue']);
const radioName = `tutoring-price-${useId()}`;
const dollars = ref(''), reason = ref(''), custom = ref(false);
const amountCents = computed(() => /^\d+(?:\.\d{1,2})?$/.test(dollars.value.trim()) ? Math.round(Number(dollars.value) * 100) : null);
const money = cents => Number.isSafeInteger(cents) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100) : 'Needs review';
const sourceLabel = computed(() => ({ provider: 'Organization-approved individual customer rate', agency: 'Organization customer rate',
  'learning-tier-or-override': 'Organization-assigned customer rate', catalog: 'Service catalog rate' })[props.quote?.source] || 'Organization customer rate');
function publish() { emit('update:modelValue', { amountCents: amountCents.value, reason: reason.value.trim() }); }
function useCustom() { custom.value = true; publish(); }
function useDefault() { custom.value = false; dollars.value = ''; reason.value = ''; emit('update:modelValue', null); }
watch(() => [props.contextKey, props.packageId, props.canSet], useDefault);
</script>
<style scoped>
.tutoring-price { max-width: 100%; }
fieldset { display: grid; gap: .6rem; min-width: 0; padding: .75rem; border: 1px solid var(--border, #cbd5e1); border-radius: .5rem; }
label { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
input[type=text] { max-width: 100%; min-width: 0; padding: .5rem; }
.muted { color: var(--text-secondary, #475569); }
</style>
