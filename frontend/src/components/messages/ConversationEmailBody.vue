<script setup>
import { computed } from 'vue';
import { emailConversationText } from '../../utils/emailConversationText';
import { renderEmailContent } from '../../utils/emailPresentation';
const props = defineProps({ message: { type: Object, required: true } });
const text = computed(() => emailConversationText(props.message));
const original = computed(() => renderEmailContent(props.message, { collapseQuotes: false, compactLayout: true }));
</script>
<template>
  <div class="conversation-email-body">
    <div class="conversation-email-text">{{ text || '(No message text)' }}</div>
    <details class="conversation-email-original">
      <summary>Show full email</summary>
      <div v-html="original.html" />
    </details>
  </div>
</template>
<style scoped>
.conversation-email-text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; }
.conversation-email-original { margin-top: 10px; font-size: 0.9em; }
.conversation-email-original summary { color: var(--conversa-muted, #61738b); cursor: pointer; }
.conversation-email-original > div { white-space: pre-wrap; overflow-wrap: anywhere; padding-top: 12px; }
</style>
