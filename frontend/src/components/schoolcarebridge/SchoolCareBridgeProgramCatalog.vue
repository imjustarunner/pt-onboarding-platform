<template>
 <section class="scb-section scb-program-catalog">
  <p class="scb-eyebrow">Programs & workshops</p><h2>Find support for your school community.</h2>
  <p>Explore programs by audience and region. Request a school booking, ask about travel, or register for a published session.</p>
  <div class="scb-catalog-filters"><label>Audience<select v-model="audience"><option value="">All audiences</option><option v-for="(label,key) in audiences" :key="key" :value="key">{{label}}</option></select></label><label>Region<select v-model="region"><option value="">All regions</option><option v-for="r in regions" :key="r">{{r}}</option></select></label><label>Program type<select v-model="kind"><option value="">All program types</option><option v-for="(label,key) in types" :key="key" :value="key">{{label}}</option></select></label></div>
  <p v-if="loading" role="status">Loading programs…</p><p v-else-if="error" role="alert">{{error}} <button @click="load">Try again</button></p>
  <div v-else class="scb-catalog-grid"><article v-for="p in filtered" :key="p.id"><p class="scb-eyebrow">{{p.typeLabel}}</p><h3>{{p.title}}</h3><p>{{p.description}}</p><dl><dt>For</dt><dd>{{audiences[p.audience]}}</dd><dt>Offered by</dt><dd>{{p.ownerName}}</dd><dt>Presented by</dt><dd>{{p.presenterName}}</dd><dt>Regions</dt><dd>{{p.regions.join(' · ')}}</dd><dt>Format</dt><dd>{{p.deliveryMode.replaceAll('_',' ')}} · {{p.durationMinutes}} minutes · Up to {{p.capacity}} people</dd><dt>Funding</dt><dd>{{p.fundingMode==='grant'?'Grant funding — approval required':p.fundingMode==='mixed'?'Cash or approved funding':p.fundingMode==='free'?'No school charge — booking approval required':p.priceCents==null?'Request a quote':money(p.priceCents)}}</dd><template v-if="p.sponsorName"><dt>Supported by</dt><dd>{{p.sponsorName}}</dd></template></dl><p v-if="p.presenterBio">{{p.presenterBio}}</p><div class="scb-actions"><router-link class="scb-button" :to="{path:'/schoolcarebridge/app/operations',query:{program:p.id}}">Request a school booking →</router-link><a v-if="p.registrationPublicKey" class="scb-button scb-outline" :href="registrationUrl(p.registrationPublicKey)">Register for a session</a></div><small>{{p.travelAvailable?'Outside this region? Include a travel inquiry with your request.':'Availability and the final quote are confirmed by MH4Kidz.'}}</small></article><p v-if="!filtered.length">{{programs.length?'No programs match these filters. Try another audience or region.':'Programs are being prepared. Published offerings will appear here when they are ready for inquiries or registration.'}}</p></div>
  <router-link to="/schoolcarebridge/app/operations">My bookings, invoices & receipts →</router-link>
 </section>
</template>
<script setup>
import {computed,onMounted,ref} from 'vue';
import api from '../../services/api';
import {buildPublicIntakeUrl} from '../../utils/publicIntakeUrl';
const programs=ref([]),loading=ref(true),error=ref(''),audience=ref(''),region=ref(''),kind=ref('');
const audiences={students:'Students',parents:'Parents & families',staff:'School staff',school_wide:'School-wide'},types={original:'MH4Kidz Original',partner:'Community Partner',managed:'SchoolCareBridge Managed',sponsored:'MH4Kidz Sponsored'};
const regions=computed(()=>[...new Set(programs.value.flatMap(p=>p.regions))].sort());
const filtered=computed(()=>programs.value.filter(p=>(!audience.value||p.audience===audience.value)&&(!region.value||p.regions.includes(region.value))&&(!kind.value||p.programType===kind.value)));
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100),registrationUrl=buildPublicIntakeUrl;
async function load(){loading.value=true;error.value='';try{programs.value=(await api.get('/schoolcarebridge/programs',{skipAuthRedirect:true})).data.programs;}catch{error.value='The program catalog is temporarily unavailable.';}finally{loading.value=false;}}
onMounted(load);
</script>
<style scoped>
.scb-catalog-filters{display:flex;gap:20px;flex-wrap:wrap;margin:28px 0}.scb-catalog-filters label{display:grid;gap:7px;flex:1;min-width:180px}select{padding:12px;border:1px solid #adbdc8;border-radius:8px;background:white;color:#172e48}.scb-catalog-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:24px;margin-bottom:24px}.scb-catalog-grid article{border:1px solid #d4e3e7;border-radius:20px;padding:28px;background:#fff;box-shadow:0 8px 22px #1a486008}.scb-catalog-grid dl{display:grid;grid-template-columns:110px 1fr;gap:9px;font-size:14px}.scb-catalog-grid dt{font-weight:700}.scb-catalog-grid dd{margin:0}.scb-catalog-grid small{display:block;margin-top:18px;line-height:1.5}
</style>
