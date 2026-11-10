<template>
  <div class="clp">
    <label>Location<select aria-label="Location" :value="selection" :disabled="disabled || unavailable" @change="choose($event.target.value)">
      <option value="">Choose location</option>
      <option v-if="selection==='saved'" value="saved">{{ modelValue.locationLabel }} · Saved session location</option>
      <option value="__telehealth_video__">Telehealth (video)</option>
      <option value="__telehealth_phone__">Telehealth (phone)</option>
      <option v-for="choice in sites" :key="choice.value" :value="choice.value">{{ choice.name || choice.label }}</option>
      <option value="__home__">Home</option>
    </select></label>
    <label v-if="remote">Client’s location during telehealth<select aria-label="Client’s location during telehealth" :value="clientPlace" :disabled="disabled || unavailable" @change="choose(selection,$event.target.value)"><option value="">Choose location</option><option value="10">At home</option><option value="02">Somewhere else</option></select></label>
    <p v-if="unavailable" role="status">Assigned locations could not load. Your saved location is preserved.</p>
  </div>
</template>
<script setup>
import {computed} from 'vue';
const props=defineProps({modelValue:{type:Object,default:()=>({})},choices:{type:Array,default:()=>[]},disabled:Boolean,unavailable:Boolean});
const emit=defineEmits(['update:modelValue']);
const sites=computed(()=>props.choices.filter(choice=>['11','03'].includes(String(choice.placeOfService))));
const remoteValue=method=>/phone|telephone/i.test(method || '')?'__telehealth_phone__':/video|virtual|telehealth/i.test(method || '')?'__telehealth_video__':'';
const selection=computed(()=>{
 const current=props.modelValue;
 if(current.locationSelection && ['__telehealth_video__','__telehealth_phone__','__home__',...sites.value.map(s=>s.value)].includes(current.locationSelection))return current.locationSelection;
 if(['02','10'].includes(String(current.placeOfService)) || /telehealth|virtual|video|phone/i.test(current.locationLabel || ''))return remoteValue(current.modality) || (current.locationLabel?'saved':'');
 if(String(current.placeOfService)==='12' || /^home$|patient.?s?\s+(?:home|residence)/i.test(current.locationLabel || ''))return '__home__';
 const site=sites.value.find(choice=>{
  const label=!current.locationLabel || [choice.name,choice.label,choice.value,...(choice.aliases || [])].includes(current.locationLabel);
  return label && (current.serviceLocationId?Number(current.serviceLocationId)===Number(choice.serviceLocationId):current.billingOfficeLocationId?Number(current.billingOfficeLocationId)===Number(choice.billingOfficeLocationId):!!current.locationLabel);
 });
 return site?.value || (current.locationLabel?'saved':'');
});
const remote=computed(()=>selection.value.startsWith('__telehealth_'));
const clientPlace=computed(()=>['02','10'].includes(String(props.modelValue.placeOfService))?String(props.modelValue.placeOfService):'');
function choose(value,place) {
 if(value==='saved')return;
 if(!value){emit('update:modelValue',{locationSelection:'',locationLabel:'',serviceLocationId:null,billingOfficeLocationId:null,placeOfService:'',modality:''});return;}
 const isRemote=value.startsWith('__telehealth_'),pos=isRemote?(place ?? clientPlace.value):value==='__home__'?'12':String(sites.value.find(s=>s.value===value)?.placeOfService || '');
 if(!pos&&!isRemote)return;
 let site=sites.value.find(s=>s.value===value);
 if(!site) {
  const candidates=props.choices.filter(s=>String(s.placeOfService)===pos);
  const office=props.modelValue.billingOfficeLocationId;
  site=candidates.find(s=>office&&Number(s.billingOfficeLocationId)===Number(office)) || (!office&&candidates.length===1?candidates[0]:null);
 }
 const currentOffice=props.modelValue.billingOfficeLocationId;
 const knownOffice=currentOffice&&props.choices.some(choice=>Number(choice.billingOfficeLocationId)===Number(currentOffice))?currentOffice:null;
 emit('update:modelValue',{
  locationSelection:value,locationLabel:isRemote?'Telehealth':value==='__home__'?'Home':site.name || site.label,
  serviceLocationId:site?.serviceLocationId || null,billingOfficeLocationId:site?.billingOfficeLocationId || (isRemote||value==='__home__'?knownOffice:null),schoolOrganizationId:site?.schoolOrganizationId || null,
  placeOfService:pos,modality:isRemote?value==='__telehealth_phone__'?'phone':'video':'in_person',
  address:site?.address || null,billingAddress:site?.billingAddress || null,defaultModifiers:site?.defaultModifiers || null
 });
}
</script>
<style scoped>
.clp{min-width:0;display:grid;gap:8px}.clp label{display:grid;gap:6px;font-size:13px;font-weight:600}.clp select{font:inherit;font-weight:400;color:inherit;width:100%;min-width:0;box-sizing:border-box;padding:10px;border:1px solid #bacddd;border-radius:7px;background:white}.clp p{font-size:12px;margin:0;line-height:1.5}
</style>
