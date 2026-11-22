<template>
  <fieldset class="interview-sms-consent">
    <legend>Candidate text reminders</legend>
    <p v-if="!program.available">Text reminders will be available when the Plotline SMS campaign is active.</p>
    <template v-else>
      <p v-if="status">Opt-in confirmation {{ { pending: 'queued', sending: 'processing', sent: 'sent', failed: 'failed' }[status] || status }}.</p>
      <label class="consent-choice"><input v-model="recording" type="checkbox" :disabled="disabled" /> Record verbal opt-in</label>
      <template v-if="recording">
        <blockquote>{{ program.script }}</blockquote>
        <label>Confirmed mobile number
          <input v-model.trim="phone" type="tel" autocomplete="off" placeholder="(555) 555-0100" :disabled="disabled" />
        </label>
        <label class="consent-choice"><input v-model="agreed" type="checkbox" :disabled="disabled" /> The candidate explicitly agreed to receive interview texts at this number.</label>
      </template>
    </template>
  </fieldset>
</template>

<script setup>
import { ref, watch } from 'vue';
defineProps({
  program: { type: Object, default: () => ({ available: false }) },
  status: { type: String, default: '' },
  disabled: Boolean
});
const emit = defineEmits(['update:modelValue']);
const recording = ref(false);
const phone = ref('');
const agreed = ref(false);
watch([recording, phone, agreed], () => {
  emit('update:modelValue', recording.value ? { phone: phone.value, verbalConsent: agreed.value } : null);
});
</script>

<style scoped>
.interview-sms-consent { border: 1px solid var(--border-color, #c7d6d0); padding: 12px; border-radius: 8px; min-width: 0; }
legend { padding: 0 4px; font-weight: 700; }
p, blockquote { margin: 0 0 10px; }
blockquote { background: var(--bg-secondary, #f2f6f3); padding: 10px; border-radius: 6px; overflow-wrap: anywhere; }
label { display: flex; align-items: center; gap: 6px; margin: 8px 0; flex-wrap: wrap; }
</style>
