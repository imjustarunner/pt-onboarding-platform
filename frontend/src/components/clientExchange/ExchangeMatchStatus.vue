<template>
  <div v-if="fit" class="exchange-fit" :class="{ blocked: !fit.canRequest, adjustment: fit.canRequest && fit.status !== 'match' }">
    <strong>{{ !fit.canRequest ? 'Not a match · Request blocked' : fit.status === 'match' ? (fit.review?.length ? 'Possible match · Review details' : 'Match') : 'Not a match yet · Can request' }}</strong>
    <template v-if="!compact">
      <ul v-if="reasons.length"><li v-for="reason in reasons" :key="reason.code">{{ reason.message }}</li></ul>
      <p v-if="fit.canRequest && fit.adjustments?.length">Request only if you can resolve these differences before care begins.</p>
    </template>
  </div>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ fit: Object, compact: Boolean });
const reasons = computed(() => [...(props.fit?.blockers || []), ...(props.fit?.adjustments || []), ...(props.fit?.review || [])]);
</script>
<style scoped>
.exchange-fit { padding: 10px; border-radius: 6px; background: #f0fdf4; color: #166534; font-size: 13px; }
.exchange-fit.blocked { background: #fef2f2; color: #991b1b; }
.exchange-fit.adjustment { background: #fffbeb; color: #92400e; }
ul { margin: 6px 0; padding-left: 20px; } p { margin: 6px 0 0; }
</style>
