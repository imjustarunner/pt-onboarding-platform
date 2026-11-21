<template>
  <div class="record-downloads">
    <button v-if="noteId" type="button" :disabled="busy || !agencyId" @click="download('note')">{{ busy === 'note' ? 'Preparing PDF…' : 'Download note PDF' }}</button>
    <button v-else-if="draftId" type="button" :disabled="busy || !agencyId" @click="download('draft')">{{ busy === 'draft' ? 'Preparing draft PDF…' : 'Download draft PDF' }}</button>
    <button v-if="planId" type="button" :disabled="busy || !agencyId" @click="download('plan')">Download treatment plan PDF</button>
    <button v-else-if="clientId" type="button" :disabled="busy || !agencyId" @click="download('record')">{{ busy === 'record' ? 'Preparing medical record…' : 'Download full medical record' }}</button>
    <details v-if="clientId && !planId"><summary>Record export options</summary><label><input v-model="includeDrafts" type="checkbox" /> Include clearly marked unsigned drafts and proposed amendments</label><div class="dates"><label>From (optional)<input v-model="from" type="date" /></label><label>Through (optional)<input v-model="to" type="date" /></label></div><small>Signed amendments and linked supporting files are included. Unavailable or restricted files are identified in the attachment manifest.</small></details>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<script setup>
import { confirmRecordDownload, RECORD_DOWNLOAD_NOTICE_VERSION } from '../../utils/recordDownloadNotice';
import { ref } from 'vue';
import api from '../../services/api';
const props = defineProps({ planId: { type:[Number,String], default:null }, agencyId: { type: [Number, String], required: true }, clientId: { type: [Number, String], default: null }, noteId: { type: [Number, String], default: null }, draftId: { type: [Number, String], default: null } });
const busy = ref(''), error = ref(''), includeDrafts = ref(false), from = ref(''), to = ref('');
async function download(kind) {
  if (!confirmRecordDownload()) return;
  busy.value = kind; error.value = '';
  try {
    const endpoint = kind === 'plan' ? `/medical-billing/clients/${props.clientId}/plans/${props.planId}/pdf` : kind === 'draft' ? `/clinical-notes/drafts/${props.draftId}/pdf` : kind === 'note' ? `/medical-billing/notes/${props.noteId}/pdf` : `/medical-billing/clients/${props.clientId}/record-pdf`;
    const { data, headers } = await api.get(endpoint, { params: { agencyId: Number(props.agencyId), includeDrafts: includeDrafts.value || undefined, from: from.value || undefined, to: to.value || undefined }, responseType: 'blob', headers: { 'X-Record-Download-Notice': RECORD_DOWNLOAD_NOTICE_VERSION } });
    const url = URL.createObjectURL(data), anchor = document.createElement('a');
    anchor.href = url; anchor.download = kind === 'plan' ? (/filename="([A-Za-z0-9-]+\.pdf)"/i.exec(headers?.['content-disposition'] || '')?.[1] || 'treatmentplan.pdf') : kind === 'draft' ? `workspace-draft-${props.draftId}.pdf` : kind === 'note' ? `clinical-note-${props.noteId}.pdf` : `medical-record-${props.clientId}.pdf`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    let message = err.response?.data?.error?.message;
    if (!message && err.response?.data instanceof Blob) { try { message = JSON.parse(await err.response.data.text()).error?.message; } catch { /* Do not expose private transport details. */ } }
    error.value = message || 'The PDF could not be prepared. Your clinical record has not changed.';
  } finally { busy.value = ''; }
}
</script>
<style scoped>
.record-downloads{display:flex;align-items:start;gap:10px;flex-wrap:wrap;margin:14px 0}.record-downloads button{border:1px solid #aac0d1;border-radius:9px;padding:10px 14px;background:#edf5fb;color:#174d7b;font:inherit;cursor:pointer}.record-downloads button:disabled{opacity:.55;cursor:default}details{width:100%;color:#526b80;font-size:.9em}summary{cursor:pointer}label{display:flex;gap:8px;margin:10px 0}.dates{display:flex;gap:18px}.dates label{flex-direction:column}input[type=date]{border:1px solid #bbcbd6;border-radius:7px;padding:8px}p[role=alert]{color:#a52d25;width:100%}
</style>
