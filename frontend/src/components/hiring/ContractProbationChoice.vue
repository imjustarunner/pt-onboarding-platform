<template>
  <fieldset class="contract-probation-choice">
    <legend>Apply new-hire probation? <span>Required · choose Yes or No</span></legend>
    <label><input type="radio" :name="name" value="yes" :checked="modelValue==='yes'" required @change="$emit('update:modelValue','yes')"> Yes — include the approved probationary terms</label>
    <label><input type="radio" :name="name" value="no" :checked="modelValue==='no'" required @change="$emit('update:modelValue','no')"> No — use the agreed regular rates</label>
    <p>Make a choice for this person. Minimum-workload rate reductions are not activated. Existing earned pay and prior probation waivers remain protected.</p>
    <label v-if="individual && modelValue==='yes'" class="individual-terms">Approved individual probation terms<textarea :value="terms" required placeholder="Approved duration, actual probationary rates and the individual agreement reference" @input="$emit('update:terms',$event.target.value)" /></label>
  </fieldset>
</template>
<script setup>
import {getCurrentInstance} from 'vue';
defineProps({modelValue:{type:String,default:''},terms:{type:String,default:''},individual:{type:Boolean,default:false}});
defineEmits(['update:modelValue','update:terms']);
const name=`contract-probation-${getCurrentInstance().uid}`;
</script>
<style scoped>
.contract-probation-choice{border:1px solid #b7c9c1;padding:16px;border-radius:9px;margin:18px 0}.contract-probation-choice legend{font-weight:700}.contract-probation-choice legend span{font-size:12px;font-weight:400}.contract-probation-choice>label{display:flex;gap:9px;align-items:flex-start;margin:12px 0}.contract-probation-choice input{width:auto;margin-top:4px}.contract-probation-choice p{font-size:12px;line-height:1.5}.contract-probation-choice .individual-terms{display:grid}.contract-probation-choice textarea{width:100%;min-height:90px;font:inherit;padding:9px;border:1px solid #b7c9c1;border-radius:7px}
</style>
