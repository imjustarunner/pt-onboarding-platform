<template>
  <section v-if="question?.text || variant === 'panel'" class="interview-question" :class="{ 'interview-question--panel': variant === 'panel' }" aria-label="Current interview question" aria-live="polite" aria-atomic="true">
    <span class="interview-question__label">Question from your interviewers</span>
    <p>{{ question?.text || 'Your interviewers will share questions here. Take your time — this space is here for you.' }}</p>
  </section>
</template>
<script setup>
defineProps({ question: { type: Object, default: null }, variant: { type: String, default: 'sidebar' } });
</script>
<style scoped>
.interview-question { box-sizing: border-box; width: 100%; max-width: 250px; border: 1px solid #a899ed; border-left: 4px solid #b7a4ff; border-radius: 14px; padding: 16px 20px; background: #252340; color: #f7f5ff; box-shadow: 0 4px 20px #0002; max-height: 300px; overflow-y: auto; flex-shrink: 0; }
.interview-question__label { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #cbbdff; }
.interview-question p { margin: 8px 0 0; font-size: 1.125rem; line-height: 1.5; overflow-wrap: anywhere; white-space: pre-wrap; }
.interview-question--panel{max-width:none;max-height:none;height:100%;padding:20px 24px;background:linear-gradient(110deg,#f8d6b9,#fff0dd);border:1px solid #fcebd8;border-radius:22px;color:#18382f;box-shadow:0 8px 30px #00160c20;min-height:0}
.interview-question--panel .interview-question__label{color:#6c523e;font-size:.72rem;letter-spacing:.09em}
.interview-question--panel p{font-family:'Plotline Inter',system-ui,sans-serif;font-size:1.125rem;line-height:1.6}
</style>
