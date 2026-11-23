<template>
  <div class="hint" style="margin-top: 6px;">
    <div v-if="client.termination_reason"><strong>Termination reason:</strong> {{ client.termination_reason }}</div>
    <div><strong>Last provider assigned:</strong> {{ client.termination_last_provider_name || 'Not recorded' }}</div>
    <div><strong>Termination date:</strong> {{ reportCalendarDate(client.termination_effective_date) === '—' ? 'Not recorded' : reportCalendarDate(client.termination_effective_date) }}</div>
  </div>
</template>
<script setup>
import { reportCalendarDate } from '../../utils/reportDateTime.js';
defineProps({ client: { type: Object, required: true } });
</script>
