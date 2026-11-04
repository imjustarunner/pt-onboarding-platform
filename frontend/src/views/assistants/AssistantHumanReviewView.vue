<template>
 <main class="assistant-human-review"><header><p>Human review</p><h1>Assistant recommendations</h1><p>Recommendations remain separate from the source record. Review the current evidence before recording a decision.</p></header>
 <p v-if="error" role="alert">{{ error }}</p><p v-if="loading" role="status">Loading recommendations…</p>
 <section v-if="!detail"><p v-if="!proposals.length&&!loading">No recommendations are available in your review scope.</p><article v-for="p in proposals" :key="p.ref"><h2>{{ p.subrole.replaceAll('_',' ') }}</h2><p>{{ p.decision }} · {{ p.createdAt }}</p><button @click="open(p.ref)">Review recommendation</button></article></section>
 <section v-else><button @click="detail=null">← Review queue</button><h2>{{ detail.subrole }} recommendation</h2><p v-if="!detail.fresh" role="alert">The source has changed or is unavailable. This historical result cannot be accepted as current.</p>
 <p v-if="detail.subjects?.client"><strong>Client:</strong> {{ detail.subjects.client.name }} · #{{ detail.subjects.client.id }} <RouterLink :to="`/${detail.agencySlug}/admin/clients/${detail.subjects.client.id}`">Open chart</RouterLink></p>
 <p v-if="detail.subjects?.staff"><strong>Staff:</strong> {{ detail.subjects.staff.name }} · #{{ detail.subjects.staff.id }}</p>
 <article v-for="(f,i) in detail.result.findings" :key="i"><h3>{{ f.category }} · {{ f.severity }}</h3><p>{{ f.message }}</p><p v-if="f.recommendation"><strong>Suggestion:</strong> {{ f.recommendation }}</p><p v-if="f.uncertainty"><strong>Limitations:</strong> {{ f.uncertainty }}</p><details><summary>Source references</summary><ul><li v-for="ref in f.sourceRefs" :key="ref">{{ ref }} — {{ sourceDescription(ref) }}</li></ul></details></article>
 <p v-if="!detail.result.findings.length">No findings were submitted. Outcome: {{ detail.result.outcome }}.</p>
 <form @submit.prevent="review"><label>Decision<select v-model="decision"><option value="accepted">Accept recommendation for follow-up</option><option value="dismissed">Dismiss</option><option value="more_information">Request more information</option></select></label><label>Reason<textarea v-model="reason" required minlength="5" maxlength="1000"/></label><p>Recording this decision does not sign, amend, approve, post, or transmit any source record.</p><button :disabled="!detail.fresh||saving">Record decision</button></form>
 </section>
 </main>
</template>
<script setup>
import {ref,onMounted} from 'vue';import {useRoute} from 'vue-router';import {useAgencyStore} from '../../store/agency';import api from '../../services/api';
const route=useRoute(),agency=useAgencyStore(),proposals=ref([]),detail=ref(null),loading=ref(false),saving=ref(false),error=ref(''),decision=ref('more_information'),reason=ref('');
const errorText=e=>e?.response?.data?.error?.message||'Review is unavailable. Check your current access.';
async function load(){loading.value=true;try{const{data}=await api.get('/assistant-reviews',{params:{agencyId:route.query.agencyId||agency.currentAgency?.id,...(route.query.sourceKind&&route.query.sourceId?{sourceKind:route.query.sourceKind,sourceId:route.query.sourceId}:{})}});proposals.value=data.proposals||[];}catch(e){error.value=errorText(e);}finally{loading.value=false;}}
async function open(ref){try{const{data}=await api.get(`/assistant-reviews/${encodeURIComponent(ref)}`);detail.value=data;reason.value='';decision.value='more_information';}catch(e){error.value=errorText(e);}}
function sourceDescription(ref){const m=detail.value?.sourceMapping;const source=m?.sources?.[ref]||m?.references?.[ref];return source?`${source.kind} #${source.id}`:'Source not available in this view';}
async function review(){saving.value=true;try{await api.post(`/assistant-reviews/${encodeURIComponent(detail.value.ref)}/review`,{decision:decision.value,reason:reason.value});detail.value=null;await load();}catch(e){error.value=errorText(e);}finally{saving.value=false;}}
onMounted(async()=>{await load();if(route.query.ref)await open(String(route.query.ref));});
</script>
<style scoped>
.assistant-human-review{max-width:960px;margin:auto;padding:32px 24px;color:var(--text-primary,#223642)}header{margin-bottom:28px}article,form{padding:22px;margin:18px 0;border:1px solid #d5e1e7;border-radius:10px;background:var(--card-bg,#fff)}h1{font-size:30px}h2{font-size:21px}h3{font-size:17px}p{line-height:1.65}button{background:#245f56;color:white;border:0;padding:11px 16px;border-radius:6px;cursor:pointer}button:disabled{opacity:.5}label{display:grid;gap:8px;margin:14px 0}select,textarea{font:inherit;padding:10px;border:1px solid #b8cbd3;border-radius:6px}textarea{min-height:100px}li{overflow-wrap:anywhere}@media(max-width:600px){.assistant-human-review{padding:20px 14px}}
</style>
