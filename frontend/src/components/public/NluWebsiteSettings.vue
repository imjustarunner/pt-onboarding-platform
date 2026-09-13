<template>
 <fieldset class="nlu-settings"><legend>Next Level Up website</legend><p>Edit page headings, introductions, and hero images here. Provider profiles and enrollment remain connected to their app records. Save the page below to publish changes.</p>
  <label>Footer mountain image URL<input :value="settings.ctaImageUrl||''" placeholder="/assets/nlu/mountains.png" @input="update('ctaImageUrl',$event.target.value)"/></label>
  <details v-for="(defaults,section) in nluHeroes" :key="section"><summary>{{section==='home'?'Home':defaults[1]}}</summary><label v-for="([key,label],i) in fields" :key="key">{{label}}<textarea :value="settings.pages?.[section]?.[key]||''" :placeholder="i===4?'/assets/nlu/'+defaults[4]:defaults[i]" rows="2" @input="updatePage(section,key,$event.target.value)"/></label></details>
 </fieldset>
</template>
<script setup>
import{computed}from'vue';import{nluHeroes}from'../../constants/nluWebsite';
const props=defineProps({modelValue:{type:String,default:'{}'}}),emit=defineEmits(['update:modelValue']);
const branding=computed(()=>{try{return JSON.parse(props.modelValue||'{}');}catch{return{};}}),settings=computed(()=>branding.value.nluWebsite||{});
const fields=[['eyebrow','Section label'],['title','Heading'],['subtitle','Subheading'],['body','Introduction'],['imageUrl','Hero image URL']];
function update(key,value){emit('update:modelValue',JSON.stringify({...branding.value,landingTemplate:'nlu',nluWebsite:{...settings.value,[key]:value}},null,2));}
function updatePage(section,key,value){update('pages',{...settings.value.pages,[section]:{...settings.value.pages?.[section],[key]:value}});}
</script>
<style scoped>.nlu-settings{border:1px solid #c3dce4;background:#f2f9fa;border-radius:12px;padding:22px;margin-bottom:25px}.nlu-settings legend{font-size:22px;font-weight:700}.nlu-settings label{display:grid;gap:7px;margin:14px 0}.nlu-settings input,.nlu-settings textarea{width:100%;padding:10px;box-sizing:border-box;border:1px solid #bed5dc;border-radius:6px;font:inherit}.nlu-settings summary{cursor:pointer;font-weight:600;padding:14px 0;border-bottom:1px solid #d0e3e8}</style>
