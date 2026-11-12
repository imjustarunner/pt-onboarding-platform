<template><details v-if="items.length" class="pad-details"><summary>{{ label || 'View adjustment details' }}</summary><dl><template v-for="(item,index) in items" :key="index"><dt>{{ item.label }}</dt><dd>{{ item.value ?? '—' }}</dd></template></dl></details><span v-else>{{ label }}</span></template>
<script setup>
import { computed } from 'vue';
const props=defineProps({label:{type:String,default:''},details:{type:Array,default:()=>[]}});
const items=computed(()=>props.details.filter(x=>x&&x.label));
</script>
<style scoped>.pad-details summary{cursor:pointer;text-decoration:underline;text-underline-offset:3px}.pad-details dl{display:grid;grid-template-columns:minmax(110px,1fr) minmax(0,2fr);gap:6px 14px;padding:12px;background:var(--surface-alt,#f6f9fa);border-radius:8px}.pad-details dt{font-weight:600}.pad-details dd{margin:0;overflow-wrap:anywhere}</style>
