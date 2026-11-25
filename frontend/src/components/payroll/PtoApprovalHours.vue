<template>
  <div class="pto-approval-hours">
    <label>Hours to approve now
      <input :value="modelValue ?? totalHours" type="number" min="0.01" step="0.01" :max="totalHours" :disabled="disabled || !allowPartial" :aria-label="`Hours to approve now for ${personLabel}`" @input="$emit('update:modelValue', $event.target.value === '' ? '' : Number($event.target.value))" />
    </label>
    <small>{{ totalHours }} hours requested.</small>
    <small v-if="remaining > 0">{{ remaining }} hours stay pending for another payroll. Earliest use dates are approved first.</small>
  </div>
</template>
<script setup>
import { computed } from 'vue';
const props=defineProps({modelValue:[Number,String],totalHours:{type:Number,required:true},personLabel:{type:String,default:'this employee'},disabled:Boolean,allowPartial:{type:Boolean,default:true}});
defineEmits(['update:modelValue']);
const remaining=computed(()=>Math.max(0,Math.round((props.totalHours-Number(props.modelValue??props.totalHours))*100)/100));
</script>
<style scoped>
.pto-approval-hours{display:grid;gap:5px;min-width:160px;max-width:240px;margin-top:10px;text-align:left}.pto-approval-hours label{display:grid;gap:5px;font-size:12px;font-weight:600}.pto-approval-hours input{box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--border,#cfdee5);border-radius:6px;background:var(--surface,#fff);color:inherit}.pto-approval-hours small{line-height:1.45;font-size:12px;color:var(--text-secondary,#536b78)}
</style>
