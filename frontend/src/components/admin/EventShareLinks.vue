<template>
  <section class="event-share-links">
    <h4>Share this event</h4>
    <div v-for="link in links" :key="link.label" class="share-link">
      <strong>{{ link.label }}</strong>
      <p>{{ link.hint }}</p>
      <div v-if="link.url" class="link-row">
        <input :aria-label="link.label" :value="absoluteUrl(link.url)" readonly @focus="$event.target.select()" />
        <button type="button" class="btn btn-secondary btn-sm" @click="copy(link)">{{ copied === link.label ? 'Copied' : 'Copy' }}</button>
        <a :href="link.url" target="_blank" rel="noopener noreferrer">Open</a>
      </div>
      <p v-else>Save the event to generate this link.</p>
    </div>
    <p v-if="copyError" role="status">{{ copyError }}</p>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
const props = defineProps({ event: { type: Object, required: true } });
const copied = ref('');
const copyError = ref('');
const absoluteUrl = (url) => new URL(url, window.location.origin).href;
const links = computed(() => [
  { label: 'Staff RSVP and check-in', url: props.event.staffPageUrl || '', hint: 'Share with staff. They sign in to express interest, see their assignment, and log event time.' },
  { label: 'Public attendee page', url: props.event.publicPageUrl || (props.event.id ? `/company-events/${props.event.id}` : ''), hint: props.event.publicRegistrationEnabled ? 'Public registration is open. Share with attendees.' : 'Enable public registration in event settings before sharing with attendees.' }
]);
async function copy(link) {
  copyError.value = '';
  try { await navigator.clipboard.writeText(absoluteUrl(link.url)); copied.value = link.label; }
  catch { copyError.value = 'Select the link and copy it from the field.'; }
}
</script>

<style scoped>
.event-share-links { margin: 14px 0; padding: 14px; border: 1px solid #d8dee8; border-radius: 8px; }
h4 { margin: 0 0 12px; } .share-link + .share-link { margin-top: 18px; }
p { font-size: 12px; line-height: 1.5; color: #64748b; } .link-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
input { flex: 1; min-width: 180px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; }
</style>
