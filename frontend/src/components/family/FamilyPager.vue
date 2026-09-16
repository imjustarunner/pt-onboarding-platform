<template>
  <section class="family-card" :aria-label="title">
    <header><h2>{{ title }}</h2><span class="family-pager-controls" v-if="pages.length > 1"><button @click="move(-1)" :aria-label="`Previous ${title} page`">‹</button><span>{{ pages[current] }}</span><button @click="move(1)" :aria-label="`Next ${title} page`">›</button></span></header>
    <div ref="track" class="family-pages" @scroll.passive="onScroll">
      <div v-for="(page, index) in pages" :key="index" class="family-page"><slot :page="page" :index="index" /></div>
    </div>
    <div v-if="pages.length > 1" class="family-dots"><button v-for="(p,i) in pages" :key="i" :class="{ active: current===i }" :aria-label="p" :aria-pressed="current===i" @click="go(i)" /></div>
  </section>
</template>
<script setup>
import { ref } from 'vue';
const props = defineProps({ title: String, pages: { type: Array, default: () => ['Overview'] } });
const current = ref(0), track = ref(null);
function go(i) { track.value?.scrollTo({ left: i * track.value.clientWidth, behavior: 'smooth' }); }
function move(delta) { go((current.value + delta + props.pages.length) % props.pages.length); }
function onScroll() { if (track.value?.clientWidth) current.value = Math.round(track.value.scrollLeft / track.value.clientWidth); }
</script>
<style scoped>
.family-pages{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}.family-pages::-webkit-scrollbar{display:none}.family-page{flex:0 0 100%;min-width:0;scroll-snap-align:start;padding:2px;box-sizing:border-box}.family-pager-controls{display:flex;align-items:center;gap:8px;font-size:11px;color:#85889d}.family-pager-controls button{border:0;background:#f0f0f9;border-radius:50%;width:26px;height:26px;color:#6567c6;font-size:21px}.family-dots{display:flex;justify-content:center;gap:6px;padding-top:14px}.family-dots button{width:6px;height:6px;border:0;border-radius:8px;padding:0;background:#dcddeb}.family-dots button.active{width:19px;background:#7976d7}
</style>
