<template>
 <section id="our-organizations" class="ptco-band ptco-soft"><div class="ptco-wrap">
  <p class="ptco-eyebrow">Powered by PlotTwistCo</p><h2>Independent missions. Connected support.</h2>
  <p>Meet the organizations we support through management services and public websites.</p>
  <div class="ptco-three relationship-models"><article v-for="model in models" :key="model.name"><h3>{{model.name}}</h3><p>{{model.body}}</p></article></div>
  <p v-if="error" role="status">Our organization directory is temporarily unavailable. <button @click="load">Try again</button></p>
  <div class="partner-grid"><article v-for="partner in partners" :key="partner.slug" class="ptco-card partner-card">
   <component :is="partner.comingSoon ? 'div' : 'a'" :href="partner.comingSoon ? undefined : partner.url" :aria-label="partner.comingSoon ? undefined : `Visit ${partner.name}`">
    <img v-if="partner.logoUrl" :src="partner.logoUrl" :alt="partner.name" loading="lazy" @error="partner.logoUrl=null"/><span v-else class="partner-wordmark">{{partner.name}}</span>
   </component>
   <h3>{{partner.name}}</h3><span class="partner-relationship">{{partner.relationship === 'subsidiary' ? 'Subsidiary' : partner.relationship === 'affiliate' ? 'Affiliate' : 'Associate'}}</span>
   <ul><li v-for="industry in partner.industries" :key="industry">{{industry}}</li></ul>
   <p v-if="partner.comingSoon">Coming soon</p><a v-else :href="partner.url">Visit website →</a>
  </article></div>
 </div></section>
</template>
<script setup>
import {ref,onMounted} from 'vue';
import api from '../../services/api';
import {safeMarketingHref} from '../../utils/marketingPageQuality';
const partners=ref([]),error=ref(false);
const models=[{name:'Associate',body:'An independent business managed by PlotTwist under contract. PlotTwist holds no ownership.'},{name:'Affiliate',body:'A business in which PlotTwist holds an equity stake and provides management services.'},{name:'Subsidiary',body:'A majority-owned company within the PlotTwist umbrella. Subsidiaries receive management services within the affiliate scope.'}];
async function load(){error.value=false;try{const{data}=await api.get('/public/marketing-pages/partners',{skipAuthRedirect:true,skipGlobalLoading:true});partners.value=(data.partners||[]).map(p=>({...p,url:safeMarketingHref(p.url),logoUrl:safeMarketingHref(p.logoUrl)}));}catch{error.value=true;}}
onMounted(load);
</script>
<style scoped>
.relationship-models{margin:28px 0}.relationship-models article{border-top:2px solid #a22235;padding:16px 0}.partner-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:22px}.partner-card{display:flex;flex-direction:column;align-items:flex-start}.partner-card>a:first-child,.partner-card>div:first-child{display:flex;align-items:center;justify-content:center;min-height:100px;width:100%;background:white;border-radius:8px;padding:12px;box-sizing:border-box}.partner-card img{max-width:100%;height:80px;object-fit:contain}.partner-wordmark{font-size:24px;text-align:center}.partner-relationship{font-size:13px;padding:4px 10px;border-radius:20px;background:#f5e9ec;color:#8d1830}.partner-card ul{list-style:none;padding:0;font-size:14px;flex:1}.partner-card h3{margin-top:18px}
</style>
