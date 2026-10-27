<template>
  <section>
    <strong>Provider matching</strong>
    <p>Only current, active providers appear here. Closed and waitlisted providers remain eligible to request when there are no firm blocks.</p>
    <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">{{ loading ? 'Checking…' : 'Refresh matching' }}</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="audit">
      <p>Checked {{ new Date(audit.checkedAt).toLocaleString() }}. Refreshing does not send notifications. Any unverified details are listed below.</p>
      <details><summary>Matched providers ({{ matched.length }})</summary><div v-for="provider in matched" :key="provider.providerUserId"><h4>{{ provider.providerName }}</h4><ExchangeMatchStatus :fit="provider.fit" /></div></details>
      <details><summary>Providers not matched ({{ unmatched.length }})</summary><div v-for="provider in unmatched" :key="provider.providerUserId"><h4>{{ provider.providerName }}</h4><ExchangeMatchStatus :fit="provider.fit" /></div></details>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import ExchangeMatchStatus from './ExchangeMatchStatus.vue';
const props = defineProps({ listingId: { type: Number, required: true } });
const audit = ref(null), error = ref(''), loading = ref(false);
let version = 0;
watch(() => props.listingId, () => { version++; audit.value = null; error.value = ''; loading.value = false; });
const matched = computed(() => audit.value?.providers.filter(p => p.fit.status === 'match') || []);
const unmatched = computed(() => audit.value?.providers.filter(p => p.fit.status !== 'match') || []);
async function load() {
  const current = ++version;
  loading.value = true; error.value = '';
  try { const { data } = await api.get(`/client-exchange/listings/${props.listingId}/matching-audit`); if (current === version) audit.value = data.audit; }
  catch (e) { if (current === version) error.value = e.response?.data?.error?.message || 'Unable to check provider matching.'; }
  finally { if (current === version) loading.value = false; }
}
</script>
