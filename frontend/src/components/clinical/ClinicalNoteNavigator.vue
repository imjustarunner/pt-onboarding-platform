<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

const nav = ref(null);
const links = ref([]);
const active = ref('');
const order = ['Encounter details', 'Diagnoses', 'Mental status', 'Risk assessment', 'Treatment plan', 'Subjective', 'Objective', 'Interventions', 'Plan', 'Assessments', 'Confidential addendums', 'Signature'];
let observer;
let workspace;
let frame;

function updateLinks() {
  const found = new Map();
  for (const target of workspace.querySelectorAll('[data-note-section]')) {
    const label = target.dataset.noteSection;
    if (!label || found.has(label)) continue;
    found.set(label, target);
  }
  const next = order.filter(label => found.has(label)).map(label => ({ label, target: found.get(label) }));
  if (next.length !== links.value.length || next.some((link, index) => link.target !== links.value[index].target)) {
    links.value = next;
  }
}

function jump({ label, target }) {
  active.value = label;
  for (let element = target; element && element !== workspace; element = element.parentElement) {
    if (element.tagName === 'DETAILS') element.open = true;
  }
  target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  target.scrollIntoView?.({ block: 'start' });
}

onMounted(() => {
  workspace = nav.value.closest('[data-note-workspace]');
  if (!workspace) return;
  updateLinks();
  observer = new MutationObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = null; updateLinks(); });
  });
  observer.observe(workspace, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-note-section'] });
});
onBeforeUnmount(() => {
  observer?.disconnect();
  if (frame) cancelAnimationFrame(frame);
});
</script>

<template>
  <nav ref="nav" class="note-navigator" aria-label="Jump to note section" :hidden="!links.length">
    <button v-for="link in links" :key="link.label" type="button" :aria-current="active===link.label?'location':undefined" @click="jump(link)">{{ link.label }}</button>
  </nav>
</template>

<style scoped>
.note-navigator{position:sticky;top:var(--note-navigation-top,0px);z-index:8;display:flex;gap:4px;overflow-x:auto;max-width:100%;min-width:0;padding:4px 0;background:#fff;border-block:1px solid #cbd9e5;scrollbar-width:thin}
.note-navigator[hidden]{display:none}
.note-navigator button{flex:none;white-space:nowrap;min-height:36px;padding:4px 8px;background:transparent;color:#194e77;border:1px solid transparent;border-radius:4px;font:inherit;font-size:.78rem;cursor:pointer}
.note-navigator button:hover,.note-navigator button[aria-current]{background:#edf4fa;border-color:#c3d7e7}
@media print{.note-navigator{display:none}}
</style>
