<script setup>
import { ref } from 'vue';

defineProps({
  sections: { type: Object, required: true },
  encounter: { type: Object, default: () => ({}) }
});
const dialog = ref(null);
function open() {
  if (typeof dialog.value.showModal === 'function') dialog.value.showModal();
  else dialog.value.setAttribute('open', '');
}
function close() {
  if (typeof dialog.value.close === 'function') dialog.value.close();
  else dialog.value.removeAttribute('open');
}
</script>

<template>
  <button type="button" class="chart-preview-button" @click="open">Preview finalized note</button>
  <dialog ref="dialog" class="chart-preview" aria-label="Chart note preview">
    <header><h2>Chart note preview</h2><button type="button" @click="close">Close preview</button></header>
    <p>Unsigned · Review what will be saved to the chart.</p>
    <dl><template v-for="(value, label) in encounter" :key="label">
      <div v-if="value"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
    </template></dl>
    <section v-for="(text, title) in sections" :key="title">
      <h3>{{ title }}</h3><p>{{ text }}</p>
    </section>
  </dialog>
</template>

<style scoped>
.chart-preview-button,.chart-preview button{font:inherit;color:#174f75;border:1px solid #9cb9d1;border-radius:8px;background:#f3f7fc;padding:9px 12px;cursor:pointer}
.chart-preview{width:min(780px,calc(100% - 32px));max-height:85dvh;box-sizing:border-box;border:1px solid #c9d6e4;border-radius:12px;color:#173754;background:white;padding:22px;overflow:auto}
.chart-preview::backdrop{background:#12263c88}
.chart-preview header,.chart-preview dl{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.chart-preview h2,.chart-preview h3,.chart-preview dd{margin:0}
.chart-preview dt{font-weight:700}
.chart-preview section{border-top:1px solid #dce5ee;padding:14px 0}
.chart-preview section p{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0 0}
</style>
