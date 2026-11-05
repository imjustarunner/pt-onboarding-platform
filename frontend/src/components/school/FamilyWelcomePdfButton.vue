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
import { onBeforeUnmount, ref } from 'vue';
import api from '../../services/api';

const props = defineProps({ agencyId: [Number, String], label: { type: String, default: 'Preview my PDF' } });
const url = ref(''), loading = ref(false), error = ref('');

async function openPreview() {
  if (loading.value) return;
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get('/school-contact-plan/pdf-preview', { params: { agencyId: props.agencyId }, responseType: 'blob', skipGlobalLoading: true });
    close();
    url.value = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
  } catch {
    error.value = 'Your PDF could not be built. Please try again.';
  } finally {
    loading.value = false;
  }
}
function close() {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = '';
}
onBeforeUnmount(close);
</script>

<style scoped>
.fw-pdf-button{border:1px solid #c8d9d1;border-radius:9px;background:#eff8fd;color:#075c91;font:inherit;font-size:12px;font-weight:600;padding:9px 14px;cursor:pointer}
.fw-pdf-button:disabled{opacity:.6;cursor:wait}
.fw-pdf-error{color:#9c3a37;font-size:12px;margin:6px 0 0}
.fw-pdf-shade{position:fixed;inset:0;z-index:18000;display:grid;place-items:center;background:#102e5399;padding:20px}
.fw-pdf-dialog{display:flex;flex-direction:column;width:min(900px,100%);height:min(92dvh,1000px);background:#fff;border-radius:16px;overflow:hidden}
.fw-pdf-dialog header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #e3ece7;color:#102e53}
.fw-pdf-dialog header span{display:flex;gap:12px;align-items:center}
.fw-pdf-dialog header a,.fw-pdf-dialog header button{font:inherit;font-size:13px;color:#075c91;background:none;border:0;cursor:pointer;text-decoration:none}
.fw-pdf-dialog iframe{flex:1;border:0;width:100%}
</style>
