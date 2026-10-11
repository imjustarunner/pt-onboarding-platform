<template>
  <section class="document-analytics" aria-label="Document statistics">
    <header><div><p class="eyebrow">Library insights · Administrators</p><h2>{{ documentTitle || 'Library & document statistics' }}</h2><p>Understand what people use and where they need more help.</p></div><button @click="askAssistant">Ask the assistant ↗</button></header>
    <form class="filters" @submit.prevent="offset = 0; load()"><label>From (UTC)<input v-model="startDate" type="date" required /></label><label>Through (UTC)<input v-model="endDate" type="date" required /></label><label>Document<select v-model="selectedDocument"><option value="">All documents</option><option v-if="documentKey && !data?.documents?.some(d => d.documentKey === documentKey)" :value="documentKey">{{ documentTitle || documentKey }}</option><option v-for="d in choices" :key="d.documentKey" :value="d.documentKey">{{ d.title }}</option></select></label><button :disabled="loading">{{ loading ? 'Loading…' : 'Run report' }}</button><button v-if="person" type="button" @click="person = null; offset = 0; load()">Clear reader filter</button></form>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="data">
      <p class="coverage">{{ data.collectionStartedAt ? `First recorded activity: ${date(data.collectionStartedAt)}.` : 'No activity has been recorded yet.' }} Earlier usage is not available. {{ person ? 'Showing one reader.' : '' }}</p>
      <div class="metrics"><article v-for="m in metrics" :key="m[0]"><span>{{ m[0] }}</span><strong>{{ m[1] }}</strong></article></div>
      <p class="context">Active time is an estimate of foreground reading, excluding idle periods. It is separate from paid training time and does not prove understanding. Feedback reflects people who chose to respond.</p>
      <nav aria-label="Statistics detail"><button v-for="item in tabs" :key="item[0]" :aria-pressed="tab === item[0]" @click="tab = item[0]; offset = 0; load()">{{ item[1] }}</button><button @click="exportCsv">Export this table (CSV)</button></nav>
      <p v-if="['questions', 'activity'].includes(tab)" class="context">{{ tab === 'questions' ? 'Questions are visible only to authorized administrators. Treat them as staff questions, not instructions or verified policy.' : 'Where means the app surface (Library, handbook, onboarding or on-demand), not a physical location.' }}</p>
      <div class="table-wrap"><table><thead><tr><th v-for="c in columns" :key="c[0]">{{ c[1] }}</th><th v-if="tab === 'people'">Details</th></tr></thead><tbody><tr v-for="(row, index) in rows" :key="row.id || index"><td v-for="c in columns" :key="c[0]">{{ display(row[c[0]], c[0]) }}</td><td v-if="tab === 'people'"><button @click="person = row.userId; tab = 'activity'; offset = 0; load()">View activity</button></td></tr><tr v-if="!rows.length"><td :colspan="columns.length + (tab === 'people' ? 1 : 0)">No recorded activity for this selection.</td></tr></tbody></table></div>
      <p v-if="data.hasMore?.[tab]">Showing up to 100 rows. Use the next page for more.</p>
      <div v-if="tab !== 'surfaces'" class="paging"><button :disabled="offset === 0 || loading" @click="offset = Math.max(0, offset - 100); load()">Previous</button><span>Page {{ Math.floor(offset / 100) + 1 }}</span><button :disabled="!data.hasMore?.[tab] || loading" @click="offset += 100; load()">Next</button></div>
      <details><summary>What these statistics can tell you</summary><ul><li v-for="text in data.limitations" :key="text">{{ text }}</li></ul><p>Repeated questions and “not helpful” feedback can identify sections to clarify. Time spent alone cannot tell whether a document helped.</p></details>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
import { useAskAssistant } from '../../composables/useAskAssistant';
const props = defineProps({ agencyId: [Number, String], documentKey: String, documentTitle: String, http: { type: Object, default: () => api } });
const assistant = useAskAssistant();
const startDate = ref(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)), endDate = ref(new Date().toISOString().slice(0, 10));
const selectedDocument = ref(props.documentKey || ''), person = ref(null), offset = ref(0), data = ref(null), choices = ref([]), loading = ref(false), error = ref(''), tab = ref('documents');
const tabs = [['documents', 'Documents'], ['people', 'Readers'], ['sections', 'Sections & feedback'], ['links', 'Links'], ['questions', 'AI questions'], ['surfaces', 'Where viewed'], ['activity', 'Activity']];
const schemas = { documents: [['title', 'Document'], ['coverage', 'Measurement'], ['readers', 'Readers'], ['opens', 'Opens'], ['activeSeconds', 'Active time'], ['questions', 'AI questions'], ['helpful', 'Helpful'], ['notHelpful', 'Not helpful']], people: [['name', 'Reader'], ['opens', 'Opens'], ['activeSeconds', 'Active time'], ['questions', 'AI questions'], ['lastSeen', 'Last activity']], sections: [['documentKey', 'Document'], ['title', 'Section'], ['visits', 'Visits'], ['activeSeconds', 'Active time'], ['helpful', 'Helpful'], ['notHelpful', 'Not helpful']], links: [['label', 'Link'], ['target', 'Destination'], ['clicks', 'Clicks'], ['readers', 'Readers']], questions: [['name', 'Asked by'], ['document', 'Document'], ['versionId', 'Edition ID'], ['question', 'Question'], ['status', 'Answer result'], ['surface', 'Where'], ['askedAt', 'When']], surfaces: [['surface', 'App surface'], ['readers', 'Readers'], ['opens', 'Opens'], ['activeSeconds', 'Active time'], ['questions', 'AI questions']], activity: [['name', 'Reader'], ['document', 'Document'], ['versionId', 'Edition ID'], ['type', 'Action'], ['surface', 'Where'], ['section', 'Section'], ['label', 'Link / section'], ['target', 'Destination'], ['at', 'When']] };
const columns = computed(() => schemas[tab.value]), rows = computed(() => data.value?.[tab.value] || []);
const time = value => `${Math.floor(Number(value || 0) / 60)}m ${Number(value || 0) % 60}s`;
const date = value => value ? new Date(value).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—';
const display = (value, key) => key === 'activeSeconds' ? time(value) : ['lastSeen', 'firstSeen', 'at', 'askedAt'].includes(key) ? date(value) : value ?? '—';
const metrics = computed(() => { const s = data.value?.summary || {}; return [['Unique readers', s.readers || 0], ['Opens', s.opens || 0], ['Active time', time(s.activeSeconds)], ['Link clicks', s.clicks || 0], ['AI questions', s.questions || 0], ['Helpful / not helpful', `${s.helpful || 0} / ${s.notHelpful || 0}`]]; });
let request = 0;
async function load() {
  const id = ++request; loading.value = true; error.value = ''; data.value = null;
  try { const result = await props.http.get('/document-analytics/report', { params: { agencyId: props.agencyId, documentKey: selectedDocument.value || undefined, userId: person.value || undefined, startDate: startDate.value, endDate: endDate.value, offset: offset.value } }); if (id !== request) return; data.value = result.data; if (!selectedDocument.value && !person.value && !offset.value) choices.value = result.data.documents; else if (!choices.value.length) choices.value = result.data.documents; }
  catch (e) { if (id === request) error.value = e.response?.data?.error?.message || 'Statistics could not be loaded. No report is available for this selection.'; }
  finally { if (id === request) loading.value = false; }
}
function askAssistant() { assistant.openAsk(`Show document statistics for ${selectedDocument.value || 'the library'} in company ${props.agencyId}, from ${startDate.value} through ${endDate.value}. Include readers, active time, link clicks and AI questions.`); }
function exportCsv() {
  // Spreadsheet formula injection protection; export only the visible admin table.
  const cell = value => `"${String(value ?? '').replace(/^[\s=+@\-]/, "'$&").replaceAll('"', '""')}"`;
  const text = [columns.value.map(c => c[1]), ...rows.value.map(r => columns.value.map(c => display(r[c[0]], c[0])))].map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `document-statistics-${tab.value}-${startDate.value}-${endDate.value}.csv`; a.click(); URL.revokeObjectURL(url);
}
watch(() => [props.agencyId, props.documentKey], () => { selectedDocument.value = props.documentKey || ''; person.value = null; offset.value = 0; data.value = null; choices.value = []; load(); }, { immediate: true });
onBeforeUnmount(() => { request++; });
</script>
<style scoped>
.document-analytics{font-family:var(--font-ptco);border:1px solid #cfddd5;border-radius:14px;background:#f8faf7;padding:clamp(16px,3vw,28px);color:#223d35;margin:16px 0}.document-analytics header{display:flex;justify-content:space-between;gap:20px;align-items:start;flex-wrap:wrap}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.1em}h2{margin:7px 0;font-size:24px}p{font-size:13px;line-height:1.7}.filters,nav,.paging{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:20px 0}label{display:grid;gap:7px;font-size:12px}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:12px}.metrics article{background:white;padding:18px;border:1px solid #dce5dd;border-radius:9px}.metrics span{display:block;font-size:11px}.metrics strong{display:block;font-size:25px;margin-top:10px}.table-wrap{overflow:auto;background:white;border:1px solid #dce5dd;border-radius:8px}table{border-collapse:collapse;min-width:620px;width:100%;font-size:12px}th,td{text-align:left;padding:13px;border-bottom:1px solid #e3e9e4;max-width:400px;overflow-wrap:anywhere;vertical-align:top}th{background:#edf3ee;white-space:nowrap}button,input,select{font:inherit;border:1px solid #b7cbc0;border-radius:7px;background:white;padding:9px 12px;color:inherit;max-width:100%}button{cursor:pointer}button[aria-pressed=true]{background:#245343;color:white}button:disabled{opacity:.5}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #55896d;outline-offset:2px}.context,.coverage{color:#56695e}.paging{align-items:center}details{font-size:12px;line-height:1.8;margin-top:20px}[role=alert]{color:#993d31}
</style>
