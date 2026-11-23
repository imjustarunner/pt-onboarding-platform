<template>
  <dl v-if="phone || lines.appointmentSms || lines.referralFax" class="agency-contact-lines" aria-label="Agency contact numbers">
    <div v-if="phone"><dt>Main office</dt><dd><a :href="voiceHref">{{ phone }}</a></dd></div>
    <div v-if="lines.appointmentSms"><dt>Appointment texts</dt><dd><a :href="`sms:${lines.appointmentSms}`">{{ formatNumber(lines.appointmentSms) }}</a></dd></div>
    <div v-if="lines.referralFax"><dt>Referral fax</dt><dd>{{ formatNumber(lines.referralFax) }}</dd></div>
  </dl>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { tenantLegalProfiles } from '../../content/tenantLegalProfiles';

const props = defineProps({ agencySlug: { type: String, required: true }, mainNumber: String });
const phone = computed(() => props.mainNumber || tenantLegalProfiles[props.agencySlug]?.phone);
const voiceHref = computed(() => {
  const digits = String(phone.value || '').replace(/\D/g, '');
  return digits.length === 10 ? `tel:+1${digits}` : `tel:+${digits}`;
});
const lines = ref({});
const formatNumber = value => String(value).replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');

watch(() => props.agencySlug, async (slug, _previous, onCleanup) => {
  const pending = new AbortController();
  onCleanup(() => pending.abort());
  lines.value = {};
  try {
    const { data } = await api.get(`/public/marketing-pages/contact-lines/${encodeURIComponent(slug)}`, { signal: pending.signal, skipGlobalLoading: true });
    if (!pending.signal.aborted) lines.value = data;
  } catch { /* The published main office number remains available. */ }
}, { immediate: true });
</script>

<style scoped>
.agency-contact-lines { display: flex; flex-wrap: wrap; gap: 12px 30px; margin: 16px 0 24px; }
.agency-contact-lines dt { font-weight: 700; font-size: .9em; }
.agency-contact-lines dd { margin: 2px 0 0; font-variant-numeric: tabular-nums; }
.agency-contact-lines a { color: inherit; text-underline-offset: 3px; }
</style>
