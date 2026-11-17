<script setup>
defineProps({progress:{type:Object,required:true}});
const when=value=>new Date(value).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' Mountain';
const labels={assigned:'Assigned school day',available:'Saved Available',unavailable:'Saved Not available',unconfirmed:'Needs confirmation'};
</script>
<template>
 <details class="completion-evidence">
  <summary>{{progress.reconfirmationPending?'Re-confirmation requested':progress.savedAt?'View saved answers':'View completion evidence'}}</summary>
  <p v-if="progress.savedAt">Saved {{when(progress.savedAt)}} · {{progress.savedByProvider?'provider account':progress.savedByUserId?'another authorized account':'saving account not recorded'}}.</p>
  <p v-else-if="progress.completionBasis==='assignments'">All five weekdays have school assignments. No form save is recorded.</p>
  <p v-if="progress.savedAt&&!progress.explicitlyConfirmed">Saved before explicit weekday confirmation was required. Request re-confirmation if these answers are disputed.</p>
  <p v-if="progress.explicitlyConfirmed">Every unassigned weekday was explicitly reviewed in the form.</p>
  <ul><li v-for="day in progress.dayEvidence||[]" :key="day.day">{{day.day}}: {{labels[day.status]||day.status}}<span v-if="day.status==='unconfirmed'&&day.answered"> (previously saved {{day.savedAvailable?'Available':'Not available'}})</span></li></ul>
 </details>
</template>
<style scoped>
.completion-evidence{max-width:300px;font-size:12px;line-height:1.5;margin-top:8px}summary{cursor:pointer;color:#176745}p{margin:7px 0}ul{padding-left:18px;margin:6px 0}
</style>
