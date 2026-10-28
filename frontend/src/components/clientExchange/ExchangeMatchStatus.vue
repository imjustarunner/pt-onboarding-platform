<template>
  <div v-if="fit" class="exchange-fit" :class="{ blocked: !fit.canRequest, adjustment: fit.canRequest && fit.status !== 'match' }">
    <strong>{{ !fit.canRequest ? 'Not a match · Request blocked' : fit.status === 'match' ? (fit.review?.length ? 'Possible match · Review details' : 'Match') : 'Not a match yet · Can request' }}</strong>
    <template v-if="!compact">
      <p v-if="fit.blockers?.length"><strong>Request blocked</strong></p>
      <ul v-if="fit.blockers?.length"><li v-for="reason in fit.blockers" :key="reason.code">{{ reason.message }}</li></ul>
      <p v-if="fit.adjustments?.length"><strong>Fit differences — request with acknowledgement</strong></p>
      <ul v-if="fit.adjustments?.length"><li v-for="reason in fit.adjustments" :key="reason.code">{{ reason.message }}</li></ul>
      <p v-if="fit.review?.length"><strong>Details to confirm</strong></p>
      <ul v-if="fit.review?.length"><li v-for="reason in fit.review" :key="reason.code">{{ reason.message }}</li></ul>
      <p v-if="fit.canRequest && fit.adjustments?.length">Your request needs support review. Resolve or have staff waive these differences before assignment.</p>
    </template>
  </div>
</template>
<script setup>
defineProps({ fit: Object, compact: Boolean });
</script>
<style scoped>
.exchange-fit { padding: 10px; border-radius: 6px; background: #f0fdf4; color: #166534; font-size: 13px; }
.exchange-fit.blocked { background: #fef2f2; color: #991b1b; }
.exchange-fit.adjustment { background: #fffbeb; color: #92400e; }
ul { margin: 6px 0; padding-left: 20px; } p { margin: 6px 0 0; }
</style>
