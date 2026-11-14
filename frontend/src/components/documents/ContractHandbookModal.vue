<template>
  <Teleport to="body"><div v-if="open" class="contract-handbook-overlay" @click.self="$emit('close')">
    <section ref="dialog" class="contract-handbook-modal" :style="brandStyle" role="dialog" aria-modal="true" aria-labelledby="contract-handbook-title" @keydown="handleKeys">
      <header><div><p>{{ reference?.agency?.name || 'Workplace handbook' }}</p><h2 id="contract-handbook-title">{{ reference?.section?.title || sectionTitle || 'Handbook reference' }}</h2></div><button ref="closeButton" type="button" aria-label="Close handbook reference" @click="$emit('close')">Close ×</button></header>
      <div class="reference-body">
        <p v-if="loading" role="status">Opening the referenced handbook section…</p>
        <div v-else-if="error" role="alert"><p>{{ error }}</p><button type="button" @click="load">Try again</button></div>
        <template v-else-if="reference">
          <div class="reference-location"><strong>{{ reference.document?.title || 'Workplace Handbook' }} · Version {{ reference.version.number }}</strong><span>{{ locationText }}</span><span v-if="reference.section.sourcePage">Source page {{ reference.section.sourcePage }}</span><span>Section: {{ reference.section.slug }}</span></div>
          <button v-if="viewSlug !== sectionSlug" type="button" @click="viewSlug = sectionSlug; load()">Back to the cited section</button>
          <article class="reference-prose" v-html="safeBody" @click="followReference" />
        </template>
      </div>
      <footer><p>Handbook reference · Reading this section leaves your agreement and signing progress in place.</p><button type="button" @click="$emit('close')">{{ returnLabel }}</button></footer>
    </section>
  </div></Teleport>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import DOMPurify from 'dompurify';
import api from '../../services/api';
import { documentBrandStyle } from '../../utils/documentBranding.js';
import { handbookSectionFromHref } from '../../utils/contractHandbookReferences.js';
import '../../styles/document-agency-brand.css';
const props = defineProps({ open: Boolean, agencyId: [Number, String], sectionSlug: String, expectedVersionId: [Number, String], sectionTitle: String, http: Object, portalToken: String, returnLabel: { type: String, default: 'Return to agreement' } });
defineEmits(['close']);
const dialog = ref(null), closeButton = ref(null), reference = ref(null), loading = ref(false), error = ref('');
const viewSlug = ref(props.sectionSlug || '');
let generation = 0, previousFocus, previousOverflow = '', locked = false;
const brandStyle = computed(() => documentBrandStyle(reference.value?.metadata || {}));
const locationText = computed(() => (reference.value?.location || []).map(item => item.title).join(' › '));
const safeBody = computed(() => DOMPurify.sanitize(reference.value?.section?.bodyHtml || ''));
async function load() {
  if (!props.open || !viewSlug.value) return;
  const requestedSlug = viewSlug.value;
  const request = ++generation; loading.value = true; error.value = ''; reference.value = null;
  try {
    const url = props.portalToken ? `/prehire-portal/${encodeURIComponent(props.portalToken)}/resources/handbook/reference` : '/provider-update/handbook/reference';
    const { data } = await (props.http || api).get(url, { params: { ...(props.portalToken ? {} : { agencyId: Number(props.agencyId) }), slug: requestedSlug, versionId: Number(props.expectedVersionId) } });
    if (request !== generation || !props.open) return;
    const found = data?.reference;
    if (!found || found.section?.slug !== requestedSlug || (Number(props.agencyId) > 0 && Number(found.agency?.id) !== Number(props.agencyId)) || Number(found.version?.id) !== Number(props.expectedVersionId)) throw new Error('REFERENCE_MISMATCH');
    reference.value = found;
  } catch (cause) {
    if (request === generation) error.value = cause.message === 'REFERENCE_MISMATCH' ? 'The returned section did not match the agreement reference. Please contact People Operations.' : cause.response?.data?.error?.message || 'This referenced handbook section could not be opened. Your signing progress is preserved.';
  } finally { if (request === generation) loading.value = false; }
}
function followReference(event) {
  const link = event.target.closest?.('a[href]');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  const section = handbookSectionFromHref(href, { agency: reference.value?.agency });
  if (section) { event.preventDefault(); viewSlug.value = section; load(); }
  else { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
}
function handleKeys(event) {
  if (event.key === 'Escape') { event.preventDefault(); closeButton.value?.click(); return; }
  if (event.key !== 'Tab') return;
  const controls = [...dialog.value.querySelectorAll('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]')].filter(el => el.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
watch(() => [props.open, props.agencyId, props.sectionSlug, props.expectedVersionId, props.portalToken], async () => {
  if (!props.open) { generation++; if (locked) { document.body.style.overflow = previousOverflow; previousFocus?.focus?.(); locked = false; } return; }
  if (!locked) { previousFocus = document.activeElement; previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; locked = true; }
  viewSlug.value = props.sectionSlug || '';
  load(); await nextTick(); closeButton.value?.focus();
}, { immediate: true });
onBeforeUnmount(() => { generation++; if (locked) { document.body.style.overflow = previousOverflow; previousFocus?.focus?.(); } });
</script>
<style scoped>
.contract-handbook-overlay{position:fixed;inset:0;z-index:24000;background:#101b2a99;display:flex;align-items:center;justify-content:center;padding:clamp(10px,3vw,32px)}.contract-handbook-modal{width:min(100%,940px);max-height:92dvh;display:flex;flex-direction:column;overflow:hidden;border-radius:14px;border:1px solid var(--doc-line);background:white;color:var(--doc-ink);box-shadow:0 20px 80px #0004;font:14px/1.7 system-ui,sans-serif}.contract-handbook-modal header{display:flex;align-items:start;justify-content:space-between;gap:18px;padding:22px 26px;background:var(--doc-tint);border-bottom:3px solid var(--doc-primary)}header p{font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin:0;color:var(--doc-muted)}h2{font-size:23px;line-height:1.3;margin:6px 0 0}.reference-body{overflow:auto;overscroll-behavior:contain;min-height:150px;padding:24px 28px}.reference-location{display:grid;gap:4px;font-size:12px;color:var(--doc-muted);padding-bottom:20px;margin-bottom:20px;border-bottom:1px solid var(--doc-line)}.reference-location strong{color:var(--doc-ink)}.reference-prose{overflow-wrap:anywhere}.reference-prose :deep(table){display:block;max-width:100%;overflow:auto;border-collapse:collapse;font-size:12px}.reference-prose :deep(td),.reference-prose :deep(th){border:1px solid var(--doc-line);padding:10px;vertical-align:top}.reference-prose :deep(th){background:var(--doc-tint)}.reference-prose :deep(a){color:var(--doc-ink);text-decoration:underline}.reference-prose :deep(h1),.reference-prose :deep(h2),.reference-prose :deep(h3),.reference-prose :deep(h4){color:var(--doc-ink);line-height:1.4}.contract-handbook-modal footer{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:16px 24px;border-top:1px solid var(--doc-line);background:var(--doc-tint)}footer p{font-size:11px;color:var(--doc-muted);margin:0;max-width:580px}.contract-handbook-modal button{font:inherit;font-size:12px;border:1px solid var(--doc-line);border-radius:7px;background:white;color:var(--doc-ink);padding:9px 13px;cursor:pointer;white-space:nowrap}.contract-handbook-modal button:focus-visible{outline:3px solid var(--doc-accent);outline-offset:3px}@media(max-width:600px){.contract-handbook-overlay{padding:8px}.contract-handbook-modal{max-height:96dvh}.contract-handbook-modal header,.reference-body{padding:18px}h2{font-size:20px}.contract-handbook-modal footer{padding:14px;flex-wrap:wrap}.contract-handbook-modal footer button{width:100%}}
</style>
