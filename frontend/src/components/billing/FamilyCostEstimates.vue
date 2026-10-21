<template>
  <section v-if="estimates.length || error" class="cost-estimates">
    <h3>Cost estimates</h3>
    <p>View, save or print your estimates. Acknowledging receipt is optional and does not authorize a payment.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <article v-for="item in estimates" :key="item.id" class="estimate-card">
      <strong>{{ item.title }} · {{ item.clientName }}</strong>
      <p>{{ item.startDate }} – {{ item.endDate }} · {{ money(item.totalCents) }}</p>
      <div class="actions"><button :disabled="busy" @click="download(item)">Download estimate</button><button :disabled="busy" @click="review(item)">Review estimate</button></div>
      <div v-if="selected?.id === item.id" class="estimate-detail">
        <p>Provider: {{ selected.snapshot.provider.name }}</p>
        <p>{{ selected.snapshot.frequency }}. This period does not limit treatment or insurance coverage.</p>
        <ul><li v-for="line in selected.snapshot.lines" :key="line.serviceCode">{{ line.description }}: {{ line.quantity }} × {{ money(line.amountCents) }} = {{ money(line.totalCents) }}</li></ul>
        <p v-if="selected.acknowledgedAt" role="status">Receipt acknowledged. Your signed copy is available using Download estimate.</p>
        <form v-else-if="selected.status === 'issued'" @submit.prevent="acknowledge">
          <label>Your name<input v-model="signatureName" autocomplete="name" maxlength="255" required /></label>
          <label class="check"><input v-model="accepted" type="checkbox" required />{{ selected.acknowledgmentText }}</label>
          <button :disabled="busy || !accepted || signatureName.trim().length < 2">Acknowledge receipt</button>
        </form>
      </div>
    </article>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api.js';
const props = defineProps({ agencyId: { type: Number, required: true }, clientId: { type: Number, default: null } });
const estimates = ref([]), selected = ref(null), signatureName = ref(''), accepted = ref(false), busy = ref(false), error = ref('');
let generation = 0;
const money = value => value == null ? 'Awaiting price review' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value / 100);
const params = () => ({ agencyId: props.agencyId, ...(props.clientId ? { clientId: props.clientId } : {}) });
async function load() {
  const own = ++generation; estimates.value = []; selected.value = null; accepted.value = false; signatureName.value = ''; error.value = '';
  if (!props.agencyId) return;
  try { const result = await api.get('/family-cost-estimates', { params: params() }); if (own === generation) estimates.value = result.data.estimates || []; }
  catch (e) { if (own === generation) error.value = e.response?.data?.error?.message || 'Cost estimates could not be loaded.'; }
}
async function review(item) { const own = generation; busy.value = true; error.value = ''; try { const result = await api.get(`/family-cost-estimates/${item.id}`, { params: params() }); if (own === generation) { selected.value = result.data; accepted.value = false; signatureName.value = ''; } } catch (e) { if (own === generation) error.value = e.response?.data?.error?.message || 'The estimate could not be opened.'; } finally { busy.value = false; } }
async function acknowledge() { if (!selected.value || busy.value) return; const own = generation; busy.value = true; error.value = ''; try { await api.post(`/family-cost-estimates/${selected.value.id}/acknowledge`, { agencyId: props.agencyId, snapshotHash: selected.value.snapshotHash, accepted: accepted.value, signatureName: signatureName.value }); if (own === generation) await load(); } catch (e) { if (own === generation) error.value = e.response?.data?.error?.message || 'Your acknowledgment could not be saved.'; } finally { busy.value = false; } }
async function download(item) { const own = generation; error.value = ''; try { const result = await api.get(`/family-cost-estimates/${item.id}.pdf`, { params: params(), responseType: 'blob' }); if (own !== generation) return; const url = URL.createObjectURL(result.data), link = document.createElement('a'); link.href = url; link.download = `good-faith-estimate-${item.id}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); } catch (e) { if (own === generation) error.value = 'The estimate could not be downloaded. Please try again.'; } }
watch(() => [props.agencyId, props.clientId], load, { immediate: true });
</script>
<style scoped>
.cost-estimates{margin:24px 0}.cost-estimates p{line-height:1.6}.estimate-card{border:1px solid var(--border,#d8e2e2);border-radius:12px;padding:20px;margin:16px 0;background:var(--bg-card,#fff)}.actions{display:flex;flex-wrap:wrap;gap:12px}button{padding:10px 16px;border:1px solid var(--border,#b5c4cf);border-radius:8px;background:var(--bg-alt,#eff5f7);color:var(--text-primary,#143348);font:inherit;cursor:pointer}button:disabled{opacity:.5}.estimate-detail{margin-top:20px}label{display:grid;gap:8px;margin:16px 0}.check{display:flex;align-items:flex-start;line-height:1.6}input:not([type=checkbox]){padding:10px;border:1px solid var(--border,#b5c4cf);border-radius:8px;font:inherit;max-width:400px}input[type=checkbox]{margin-top:6px}li{line-height:1.8}[role=alert]{color:#b42318}
</style>
