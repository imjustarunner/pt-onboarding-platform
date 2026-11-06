<template>
  <section v-if="items.length" class="panel" aria-label="Suggested billing changes">
    <div class="panel-heading"><div><h2>Suggested billing changes</h2><p>These repeat across claims. Nothing changes until you accept one.</p></div></div>
    <article v-for="item in items" :key="item.id">
      <p>{{ item.prompt }}</p>
      <label v-if="item.kind === 'modifier'">Modifier<input v-model="modifiers[item.id]" maxlength="2" :aria-label="`Modifier for ${item.prompt}`" /></label>
      <div class="panel-toolbar">
        <button class="primary" type="button" :disabled="busy" @click="decide(item, 'accepted')">Accept</button>
        <button class="secondary" type="button" :disabled="busy" @click="decide(item, 'dismissed')">Dismiss</button>
      </div>
    </article>
    <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({ agencyId: { type: Number, required: true } });
const items = ref([]);
const modifiers = ref({});
const busy = ref(false);
const error = ref('');

async function load() {
  error.value = '';
  try {
    const { data } = await api.get('/medical-billing/billing-suggestions', { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
    items.value = Array.isArray(data?.items) ? data.items : [];
  } catch (e) {
    items.value = [];
    error.value = e.response?.status === 404 ? '' : (e.response?.data?.error?.message || '');
  }
}

async function decide(item, decision) {
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/medical-billing/billing-suggestions/${item.id}/decide`, {
      agencyId: props.agencyId,
      decision,
      modifier: modifiers.value[item.id] || item.payload?.modifier,
      reason: item.prompt,
      policyReference: 'Accepted from the billing suggestion'
    });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Unable to update this suggestion.';
  } finally {
    busy.value = false;
  }
}

watch(() => props.agencyId, load, { immediate: true });
</script>
