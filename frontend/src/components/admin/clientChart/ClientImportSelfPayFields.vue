<template>
  <div class="self-pay-fields">
    <p>Enter the agreed client rate. Saving it records self-pay and a client service override; payment authorization and billing responsibility remain separate.</p>
    <label>Service code<input :value="modelValue.code" :disabled="disabled" maxlength="32" placeholder="For example, 90837" @input="change('code',$event.target.value)" /></label>
    <label>Agreed rate ($)<input :value="modelValue.amount" :disabled="disabled" type="number" min="0.01" step="0.01" @input="change('amount',$event.target.value)" /></label>
    <label>Price basis<select :value="modelValue.basis || 'visit'" :disabled="disabled" @change="change('basis',$event.target.value)"><option value="visit">Per visit</option><option value="unit">Per unit</option></select></label>
    <label>Agreed self-pay terms<textarea :value="modelValue.reason" :disabled="disabled" maxlength="2000" rows="3" @input="change('reason',$event.target.value)" /></label>
  </div>
</template>
<script setup>
const props=defineProps({modelValue:{type:Object,required:true},disabled:Boolean});
const emit=defineEmits(['update:modelValue']);
function change(key,value){emit('update:modelValue',{...props.modelValue,[key]:value,imported:false});}
</script>
<style scoped>.self-pay-fields{display:grid;gap:12px;padding:12px;border:1px solid #cbd8e9;border-radius:8px}.self-pay-fields label{display:grid;gap:6px}.self-pay-fields input,.self-pay-fields textarea,.self-pay-fields select{padding:10px;font:inherit;max-width:100%;box-sizing:border-box}.self-pay-fields p{margin:0;font-size:13px;line-height:1.5}</style>
