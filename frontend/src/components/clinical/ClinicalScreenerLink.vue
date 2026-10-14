<template>
 <section v-if="matchesSuicideScreener(search)" class="screener-entry" aria-label="Suicide ideation screening">
  <div><span>Clinical screening</span><h3>{{ suicideScreener.title }}</h3><p>{{ suicideScreener.description }}</p></div>
  <router-link :to="screenerLocation(prefix,clientId)">Open screener →</router-link>
 </section>
</template>
<script setup>
import {computed} from 'vue';
import {useRoute} from 'vue-router';
import {suicideScreener,matchesSuicideScreener,screenerLocation} from '../../utils/clinicalScreeners';
defineProps({search:{type:String,default:''},clientId:[Number,String]});
const route=useRoute();
const prefix=computed(()=>route.params.organizationSlug?`/${route.params.organizationSlug}`:'');
</script>
<style scoped>
.screener-entry{display:flex;align-items:center;justify-content:space-between;gap:20px;border:1px solid #cadbd2;border-radius:10px;padding:18px;background:#f5f9f6;margin:16px 0;grid-column:1/-1}.screener-entry span{font-size:11px;color:#48695b;text-transform:uppercase;letter-spacing:.08em}.screener-entry h3{font-size:17px;margin:6px 0}.screener-entry p{font-size:13px;margin:0;line-height:1.6}.screener-entry a{white-space:nowrap;padding:12px 16px;background:#175b48;color:white;border-radius:7px;text-decoration:none}@media(max-width:650px){.screener-entry{align-items:flex-start;flex-direction:column}}
</style>
