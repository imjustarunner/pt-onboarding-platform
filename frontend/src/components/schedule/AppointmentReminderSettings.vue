<script setup>
import SessionNotificationEditor from './SessionNotificationEditor.vue';
defineProps({ mode:{type:String,default:'default'}, rules:{type:Array,default:()=>[]}, agencyId:{type:Number,required:true}, busy:Boolean });
const emit=defineEmits(['update:mode','update:rules','save']);
</script>
<template>
  <section class="appointment-reminder-settings" aria-label="Edit additional reminders">
    <h3>Additional reminders</h3><p>Add, change, or remove reminders for this appointment, then save your changes.</p>
    <div class="reminder-mode" role="group" aria-label="Reminder settings"><button type="button" :disabled="busy" :aria-pressed="mode==='default'" @click="emit('update:mode','default')">Organization defaults</button><button type="button" :disabled="busy" :aria-pressed="mode==='customizable'" @click="emit('update:mode','customizable')">Customize reminders</button></div>
    <SessionNotificationEditor v-if="mode==='customizable'" :agency-id="agencyId" :rules="rules" :disabled="busy" @update:rules="emit('update:rules',$event)" />
    <p v-else>Organization reminders and the client’s communication preferences apply.</p>
    <button type="button" class="btn btn-primary" :disabled="busy" @click="emit('save')">{{ busy ? 'Saving…' : 'Save reminder settings' }}</button>
  </section>
</template>
<style scoped>
.appointment-reminder-settings{margin:16px 0;padding:16px;border:1px solid #dbe4ed;border-radius:12px;background:var(--bg-card,#fff)}h3{margin:0 0 8px;font-size:15px}p{font-size:13px;line-height:1.5;color:#526578}.reminder-mode{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}button{font:inherit;border:1px solid #cbd5e1;border-radius:8px;background:white;color:#17385e;padding:8px 12px;cursor:pointer}button[aria-pressed=true]{background:#e8f5ef;border-color:#23836f}button:disabled{opacity:.6;cursor:default}
</style>
