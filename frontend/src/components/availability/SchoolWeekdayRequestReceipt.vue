<script setup>
import { computed } from 'vue';
const props = defineProps({ progress: { type: Object, default: null }, outcome: { type: Object, default: null }, requesting: Boolean });
const when = value => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' Mountain' : '';
const complete = computed(() => props.progress?.status === 'completed' || props.outcome?.reason === 'already_complete');
const message = computed(() => {
  if (props.requesting) return 'Requesting update…';
  const outcome = props.outcome;
  if (outcome?.outcome === 'failed') return 'Could not confirm the request. Check delivery status before retrying.';
  if (complete.value) return 'Complete · all five weekdays are accounted for. No update is needed.';
  if (outcome?.reason === 'no_school_assignment') return 'No request sent: this provider has no assigned school days.';
  if (outcome?.reason === 'not_eligible') return 'No request sent: this provider is not eligible for school availability updates.';
  if (outcome?.reason === 'already_pending') return 'An update is already pending. Another email was not sent.';
  if (outcome?.outcome === 'requested') return 'In-app update requested. ' + (props.progress?.invitationStatus === 'sent' ? 'The existing email is shown below; another email was not sent.' : outcome.emailFollowupEnabled === true ? 'Email follow-up is queued; delivery appears below.' : outcome.emailFollowupEnabled === false ? 'Email follow-up is not enabled for this agency.' : 'Check email delivery below or in Track responses.');
  return props.progress?.status === 'opened' ? 'Opened · waiting for all five weekdays.' : props.progress ? 'Pending · no recorded form open.' : '';
});
const email = computed(() => {
  const progress = props.progress;
  if (!progress) return '';
  if (progress.invitationStatus === 'sent') return `Email sent${progress.invitationSentAt ? ' ' + when(progress.invitationSentAt) : ''}.`;
  return ({ pending: 'Email queued · awaiting delivery.', sending: 'Email is sending.', review: 'Email needs review; check Track responses.', skipped: 'Email was not sent; check Track responses.', cancelled: 'Email stopped.', not_sent: 'No invitation email recorded.' })[progress.invitationStatus] || '';
});
</script>
<template>
  <div v-if="message || email" class="request-receipt" role="status" aria-live="polite">
    <span>{{ message }}</span><small v-if="email">{{ email }}</small>
    <small v-if="progress?.openedAt">Form opened {{ when(progress.openedAt) }}.</small>
  </div>
</template>
<style scoped>
.request-receipt{max-width:270px;margin-top:8px;font-size:13px;line-height:1.5;color:var(--text-primary,#183b32)}small{display:block;margin-top:4px;color:var(--text-secondary,#5b7066)}
</style>
