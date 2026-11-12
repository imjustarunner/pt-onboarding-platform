<template>
  <button type="button" class="fw-pdf-button" :disabled="loading" @click="openPreview">
    {{ loading ? 'Building your PDF…' : label }}
  </button>
  <p v-if="error" role="alert" class="fw-pdf-error">{{ error }}</p>
  <Teleport to="body">
    <div v-if="url" class="fw-pdf-shade" @click.self="close" @keydown.esc="close">
      <section class="fw-pdf-dialog" role="dialog" aria-modal="true" aria-label="Your introduction PDF">
        <header>
          <strong>Your introduction PDF</strong>
          <span>
            <a :href="url" target="_blank" rel="noopener">Open in new tab</a>
            <a :href="url" download="School introduction.pdf">Download</a>
            <button type="button" @click="close">Close</button>
          </span>
        </header>
        <iframe :src="url" title="Your introduction PDF preview"></iframe>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({ agencyId: [Number, String], schoolId: [Number, String], label: { type: String, default: 'Preview my PDF' } });
const url = ref(''), loading = ref(false), error = ref('');

let version = 0;
async function pdfErrorMessage(e) {
  let data = e?.response?.data;
  if (data instanceof Blob && data.type.includes('json')) {
    try { data = JSON.parse(await data.text()); } catch { /* Use the fallback below. */ }
  }
  const code = data?.error?.code;
  if (code === 'MFA_REQUIRED') return 'Complete your sign-in verification, then preview your PDF again.';
  if (code === 'SESSION_LOCKED' || code === 'SESSION_EXPIRED') return 'Unlock or sign in to your workspace, then try the preview again.';
  if (code === 'ACTIVITY_REVIEW_REQUIRED') return 'Your account needs a file-access review. Contact support if this introduction preview is still blocked.';
  return data?.error?.message || 'Your introduction PDF could not be opened. Please try again or contact support.';
}
async function openPreview() {
  if (loading.value) return;
  const request = ++version;
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get('/school-contact-plan/pdf-preview', { params: { agencyId: props.agencyId, ...(props.schoolId ? { schoolId: props.schoolId } : {}) }, responseType: 'blob', skipGlobalLoading: true });
    if (request !== version) return;
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
    if (await blob.slice(0,5).text() !== '%PDF-') throw { response: { data: { error: { message: 'The preview did not return a PDF. Refresh your workspace and try again.' } } } };
    if (request !== version) return;
    close(); url.value = URL.createObjectURL(blob);
  } catch (e) {
    const message = await pdfErrorMessage(e);
    if (request === version) error.value = message;
  } finally {
    if (request === version) loading.value = false;
  }
}
function close() {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = '';
}
watch(() => [props.agencyId, props.schoolId], () => { version++; loading.value = false; error.value = ''; close(); });
onBeforeUnmount(() => { version++; close(); });
</script>

<style scoped>
.fw-pdf-button{border:1px solid #c8d9d1;border-radius:9px;background:#eff8fd;color:#075c91;font:inherit;font-size:12px;font-weight:600;padding:9px 14px;cursor:pointer}
.fw-pdf-button:disabled{opacity:.6;cursor:wait}
.fw-pdf-error{color:#9c3a37;font-size:12px;margin:6px 0 0}
.fw-pdf-shade{position:fixed;inset:0;z-index:18000;display:grid;place-items:center;background:#102e5399;padding:20px}
.fw-pdf-dialog{display:flex;flex-direction:column;width:min(900px,100%);height:min(92dvh,1000px);background:#fff;border-radius:16px;overflow:hidden}
.fw-pdf-dialog header{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #e3ece7;color:#102e53}
.fw-pdf-dialog header span{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.fw-pdf-dialog header a,.fw-pdf-dialog header button{font:inherit;font-size:13px;color:#075c91;background:none;border:0;cursor:pointer;text-decoration:none}
.fw-pdf-dialog iframe{flex:1;border:0;width:100%}
</style>
