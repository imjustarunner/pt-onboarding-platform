<template>
  <div class="app-reminder-controls" aria-label="App reminder controls">
    <template v-if="snoozed">
      <span role="status">Reminders paused until {{ new Date(until).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) }}</span>
      <button type="button" @click="resume">Resume reminders</button>
    </template>
    <details v-else>
      <summary>Reminders</summary>
      <div class="reminder-options">
        <p>Pause reminder banners and pop-ups on this browser. Your tasks, messages, and notifications stay available.</p>
        <button type="button" @click="snoozeHour">Snooze all for 1 hour</button>
        <button type="button" @click="snoozeToday">Snooze all today</button>
      </div>
    </details>
  </div>
</template>
<script setup>
import { toRef } from 'vue';
import { useAppReminderSnooze } from '../../composables/useAppReminderSnooze.js';
const props = defineProps({ userId: { type:[Number,String], required:true } });
const { snoozed, until, snoozeHour, snoozeToday, resume } = useAppReminderSnooze(toRef(props, 'userId'));
</script>
<style scoped>
.app-reminder-controls{display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:8px 20px;color:var(--text-primary,#254b3c);font:inherit;font-size:.875rem}
details{position:relative}summary{cursor:pointer;padding:8px 12px;border:1px solid var(--border,#d0ddd6);border-radius:8px;background:var(--bg-card,#fff)}
.reminder-options{position:absolute;right:0;z-index:100;width:min(340px,calc(100vw - 56px));padding:16px;border:1px solid var(--border,#d0ddd6);border-radius:10px;background:var(--bg-card,#fff);box-shadow:0 6px 22px #142d2420}
p{margin:0 0 12px;line-height:1.5}button{padding:9px 12px;margin:4px;border:1px solid #b2cbbd;border-radius:7px;background:var(--bg-card,#fff);color:inherit;font:inherit;cursor:pointer}
button:focus-visible,summary:focus-visible{outline:3px solid #267b58;outline-offset:2px}
</style>
