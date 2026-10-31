<template>
  <section class="parameters" aria-label="Providers by matching parameter">
    <h4>Providers by matching parameter</h4>
    <p>Related checks are combined. Missing referral details are shown as “Not specified” and do not lower a provider’s score. Select a count to see providers. Pass counts include staff waivers.</p>
    <label><input v-model="showEligibility" type="checkbox" /> Show account eligibility checks</label>
    <table>
      <thead><tr><th scope="col">Parameter</th><th v-for="state in states" :key="state.key" scope="col">{{ state.label }}</th></tr></thead>
      <tbody><tr v-for="criterion in criteria" :key="criterion.field">
        <th scope="row">{{ criterion.label }}</th>
        <td v-for="state in states" :key="state.key">
          <span class="provider-count" @keydown.esc="open = null">
            <button type="button" :aria-expanded="open === `${criterion.field}-${state.key}`" :aria-label="`${criterion.label}: ${criterion[state.key].length} ${state.label.toLowerCase()}`"
              @click="open = open === `${criterion.field}-${state.key}` ? null : `${criterion.field}-${state.key}`">{{ criterion[state.key].length }}</button>
            <span class="provider-popover" :class="{ pinned: open === `${criterion.field}-${state.key}` }">
              <strong>{{ criterion.label }} · {{ state.label }}</strong>
              <ul v-if="criterion[state.key].length"><li v-for="provider in criterion[state.key]" :key="provider.userId">{{ provider.name }}<span v-if="provider.waived"> (waived)</span></li></ul>
              <span v-else>No providers</span>
            </span>
          </span>
        </td>
      </tr></tbody>
    </table>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue';
import { groupedExchangeParameters } from '../../navigation/clientExchangePolicy.js';
const props = defineProps({ providers: { type: Array, default: () => [] } });
const open = ref(null);
const showEligibility=ref(false);
const states = [{ key: 'pass', label: 'Pass' }, { key: 'fail', label: 'Does not meet' }, { key: 'unknown', label: 'Needs review' }, {key:'unspecified',label:'Not specified'}];
const criteria = computed(() => {
  return groupedExchangeParameters(props.providers,showEligibility.value);
});
</script>
<style scoped>
.parameters { margin: 18px 0; color: var(--text-primary, #263544); } h4 { margin-bottom: 6px; }
table { border-collapse: collapse; width: 100%; } th, td { padding: 8px; border-bottom: 1px solid var(--border, #ddd); text-align: left; }
.provider-count { position: relative; display: inline-block; } button { cursor: pointer; border: 1px solid #cbd5e1; background: #f8fafc; color: #1e3a5f; border-radius: 6px; min-width: 36px; padding: 4px 8px; }
.provider-popover { display: none; position: absolute; z-index: 5; top: 100%; right: 0; width: min(280px, 65vw); max-height: 240px; overflow: auto; padding: 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 4px 12px #0002; background: white; color: #263544; }
.provider-count:hover .provider-popover, .provider-count:focus-within .provider-popover, .provider-popover.pinned { display: block; }
ul { padding-left: 18px; margin: 8px 0; }
</style>
