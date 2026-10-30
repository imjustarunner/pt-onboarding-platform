<template>
  <section v-if="selections.length || opening" class="enrollment-preferences" aria-label="Enrollment preferences">
    <h3>Enrollment preferences</h3>
    <p v-for="provider in selections" :key="provider.providerId"><strong>{{ provider.providerName || `Provider #${provider.providerId}` }}</strong> · {{ provider.status === 'WAITLIST' ? 'Waitlist requested' : 'Provider requested' }}<span v-if="provider.modality"> · {{ formatModality(provider.modality) }}</span></p>
    <p v-if="opening"><strong>Requested time:</strong> {{ opening.date }} · {{ opening.time }} ({{ opening.timeZone }}) · {{ opening.frequency }}</p>
    <p class="muted">These are the family’s enrollment preferences. Confirm the provider assignment and availability before booking. A requested time is not a confirmed appointment.</p>
  </section>
</template>
<script setup>
import { computed } from 'vue';
import { openingPreferencePresentation } from '../../../utils/openingPreferencePresentation';
const props = defineProps({ preferences: { type: [Object,String], default: null } });
const data = computed(() => { try { return typeof props.preferences === 'string' ? JSON.parse(props.preferences) || {} : props.preferences || {}; } catch { return {}; } });
const selections = computed(() => Array.isArray(data.value.providerSelections) && data.value.providerSelections.length ? data.value.providerSelections : data.value.providerSelection ? [data.value.providerSelection] : []);
const opening = computed(() => openingPreferencePresentation(data.value.requestedOpening));
const formatModality = value => ({ VIRTUAL:'Virtual', IN_PERSON:'In person', ALL:'Either format' }[String(value).toUpperCase()] || value);
</script>
<style scoped>
.enrollment-preferences { margin: 16px 0; padding: 18px; border: 1px solid #d6e4ec; border-radius: 12px; background: #f5fafc; }
h3 { margin: 0 0 12px; } p { margin: 8px 0; } .muted { color: #53657a; font-size: 14px; }
</style>
