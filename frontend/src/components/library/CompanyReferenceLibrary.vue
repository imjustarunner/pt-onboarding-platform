<template>
  <section class="company-references" aria-label="Company handbooks and guides">
    <header><div><p class="reference-kicker">Your company library</p><h2>Handbooks &amp; practice guides</h2><p>Read, search and ask questions without leaving the app.</p></div><router-link v-if="canManage" :to="`${orgPrefix}/admin/document-library?company=${agencyId}`">Manage company documents ↗</router-link></header>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button></p>
    <label v-if="!selected" class="guide-search">Find a guide<input v-model="search" type="search" placeholder="Search handbook and guide titles…" /></label>
    <div v-if="!selected" class="reference-cards"><button v-if="!search || 'workplace handbook policies'.includes(search.toLowerCase())" type="button" @click="open('workplace-handbook')"><span>01 · People &amp; practice</span><strong>Workplace handbook</strong><small>Company policies, expectations and updates</small><b>Read &amp; search ↗</b></button><button v-for="(document, index) in filteredDocuments" :key="document.key" type="button" :disabled="!document.published && !document.betaAvailable" @click="open(document.key)"><span>{{ String(index + 2).padStart(2, '0') }} · {{ document.key === 'school-practice-guide' ? 'ITSCO · In schools' : 'Clinical practice' }}</span><strong>{{ document.title }}</strong><small>{{ document.description }}</small><b>{{ document.published ? 'Read, search & ask ↗' : document.betaAvailable ? 'Read beta edition ↗' : 'Awaiting company setup' }}</b></button></div>
    <p style="margin-top:16px"><router-link :to="`${orgPrefix}/outcome-measures`">Clinical outcome measures · Browse instruments &amp; reuse sources ↗</router-link></p>

    <CompanyReferenceWorkspace v-if="selectedDocument" :key="`${selected}:${agencyId}`" ref="workspace" :agency-id="agencyId" :document-key="selected" :document-title="selectedDocument.title" :beta="!selectedDocument.published && selectedDocument.betaAvailable" closable @close="open('')" @dirty="$emit('dirty', $event)" @published="load" @handbook-link="openHandbook" />
    <div v-else-if="selected === 'workplace-handbook'" class="reference-reader"><button type="button" @click="open('')">Close handbook</button><WorkplaceHandbookReader :key="agencyId" :agency-id="agencyId" analytics-surface="library" /></div>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import api from '../../services/api';
import CompanyReferenceWorkspace from './CompanyReferenceWorkspace.vue';
import WorkplaceHandbookReader from '../handbook/WorkplaceHandbookReader.vue';
const props = defineProps({ agencyId: { type: [Number, String], required: true }, orgPrefix: { type: String, default: '' } });
defineEmits(['dirty']);
const route = useRoute(), router = useRouter(), state = ref({}), error = ref(''), workspace = ref(null);
const search = ref('');
const filteredDocuments = computed(() => (state.value.documents || []).filter(d => `${d.title} ${d.description}`.toLowerCase().includes(search.value.toLowerCase())));
const canManage = computed(() => state.value.canManage === true);
const selected = computed(() => route.query.companyDocument || '');
const selectedDocument = computed(() => state.value.documents?.find(d => d.key === selected.value));
let sequence = 0;
async function load() { const current = ++sequence; error.value = ''; try { const { data } = await api.get('/provider-update/company-documents', { params: { agencyId: props.agencyId } }); if (current === sequence) state.value = data; } catch { if (current === sequence) error.value = 'Company guides could not be loaded.'; } }
function canLeave() { return workspace.value?.canLeave() !== false; }
function open(key, hash = '') {
  if (!canLeave()) return;
  const query = { ...route.query }; if (key) query.companyDocument = key; else delete query.companyDocument;
  router.replace({ query, hash: hash ? `#${hash}` : '' });
}
function openHandbook(hash) { open('workplace-handbook', hash); }
watch(() => props.agencyId, () => { state.value = {}; load(); }, { immediate: true });
onBeforeRouteLeave(canLeave); onBeforeRouteUpdate(canLeave);
onBeforeUnmount(() => { sequence++; });
</script>
<style scoped>
.guide-search{display:block;font-size:13px;margin:16px 0}.guide-search input{display:block;width:100%;box-sizing:border-box;border:1px solid #bdcec1;border-radius:10px;padding:14px;margin-top:8px;font:inherit}
.company-references{margin:24px 0 30px;padding:clamp(16px,3vw,30px);border:1px solid #dce4de;border-radius:16px;background:#f7f9f5;min-width:0;font-family:var(--font-ptco);color:#263c34}.company-references header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:15px;margin-bottom:20px}.company-references h2{font:700 23px/1.4 var(--font-ptco);margin:7px 0}.company-references p{font-size:13px;line-height:1.7;margin:0}.reference-kicker{font-size:10px!important;letter-spacing:.13em;text-transform:uppercase;color:#63736b}.company-references a{font-size:12px;color:#305846}.reference-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px}.reference-cards button{display:grid;gap:14px;text-align:left;padding:24px;min-width:0;border:1px solid #d2e0d4;border-radius:10px;background:#eaf1e3;color:#253d2c;cursor:pointer;font:inherit}.reference-cards button:nth-child(2){background:#e7f0f1;color:#243b50;border-color:#d1dfe1}.reference-cards button:nth-child(3){background:#fff0d6;color:#513b24;border-color:#e6d8bc}.reference-cards span{font-size:10px;letter-spacing:.06em;text-transform:uppercase}.reference-cards strong{font-size:23px;line-height:1.4}.reference-cards small{font-size:12px;line-height:1.7}.reference-cards b{font-size:12px;font-weight:600;margin-top:8px}.reference-cards button:disabled{opacity:.65;cursor:default}.reference-reader{margin-top:24px;min-width:0}.reference-reader>button{margin-bottom:14px;background:white;border:1px solid #cad7cc;border-radius:5px;padding:9px 12px;color:#294835;cursor:pointer}:focus-visible{outline:2px solid #326452;outline-offset:3px}
</style>
