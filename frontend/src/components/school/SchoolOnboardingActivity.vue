<template>
  <ol v-if="events?.length" class="onboarding-email-activity">
    <li v-for="(event,index) in events" :key="`${event.at}-${index}`">
      <div><strong>{{ event.label }}</strong> <time :datetime="event.at">{{ date(event.at) }}</time></div>
      <p v-if="event.detail">{{ event.detail }}</p>
      <details v-if="event.email">
        <summary>{{ event.email.subject || 'Email details' }}</summary>
        <p v-if="event.email.from">From: {{ event.email.from }}</p>
        <p v-if="event.email.replyTo">Reply to: {{ event.email.replyTo }}</p>
        <p v-if="event.email.cc">CC: {{ event.email.cc }}</p>
        <p v-if="event.email.status==='sent'">{{ event.email.replyCount ? `${event.email.replyCount} recorded ${event.email.replyCount===1?'reply':'replies'}` : 'No recorded reply in the Schools inbox yet.' }}</p>
        <pre>{{ event.email.bodyText || 'Message content was not recorded for this older email.' }}</pre>
      </details>
    </li>
  </ol>
  <p v-else class="muted">No onboarding activity recorded yet.</p>
</template>
<script setup>
defineProps({events:{type:Array,default:()=>[]}});
const date=value=>new Date(value).toLocaleString();
</script>
<style scoped>
.onboarding-email-activity{padding-left:1.25rem;max-width:100%}.onboarding-email-activity li{margin:1rem 0}.onboarding-email-activity p{margin:.35rem 0;font-size:.9rem}.onboarding-email-activity time{font-size:.85rem;margin-left:.5rem;color:var(--text-secondary,#64748b)}.onboarding-email-activity summary{cursor:pointer;overflow-wrap:anywhere}.onboarding-email-activity pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;background:var(--bg-secondary,#f4f8fb);padding:1rem;border-radius:.5rem;max-height:28rem;overflow:auto}
</style>
