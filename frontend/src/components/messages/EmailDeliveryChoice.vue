<template>
  <section v-if="info" class="delivery-choice" role="alert" aria-label="Choose email delivery time">
    <p>One or more recipients are outside their availability hours.</p>
    <p>Send now delivers to their app. Their notification settings still control whether and when they receive a personal email.</p>
    <p v-if="when">Next availability: {{ when }}</p>
    <div>
      <button type="button" :disabled="busy" @click="$emit('choose', 'now')">Send now</button>
      <button type="button" :disabled="busy" @click="$emit('choose', 'next_available')">Send at next availability</button>
      <button type="button" :disabled="busy" @click="$emit('cancel')">Keep editing</button>
    </div>
  </section>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ info: Object, busy: Boolean });
defineEmits(['choose', 'cancel']);
const when = computed(() => {
  const date = new Date(props.info?.nextAvailableAt);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
});
</script>
<style scoped>
.delivery-choice{border:1px solid #809d8d;border-radius:8px;padding:12px;margin:12px 0}.delivery-choice p{margin:0 0 10px}.delivery-choice div{display:flex;flex-wrap:wrap;gap:8px}.delivery-choice button{font:inherit;padding:8px 12px;cursor:pointer}
</style>
