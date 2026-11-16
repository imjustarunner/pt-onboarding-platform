<template>
  <section class="billing-rules" aria-labelledby="billing-rules-title">
    <BillingSectionNav current="billing-rules" />
    <header class="rules-header">
      <div>
        <p class="eyebrow">Colorado defaults</p>
        <h2 id="billing-rules-title">Billing rules</h2>
        <p>
          These are the service codes each credential group may use. The Colorado default is what the practice follows today.
          If Colorado changes a rule, update that cell here. A practice update stays visible for the next person.
          H0002 stays off until explicitly enabled for a provider. Payer categories below are practice rules; enrollment and payer-specific requirements still apply.
        </p>
      </div>
    </header>

    <p v-if="!agencyId" class="status">Select a practice to see its billing rules.</p>
    <p v-else-if="loading" class="status">Loading Colorado rules…</p>
    <p v-if="error" class="status error" role="alert">{{ error }}</p>

    <template v-if="agencyId && !loading">
      <div class="tier-legend">
        <article v-for="tier in rules.tiers" :key="tier.id">
          <h3>{{ tier.label }}</h3>
          <p>{{ tier.detail }}</p>
        </article>
      </div>

      <section class="panel" aria-labelledby="person-exceptions-title">
        <div class="panel-heading">
          <div>
            <h3 id="person-exceptions-title">One provider, one extra service</h3>
            <p>Search for the provider who needs H0002, select them, and turn it on. Only selected providers and existing grants appear below.</p>
          </div>
          <label>Find a provider
            <input v-model="providerQuery" type="search" placeholder="Name or credential" />
          </label>
        </div>
        <ul v-if="providerQuery.trim().length >= 2" class="provider-search-results" aria-label="Provider search results"><li v-for="provider in providerMatches" :key="provider.id"><button type="button" @click="selectedProviderId=provider.id;providerQuery=''">{{ provider.name }} · {{ provider.credential || 'Credential not recorded' }}</button></li><li v-if="!providerMatches.length">No provider matches that search.</li></ul>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Credential</th>
                <th>Colorado group</th>
                <th>H0002 screening</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="provider in visibleProviders" :key="provider.id">
                <td>{{ provider.name }}</td>
                <td>{{ provider.credential || 'Credential not recorded' }}</td>
                <td>{{ tierLabel(provider.tier) }}</td>
                <td>
                  <button
                    type="button"
                    class="switch"
                    role="switch"
                    :aria-checked="provider.grants.includes('H0002')"
                    :aria-label="`${provider.grants.includes('H0002') ? 'Turn off' : 'Turn on'} H0002 for ${provider.name}`"
                    :disabled="saving"
                    @click="setGrant(provider, !provider.grants.includes('H0002'))"
                  >
                    <span>{{ provider.grants.includes('H0002') ? 'On' : 'Off' }}</span>
                  </button>
                </td>
              </tr>
              <tr v-if="!visibleProviders.length">
                <td colspan="4">Search for and select a provider to enable H0002.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <BillingPayerRules v-if="rules.payerRules" :rules="rules.payerRules" :codes="rules.codes" :tiers="rules.tiers" :saving="saving" @change="setPayerRule" />

      <section class="panel" aria-labelledby="colorado-matrix-title">
        <div class="panel-heading">
          <div>
            <h3 id="colorado-matrix-title">Who may use each code</h3>
            <p>On means that credential group can see and use the code. Off means it stays out of their list. A marked update is a change from the Colorado default.</p>
          </div>
          <label>Find a code
            <input v-model="codeQuery" type="search" placeholder="Code or name" />
          </label>
        </div>
        <div class="table-scroll">
          <table class="matrix">
            <thead>
              <tr>
                <th>Service</th>
                <th>Allowed payer categories</th>
                <th v-for="tier in rules.tiers" :key="tier.id">{{ tier.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="code in visibleCodes" :key="code.code">
                <th scope="row">
                  <strong>{{ code.code }}</strong>
                  <span>{{ code.description }}</span>
                  <em v-if="code.optIn">Default off. Use the provider list above.</em>
                </th>
                <td class="program-badges"><button v-for="program in rules.payerRules?.programs || []" :key="program.id" type="button" :class="['program-badge',{allowed:code.payerPrograms?.[program.id]}]" :aria-pressed="!!code.payerPrograms?.[program.id]" :disabled="saving || !rules.payerRules?.available" @click="setPayerRule({kind:'program_service',program:program.id,serviceCode:code.code,allowed:!code.payerPrograms?.[program.id]})">{{ program.label }} {{ code.payerPrograms?.[program.id] ? '✓' : '×' }}</button></td>
                <td v-for="tier in rules.tiers" :key="tier.id">
                  <button
                    type="button"
                    class="switch"
                    role="switch"
                    :aria-checked="code.tiers[tier.id]"
                    :aria-label="`${code.tiers[tier.id] ? 'Turn off' : 'Turn on'} ${code.code} for ${tier.label}`"
                    :disabled="saving || code.optIn"
                    @click="setRule(code, tier.id, !code.tiers[tier.id])"
                  >
                    <span>{{ code.tiers[tier.id] ? 'On' : 'Off' }}</span>
                  </button>
                  <small v-if="code.sources[tier.id] === 'practice_update'">Updated</small>
                  <small v-else>Colorado default</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import BillingSectionNav from './BillingSectionNav.vue';
import BillingPayerRules from './BillingPayerRules.vue';

const props = defineProps({
  scopedAgencyId: { type: [Number, String], default: null }
});
const agencyStore = useAgencyStore();
const agencyId = computed(() => Number(props.scopedAgencyId || agencyStore.currentAgency?.id || 0));

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const providerQuery = ref('');
const selectedProviderId=ref(null);
const codeQuery = ref('');
const rules = ref({ tiers: [], codes: [], providers: [] });

const providers=computed(()=>[...new Map((rules.value.providers || []).map(provider=>[Number(provider.id),provider])).values()]);
const providerMatches = computed(() => {
  const query = providerQuery.value.trim().toLowerCase();
  return providers.value.filter((provider) => {
    if (query.length<2) return false;
    return `${provider.name} ${provider.credential}`.toLowerCase().includes(query);
  }).slice(0,20);
});
const visibleProviders=computed(()=>providers.value.filter(provider=>provider.grants.includes('H0002') || Number(provider.id)===Number(selectedProviderId.value)));

const visibleCodes = computed(() => {
  const query = codeQuery.value.trim().toLowerCase();
  return (rules.value.codes || []).filter((code) => {
    if (!query) return true;
    return `${code.code} ${code.description}`.toLowerCase().includes(query);
  });
});

function tierLabel(id) {
  return rules.value.tiers.find((tier) => tier.id === id)?.label || 'Credential not recognized — QBHA codes only';
}

let requestSequence=0;
onBeforeUnmount(()=>{requestSequence++;});
async function load() {
  const sequence=++requestSequence;
  rules.value={tiers:[],codes:[],providers:[]};saving.value=false;
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/medical-billing/billing-rules', { params: { agencyId: agencyId.value } });
    if(sequence!==requestSequence)return;
    rules.value = data || { tiers: [], codes: [], providers: [] };
  } catch (err) {
    if(sequence!==requestSequence)return;
    error.value = err?.response?.data?.error?.message || 'The billing rules could not be loaded.';
  } finally {
    if(sequence===requestSequence)loading.value = false;
  }
}

async function setRule(code, credentialTier, allowed) {
  if(saving.value)return;
  const sequence=requestSequence;
  saving.value = true;
  error.value = '';
  try {
    const { data } = await api.put('/medical-billing/billing-rules/credential', {
      agencyId: agencyId.value,
      serviceCode: code.code,
      credentialTier,
      allowed
    });
    if(sequence===requestSequence)rules.value = data;
  } catch (err) {
    if(sequence===requestSequence)error.value = err?.response?.data?.error?.message || 'That Colorado rule could not be saved.';
  } finally {
    if(sequence===requestSequence)saving.value = false;
  }
}

async function setGrant(provider, enabled) {
  if(saving.value)return;
  const sequence=requestSequence;
  saving.value = true;
  error.value = '';
  try {
    const { data } = await api.put('/medical-billing/billing-rules/provider-grant', {
      agencyId: agencyId.value,
      userId: provider.id,
      serviceCode: 'H0002',
      enabled
    });
    if(sequence===requestSequence)rules.value = data;
  } catch (err) {
    if(sequence===requestSequence)error.value = err?.response?.data?.error?.message || 'That provider exception could not be saved.';
  } finally {
    if(sequence===requestSequence)saving.value = false;
  }
}

async function setPayerRule(change){if(saving.value)return;saving.value=true;error.value='';const scope=agencyId.value,sequence=requestSequence;try{const {data}=await api.put('/medical-billing/billing-rules/payer',{agencyId:scope,revision:rules.value.payerRules.revision,...change});if(sequence===requestSequence)rules.value=data;}catch(err){if(sequence===requestSequence)error.value=err?.response?.data?.error?.message || 'The payer billing rule could not be saved.';}finally{if(sequence===requestSequence)saving.value=false;}}

watch(agencyId,()=>{selectedProviderId.value=null;providerQuery.value='';load();},{ immediate: true });
</script>

<style scoped>
.billing-rules { color: var(--brand-ink, #1d2633); }
.provider-search-results{list-style:none;padding:8px;border:1px solid #d5dbe3;border-radius:8px;max-height:260px;overflow:auto}.provider-search-results button{width:100%;text-align:left;border:0;background:none;padding:9px;cursor:pointer}.program-badges{min-width:220px}.program-badge{border:1px solid #cbd5e1;background:#f1f5f9;color:#64748b;border-radius:999px;padding:5px 9px;margin:3px;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}.program-badge.allowed{background:#e7f6ef;border-color:#73a68d;color:#145c38}
.eyebrow { color: var(--brand-red, #b80016); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; margin: 0 0 4px; text-transform: uppercase; }
.rules-header h2, .panel h3 { margin: 0 0 6px; }
.rules-header p, .panel-heading p, .tier-legend p { color: #4d5968; line-height: 1.45; margin: 0; max-width: 78ch; }
.tier-legend { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 22px 0; }
.tier-legend article, .panel { background: #fff; border: 1px solid #e4e7ec; border-radius: 16px; padding: 16px 18px; }
.panel { margin-top: 16px; }
.panel-heading { align-items: end; display: flex; gap: 18px; justify-content: space-between; margin-bottom: 14px; }
label { color: #4d5968; display: grid; font-size: 13px; gap: 6px; min-width: 220px; }
input { border: 1px solid #d5dbe3; border-radius: 10px; color: inherit; font: inherit; padding: 8px 10px; }
.table-scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; }
th, td { border-bottom: 1px solid #eef1f4; padding: 12px 10px; text-align: left; vertical-align: top; }
.matrix th[scope='row'] { min-width: 260px; }
.matrix th[scope='row'] span, .matrix th[scope='row'] em { color: #4d5968; display: block; font-style: normal; font-weight: 400; margin-top: 3px; }
.matrix th[scope='row'] em { color: var(--brand-red, #b80016); }
.switch { background: #f4f6f8; border: 1px solid #d5dbe3; border-radius: 999px; color: inherit; cursor: pointer; min-width: 64px; padding: 6px 12px; }
.switch[aria-checked='true'] { background: #e7f6ef; border-color: #1f7a4d; color: #145c38; }
.switch:disabled { cursor: not-allowed; opacity: 0.55; }
small { color: #667484; display: block; margin-top: 4px; }
.status { margin-top: 12px; }
.status.error { color: var(--brand-red, #b80016); }
@media (max-width: 900px) {
  .tier-legend, .panel-heading { display: grid; grid-template-columns: 1fr; }
}
</style>
