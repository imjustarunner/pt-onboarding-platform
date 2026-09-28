<template>
  <section class="fax-intake" aria-label="Client from fax">
    <p>Upload a fax, review the suggested fields, then create the client. The original fax will be encrypted and attached to their chart.</p>
    <label>Fax document (PDF, PNG, JPEG; up to 10 MB, 30 pages)
      <input type="file" accept="application/pdf,image/png,image/jpeg" :disabled="busy || !agencyId || !organizationId" @change="extract" />
    </label>
    <p v-if="!organizationId">Select the agency and organization above first.</p>
    <p v-if="busy" role="status">Reading fax pages and identifying fields…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="warning" role="status">{{ warning }}</p>
    <template v-if="draftId">
      <details v-if="previewUrl"><summary>View original fax</summary>
        <iframe v-if="previewType === 'application/pdf'" :src="previewUrl" title="Original fax" class="fax-preview" />
        <img v-else :src="previewUrl" alt="Original fax for field review" class="fax-preview" />
      </details>
      <details><summary>Read extracted source text</summary><div v-for="page in pages" :key="page.page"><strong>Page {{ page.page }}</strong><pre>{{ page.text }}</pre></div></details>
      <p>Check each value and its source. Change the field, edit the value, or ignore it. Each field can be assigned once.</p>
      <div v-for="row in rows" :key="row.id" class="mapping">
        <select v-model="row.field" :aria-label="`Field for ${row.id}`"><option value="">Ignore / unassigned</option><option v-for="(label,key) in fields" :key="key" :value="key">{{ label }}</option></select>
        <input v-model="row.value" aria-label="Extracted value" maxlength="2000" />
        <small v-if="row.evidence">Page {{ row.page }} · {{ row.confidence }} confidence · “{{ row.evidence }}”</small>
        <div class="suggest-buttons" v-if="/name/i.test(row.field) || !row.field">
          <button v-for="key in nameFields" :key="key" type="button" class="btn btn-secondary btn-sm" @click="row.field = key">{{ fields[key] }}</button>
        </div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" @click="addField">+ Add missing field</button>
      <p v-if="duplicates.length" role="alert">Assign each field only once: {{ duplicates.map(k => fields[k]).join(', ') }}.</p>
      <ReferralEntityPicker v-model="entryId" :agency-id="agencyId" />
      <label class="review"><input v-model="reviewed" type="checkbox" /> I checked the client, guardian, contact details, and referring organization against the fax.</label>
    </template>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
import ReferralEntityPicker from '../referralDirectory/ReferralEntityPicker.vue';
const props = defineProps({ agencyId: [String, Number], organizationId: [String, Number] });
const emit = defineEmits(['change']);
const draftId = ref(null), rows = ref([]), fields = ref({}), pages = ref([]), entryId = ref(null), reviewed = ref(false);
const previewUrl = ref(''), previewType = ref('');
const busy = ref(false), error = ref(''), warning = ref('');
const nameFields = ['client_full_name', 'guardian_full_name', 'guardian_first_name', 'guardian_last_name'];
const duplicates = computed(() => [...new Set(rows.value.map(r => r.field).filter((field, i, all) => field && all.indexOf(field) !== i))]);
const mapped = computed(() => Object.fromEntries(rows.value.filter(r => r.field && r.value.trim()).map(r => [r.field, r.value.trim()])));
let sequence = 0, draftAgency = null;
function discard() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
  if (draftId.value && draftAgency) api.delete(`/fax-intake/${draftId.value}`, { params: { agencyId: draftAgency }, skipGlobalLoading: true }).catch(() => {});
  draftId.value = null;
}
async function extract(event) {
  const file = event.target.files?.[0]; if (!file) return;
  const current = ++sequence; discard(); rows.value = []; reviewed.value = false; error.value = ''; warning.value = ''; busy.value = true;
  const agencyId = props.agencyId, organizationId = props.organizationId;
  try {
    const body = new FormData(); body.append('file', file);
    const { data } = await api.post('/fax-intake/extract', body, { params: { agencyId, organizationId }, timeout: 300000, headers: { 'Content-Type': undefined } });
    if (current !== sequence) { api.delete(`/fax-intake/${data.draftId}`, { params: { agencyId } }).catch(() => {}); return; }
    previewUrl.value = URL.createObjectURL(file); previewType.value = file.type;
    draftId.value = data.draftId; draftAgency = agencyId; rows.value = data.candidates; fields.value = data.fields; pages.value = data.pages; warning.value = data.warning || '';
  } catch (e) { if (current === sequence) error.value = e.response?.data?.error?.message || 'Could not read this fax. Please retry.'; }
  finally { if (current === sequence) busy.value = false; event.target.value = ''; }
}
function addField() { rows.value.push({ id: `manual-${Date.now()}-${rows.value.length}`, field: '', value: '' }); }
watch([rows, entryId], () => { reviewed.value = false; }, { deep: true, flush: 'sync' });
watch([mapped, reviewed, entryId, draftId, duplicates, busy], () => {
  const name = mapped.value.client_full_name || [mapped.value.client_first_name, mapped.value.client_last_name].filter(Boolean).join(' ');
  emit('change', { draftId: draftId.value, fields: mapped.value, entryId: entryId.value, reviewed: reviewed.value,
    ready: !!(draftId.value && name && entryId.value && reviewed.value && !duplicates.value.length && !busy.value), fullName: name });
}, { deep: true, immediate: true });
watch(() => [props.agencyId, props.organizationId], () => { sequence++; discard(); rows.value = []; pages.value = []; reviewed.value = false; busy.value = false; });
onBeforeUnmount(() => { sequence++; discard(); });
</script>
<style scoped>
.fax-preview { width:100%; min-height:400px; max-height:650px; object-fit:contain; border:0; }
.fax-intake { display:grid; gap:12px; padding:14px; border:1px solid var(--border-color,#ddd); border-radius:10px; margin:12px 0; } label { display:grid; gap:6px; } .mapping { display:grid; grid-template-columns:1fr 1fr; gap:8px; border-bottom:1px solid var(--border-color,#ddd); padding-bottom:12px; } .mapping small,.suggest-buttons { grid-column:1/-1; } .suggest-buttons { display:flex; flex-wrap:wrap; gap:5px; } input,select { min-width:0; max-width:100%; padding:8px; } pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:300px; overflow:auto; } .review { display:flex; align-items:flex-start; } p { margin:0; } @media(max-width:600px) { .mapping { grid-template-columns:1fr; } }
</style>
