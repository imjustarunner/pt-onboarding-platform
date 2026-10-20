<template>
  <section v-if="benefit?.eligible || loading || error || modelValue" class="school-support" aria-label="School support benefit">
    <h4>{{ benefit?.label || 'School Support Hours' }}</h4>
    <p class="school-support__private">Your provider benefit · Visible to you only</p>
    <p v-if="loading" role="status">Checking your available hours…</p>
    <div v-else-if="error" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="$emit('refresh')">Retry balance check</button>
      <label v-if="modelValue && !readonly"><input type="checkbox" :checked="modelValue" @change="$emit('update:modelValue', $event.target.checked)" /> Use 1 hour for this session</label>
    </div>
    <template v-else-if="benefit?.eligible">
      <dl>
        <div><dt>Earned balance</dt><dd>{{ hours(benefit.balanceHours) }} hours</dd></div>
        <div><dt>Pending requests</dt><dd>{{ hours(benefit.pendingHours) }} hours</dd></div>
        <div><dt>Available to request</dt><dd>{{ hours(benefit.availableHours) }} hours</dd></div>
      </dl>
      <p v-if="benefit.request" role="status">Request #{{ benefit.request.id }} · {{ requestStatus }} · {{ hours(benefit.request.hours) }} hour</p>
      <label v-else-if="!readonly">
        <input type="checkbox" :checked="modelValue" :disabled="!modelValue && !benefit.canRequest" @change="$emit('update:modelValue', $event.target.checked)" />
        Use 1 hour for this {{ eventType === 'no_show' ? 'missed' : 'canceled' }} session
      </label>
      <p v-else-if="modelValue">Use 1 hour for this session — included when you sign.</p>
      <p v-else>No support hour requested for this session.</p>
      <p v-if="!benefit.request && !benefit.canRequest">You need at least 1 available hour to use this benefit.</p>
      <p>Signing submits your request for payroll review. Pending requests reserve availability; your earned balance is deducted only after approval and successful payroll processing. Track the request in My Payroll.</p>
    </template>
    <div v-else-if="modelValue">
      <p>This session is no longer eligible for a school support request. Clear the selection to continue.</p>
      <label v-if="!readonly"><input type="checkbox" :checked="modelValue" @change="$emit('update:modelValue', $event.target.checked)" /> Use 1 hour for this session</label>
    </div>
  </section>
</template>
<script setup>
import {computed} from 'vue';
const props = defineProps({benefit:Object, loading:Boolean, error:String, modelValue:Boolean, readonly:Boolean, eventType:String});
defineEmits(['update:modelValue', 'refresh']);
const hours = value => Number(value || 0).toLocaleString(undefined, {maximumFractionDigits:2});
const requestStatus = computed(() => ({submitted:'Awaiting payroll review', deferred:'Deferred for payroll review', approved:'Approved and applied to payroll', rejected:'Declined', withdrawn:'Withdrawn'}[props.benefit?.request?.status] || props.benefit?.request?.status));
</script>
<style scoped>
.school-support { margin:16px 0; padding:18px; border:1px solid #a6cfc0; border-radius:12px; background:#f2faf6; color:#193e30; }
h4 { margin:0; font-size:1rem; }
p { margin:10px 0 0; font-size:.9rem; line-height:1.5; }
.school-support__private { color:#4d665c; }
dl { display:flex; flex-wrap:wrap; gap:16px; margin:16px 0; }
dt { font-size:.82rem; } dd { margin:4px 0 0; font-weight:700; }
label { display:flex; align-items:center; gap:10px; margin-top:14px; font-weight:600; }
input { width:18px; height:18px; }
button { border:1px solid #a6cfc0; background:white; border-radius:6px; padding:8px 12px; color:inherit; cursor:pointer; }
</style>
