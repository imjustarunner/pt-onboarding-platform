<template><span class="organization-badge" :title="name"><img v-if="url&&!failed" :src="url" alt="" @error="failed=true"><span v-else class="organization-fallback" aria-hidden="true">{{initials}}</span><span>{{name||'Organization not recorded'}}</span></span></template>
<script setup>
import {computed,ref,watch} from 'vue';
import {toUploadsUrl} from '../../utils/uploadsUrl';
const props=defineProps({name:String,icon:String});
const failed=ref(false),url=computed(()=>toUploadsUrl(props.icon)),initials=computed(()=>String(props.name||'?').split(/\s+/).map(part=>part[0]).slice(0,2).join(''));
watch(()=>props.icon,()=>failed.value=false);
</script>
<style scoped>.organization-badge{display:inline-flex;align-items:center;gap:7px;max-width:100%;font-size:12px;color:#435c78;line-height:1.4}.organization-badge img,.organization-fallback{width:24px;height:24px;flex:none;object-fit:contain}.organization-fallback{display:grid;place-items:center;border-radius:6px;background:#e8f0fa;color:#245888;font-size:10px;font-weight:700}.organization-badge>span:last-child{overflow-wrap:anywhere}</style>
