<template><form @submit.prevent="$emit('submit',answers)"><h2 id="arrival-title">A quick check-in</h2><p>Your responses will be shared privately with your provider.</p><fieldset v-for="form in forms" :key="form.id"><legend>{{ form.title }}</legend><label v-for="field in form.fields" :key="field.id">{{ field.label }}{{ field.required ? ' *' : '' }}
<textarea v-if="field.type==='textarea'" v-model="answers[form.id][field.id]" :required="field.required" maxlength="8000" />
<select v-else-if="field.type==='select' || field.type==='multi_select'" v-model="answers[form.id][field.id]" :multiple="field.type==='multi_select'" :required="field.required"><option v-if="field.type==='select'" value="">Choose…</option><option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option></select>
<select v-else-if="field.type==='boolean'" v-model="answers[form.id][field.id]" :required="field.required"><option value="">Choose…</option><option :value="true">Yes</option><option :value="false">No</option></select>
<input v-else-if="field.type==='number'" v-model.number="answers[form.id][field.id]" type="number" step="any" :required="field.required" />
<input v-else v-model="answers[form.id][field.id]" :type="field.type==='phone'?'tel':field.type" :required="field.required" maxlength="8000" autocomplete="off" />
</label></fieldset><p v-if="error" role="alert">{{ error }}</p><button :disabled="saving">{{ saving ? 'Saving…' : 'Submit to my provider' }}</button></form></template>
<script setup>
import { reactive } from 'vue';
const props=defineProps({forms:{type:Array,required:true},saving:Boolean,error:String});
defineEmits(['submit']);
const answers=reactive(Object.fromEntries(props.forms.map(form=>[form.id,Object.fromEntries(form.fields.map(f=>[f.id,f.type==='multi_select'?[]:'']))])));
</script>
<style scoped>fieldset{border:1px solid #d3ddcf;border-radius:14px;margin:20px 0;padding:18px}legend{font-weight:700}label{display:grid;gap:9px;margin:18px 0;line-height:1.5}input,textarea,select{font:inherit;padding:12px;border-radius:8px;border:1px solid #bacabd;width:100%;box-sizing:border-box}textarea{min-height:90px}button{min-height:54px;background:#234e45;color:white;border:0;border-radius:12px;width:100%;font:inherit;padding:14px}button:disabled{opacity:.5}</style>
