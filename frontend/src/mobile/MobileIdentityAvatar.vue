<script setup>
import {ref,watch} from 'vue';
const props=defineProps({photo:String,agencyIcon:String,name:String,privateIdentity:Boolean});
const failed=ref(false);watch(()=>props.photo,()=>failed.value=false);
const initials=()=>String(props.name||'?').split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
</script>
<template><span class="mobile-identity-avatar"><span class="identity-picture"><img v-if="photo && !privateIdentity && !failed" :src="photo" alt="" @error="failed=true"/><img v-else-if="agencyIcon" :src="agencyIcon" alt="" class="agency-picture"/><span v-else>{{ privateIdentity?'•':initials() }}</span></span><img v-if="agencyIcon && photo && !privateIdentity && !failed" class="identity-agency" :src="agencyIcon" :alt="'Agency'"/></span></template>
<style scoped>.mobile-identity-avatar{display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;width:40px}.identity-picture{width:40px;height:40px;border-radius:13px;background:#eef3fc;display:grid;place-items:center;overflow:hidden;color:#3869ad;font-size:12px;font-weight:700}.identity-picture>img{width:100%;height:100%;object-fit:cover}.identity-picture>img.agency-picture{object-fit:contain;padding:4px;box-sizing:border-box;background:white}.identity-agency{width:18px;height:18px;object-fit:contain}.identity-picture>span{font:inherit}</style>
