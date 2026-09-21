<template>
 <section class="care-finder" aria-label="Find care near you">
  <form @submit.prevent="findCare"><label>Type of care<select v-model="care"><option value="">All types of care</option><option value="Individuals">Individual therapy</option><option value="Couples">Couples therapy</option><option value="Families">Family therapy</option></select></label><label>Location<select v-model="location"><option value="">All locations</option><option value="virtual">Virtual care</option><optgroup v-for="region in regions" :key="region.state" :label="region.state"><option v-for="city in region.cities" :key="city" :value="city">{{city}}</option></optgroup></select></label><label>Insurance or self-pay<select v-model="insurance"><option value="">Any payment option</option><option value="self-pay">Self-pay</option><option v-for="plan in insurances" :key="plan.name" :value="plan.name">{{plan.name}}</option></select></label><button type="submit"><Icon name="arrow"/><span>Find care</span></button></form>
  <p>{{regionCaption}}</p>
 </section>
</template>
<script setup>
import {ref,computed} from 'vue';
import {useRouter} from 'vue-router';
import Icon from '../rise/RiseIcon.vue';
import {officeRegions,serviceRegionCaption} from '../../utils/publicOfficeRegions';
const props=defineProps({offices:{type:Array,default:()=>[]},insurances:{type:Array,default:()=>[]}}),router=useRouter();
const care=ref(''),location=ref(''),insurance=ref('');
const regions=computed(()=>officeRegions(props.offices));
const regionCaption=computed(()=>serviceRegionCaption(props.offices));
function findCare(){router.push({path:'/p/itsco/providers',query:{care:care.value||undefined,setting:location.value==='virtual'?'virtual':'all',city:location.value&&location.value!=='virtual'?location.value:undefined,insurance:insurance.value||undefined}});}
</script>
<style scoped>.care-finder{position:relative;z-index:1;max-width:1120px;margin:-28px auto 12px;padding:0 20px}.care-finder form{display:flex;align-items:center;background:white;border:1px solid #d4e4dc;box-shadow:0 10px 32px #244f3320;padding:15px;border-radius:50px;gap:12px}.care-finder label{flex:1;min-width:0;display:grid;gap:4px;padding:0 18px;font-size:11px;color:#546b61;border-right:1px solid #dce6e0}.care-finder select{border:0;background:white;color:#174c3c;font:inherit;font-size:14px;font-weight:600;width:100%;padding:5px 20px 5px 0;min-width:0}.care-finder button{display:flex;align-items:center;gap:8px;justify-content:center;background:#145e47;color:white;border:0;border-radius:30px;min-height:52px;padding:12px 20px;font:inherit;font-size:13px;font-weight:700}.care-finder svg{width:20px;height:20px}.care-finder p{text-align:center;margin:10px 0 0;font-size:12px;color:#536e61}@media(max-width:650px){.care-finder{margin:16px auto;padding:0 20px}.care-finder form{display:grid;grid-template-columns:1fr 1fr;border-radius:20px;padding:14px;gap:14px}.care-finder label{padding:0;border:0}.care-finder label:nth-child(3){grid-column:1/-1}.care-finder button{grid-column:1/-1;min-height:44px}.care-finder select{font-size:13px;border-bottom:1px solid #e2ebe5;padding:8px 0}}</style>
