<template>
 <section class="school-search" aria-label="Find support at your school">
  <h2>Find support at your school</h2>
  <p>Choose the school your student attends to find its ITSCO team and enrollment options. Our school team coordinates placement and appointments after enrollment.</p>
  <label>Search schools<input v-model="search" type="search" placeholder="Enter your school’s name"/></label>
  <div class="school-options" role="group" aria-label="Schools">
   <button v-for="item in matchingSchools" :key="item.id" :aria-pressed="String(item.id)===String(modelValue)" @click="$emit('update:modelValue',String(item.id))">{{item.name}}</button>
  </div>
  <p v-if="!matchingSchools.length">No matching schools. <router-link to="/itsco/school-referral">Use our school enrollment finder →</router-link></p>
  <section v-if="selectedSchool" class="school-details">
   <h3>{{selectedSchool.name}}</h3>
   <p>If your student attends this school, start here. Submitting enrollment does not reserve a provider or appointment.</p>
   <a v-if="selectedSchool.intakePublicKey" class="its-button" :href="buildPublicIntakeUrl(selectedSchool.intakePublicKey)">Start enrollment at {{selectedSchool.name}} →</a>
   <router-link v-else class="its-button" to="/itsco/school-referral">Find enrollment for your school →</router-link>
   <h4>Your school’s ITSCO team</h4>
   <p v-if="loading" role="status">Loading the school team…</p>
   <div v-else-if="schoolProviders.length" class="school-team">
    <article v-for="provider in schoolProviders" :key="provider.id">
     <img v-if="provider.photoUrl" :src="provider.photoUrl" :alt="provider.displayName" loading="lazy"/>
     <div><strong>{{provider.displayName}}<template v-if="provider.credential">, {{provider.credential}}</template></strong><p>{{provider.title}}</p><router-link :to="{path:providerProfilePath(provider),query:{setting:'school',school:String(selectedSchool.id)}}">View profile →</router-link></div>
    </article>
   </div>
   <p v-else>Our team can help with enrollment and confirm who serves this school.</p>
  </section>
  <p v-else class="school-hint">Select a school to see its team and enrollment options.</p>
 </section>
</template>
<script setup>
import {computed,ref} from 'vue';
import {buildPublicIntakeUrl} from '../../utils/publicIntakeUrl';
import {providerProfilePath} from '../../utils/providerProfileLinks';
const props=defineProps({schools:{type:Array,default:()=>[]},providers:{type:Array,default:()=>[]},modelValue:{type:String,default:''},loading:Boolean});
defineEmits(['update:modelValue']);
const search=ref('');
const matchingSchools=computed(()=>props.schools.filter(s=>s.name.toLowerCase().includes(search.value.trim().toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)));
const selectedSchool=computed(()=>props.schools.find(s=>String(s.id)===props.modelValue));
const schoolProviders=computed(()=>props.providers.filter(p=>(p.schools||[]).some(s=>String(s.id)===props.modelValue)).sort((a,b)=>a.displayName.localeCompare(b.displayName)));
</script>
<style scoped>
.school-search{padding:24px;border:1px solid #dce8e1;border-radius:18px;background:#f5faf7}.school-search>p{max-width:760px}.school-search label{display:grid;gap:7px;font-weight:600;max-width:480px}.school-search input{padding:12px;border:1px solid #b8cfc2;border-radius:9px;font:inherit}.school-options{display:flex;flex-wrap:wrap;gap:8px;max-height:240px;overflow:auto;margin:16px 0}.school-options button{padding:10px 14px;border:1px solid #cddfd6;border-radius:10px;background:white;color:#174b40;font:inherit;cursor:pointer}.school-options button[aria-pressed=true]{background:#075540;color:white}.school-details{border-top:1px solid #cddfd6;padding-top:12px}.school-details>.its-button{display:inline-flex;white-space:normal}.school-team{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.school-team article{display:flex;gap:14px;align-items:center;padding:16px;background:white;border:1px solid #dce8e1;border-radius:12px}.school-team img{width:65px;height:85px;border-radius:9px;object-fit:cover}.school-team p{margin:5px 0;font-size:13px}.school-team a,.school-search a:not(.its-button){color:#175c43}.school-hint{font-size:14px}
</style>
