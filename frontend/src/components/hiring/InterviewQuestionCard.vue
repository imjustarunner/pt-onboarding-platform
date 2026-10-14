<template>
  <section v-if="question?.text" class="interview-question" aria-label="Current interview question" aria-live="polite" aria-atomic="true">
    <span class="interview-question__label">Question from your interviewers</span>
    <p>{{ question.text }}</p>
  </section>
</template>
<script setup>
defineProps({ question: { type: Object, default: null } });
</script>
<style scoped>
.interview-question { border: 1px solid #a899ed; border-left: 4px solid #b7a4ff; border-radius: 14px; padding: 16px 20px; background: #252340; color: #f7f5ff; box-shadow: 0 4px 20px #0002; max-height: 170px; overflow-y: auto; flex-shrink: 0; }
.interview-question__label { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #cbbdff; }
.interview-question p { margin: 8px 0 0; font-size: clamp(1rem, 2vw, 1.25rem); line-height: 1.5; overflow-wrap: anywhere; white-space: pre-wrap; }
</style>
