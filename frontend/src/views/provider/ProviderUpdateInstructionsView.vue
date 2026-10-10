<template>
 <main class="instruction-library">
  <span class="eyebrow">PROVIDER UPDATE · INSTRUCTIONS</span>
  <p v-if="loading" role="status">Loading your instructions…</p><p v-if="error" role="alert">{{error}}</p>
  <template v-if="bundle">
   <h1>{{bundle.section.title}}</h1><p>{{bundle.section.description}}</p>
   <p class="completion-note">These instructions are available after you finish your update. Viewing them does not change your completed sections.</p>
   <ProviderUpdateTrainingGuides :guides="bundle.guides" :base="''" :endpoint="endpoint" :agency-id="bundle.agencyId" :section-key="sectionKey" :initial-guide-id="String(route.query.guide || '')" />
   <p v-if="!bundle.guides.length">No instructions are currently attached to this section.</p>
  </template>
 </main>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import {useRoute} from 'vue-router';
import api from '../../services/api';
import ProviderUpdateTrainingGuides from '../../components/provider/ProviderUpdateTrainingGuides.vue';
const route=useRoute(),bundle=ref(null),error=ref(''),loading=ref(false);
const sectionKey=computed(()=>String(route.params.sectionKey||''));
const endpoint=computed(()=>`/provider-update/instructions/${encodeURIComponent(route.params.pushId)}/${encodeURIComponent(sectionKey.value)}`);
watch(endpoint,async url=>{loading.value=true;bundle.value=null;error.value='';try{bundle.value=(await api.get(url)).data;}catch(e){error.value=e.response?.data?.error?.message||'Unable to load instructions. Please sign in to the account that received this update.';}finally{loading.value=false;}},{immediate:true});
</script>
<style scoped>.instruction-library{max-width:940px;margin:40px auto;padding:36px;background:white;border:1px solid #dae4ec;border-radius:22px;color:#243f4e}.eyebrow{font-size:12px;letter-spacing:.12em;font-weight:700;color:#527183}h1{font-size:34px}.completion-note{background:#edf6f3;padding:18px;border-radius:12px}</style>
