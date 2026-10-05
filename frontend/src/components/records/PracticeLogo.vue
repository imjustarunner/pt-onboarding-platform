<template>
  <span class="practice-logo"><img v-if="practice.logoUrl && !failed" :src="practice.logoUrl" alt="" referrerpolicy="no-referrer" @error="failed=true" /><span v-else aria-hidden="true">{{ practice.name?.split(/\s+/).map(w=>w[0]).slice(0,3).join('') }}</span></span>
</template>
<script setup>
import { ref, watch } from 'vue';
const props=defineProps({practice:{type:Object,required:true}});
const failed=ref(false);
watch(()=>props.practice.logoUrl,()=>{failed.value=false;});
</script>
<style scoped>
.practice-logo{display:inline-flex;width:64px;height:52px;flex-shrink:0;align-items:center;justify-content:center;background:#fff;border:1px solid #e3eaf3;border-radius:8px;padding:5px;color:#263958;font-size:15px;font-weight:700}.practice-logo img{width:100%;height:100%;object-fit:contain}
</style>
