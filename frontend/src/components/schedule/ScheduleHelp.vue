<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAskAssistant } from '../../composables/useAskAssistant';
const assistant = useAskAssistant();
const root = ref(null); const open = ref(false);
const panel = ref(null), trigger = ref(null), position = ref({}), portal = ref('body');
const topics = [
  ['Show weekends or change the layout', 'Open Settings, then Layout. Choose the days you want to show, row height, and how overlapping appointments appear. Appointment colors are also in Settings.'],
  ['Use full screen', 'Choose Full screen beside the date controls to give your calendar more room. Choose Exit full screen or press Escape to return.'],
  ['Understand the colors', 'Open Color key to see the appointment types. Select Color key again to collapse it.'],
  ['Schedule an appointment', 'Click an empty hour, choose a quarter-hour from the + control, or drag across a time range. Choose Book Session, select the client, and review before saving.'],
  ['Cancel one appointment', 'Open the appointment and choose Change appointment. Enter the reason to share with the client, review follow-up and the generated note, then confirm.'],
  ['Cancel a provider’s day', 'Use Cancel day for the selected provider and date. Review affected appointments, hosted meetings and openings before confirming. Other recurring dates remain scheduled.'],
  ['Remove an opening', 'Open the published availability and choose Remove availability. Choose this occurrence or this and future occurrences. Existing appointments and room reservations stay booked.'],
  ['Contact a client', 'Open the scheduled appointment. Under Info, choose Contact client beside the Conversa logo. Select the client/contact and channel, then review your message before sending.'],
  ['Leave a schedule clip', 'Open the appointment and add a Schedule clip. It stays on the appointment. Choose “In this appointment and on the schedule” to flag it on the schedule face. Staff with full schedule access can see it; clients cannot.'],
  ['Link an existing office booking', 'Open the session’s Info tab and choose Link an existing office reservation. Select your reserved room. For a recurring series, choose this and future saved appointments. Each date needs an existing reservation; session notes and dates are preserved.'],
  ['Copy an appointment reference', 'Open a session or office booking, then click Reference at the bottom of its details to copy it. Each record keeps its own stable reference.'],
  ['Review notes and reminders', 'Session note holds your source text. Review its formatted draft and sign in Note Workspace. In Notifications, choose Organization default, My default, or Custom. Save as My default keeps your timing and channel choices for future bookings.'],
  ['Send a reminder now', 'Choose available email, opted-in text, or in-app channels, then Send reminder now. Manual pushes are limited to once per 24 hours. Confirmed clients receive friendly reminders; unanswered clients receive RSVP requests. Declined sessions receive no reminders.'],
  ['Schedule reminders', 'The app default is 72-hour email, then 24-hour and 2-hour email plus opted-in text. Custom timing includes 5 hours and 5 minutes. Scheduled deliveries are normally spaced by 24 hours; reminders in the final 5 hours can still be sent.'],
  ['Review communication outcomes', 'Communications separates Notifications, Replies, and authorized Secure comments. Review queued, sent, failed, and not-sent outcomes and their reasons. Email and text replies stay with the session when their notification context is known.'],
  ['Canceled appointments', 'Canceled appointments remain at their original time with a canceled label. Open one to review its nonbillable change note and communication history.'],
  ['See earlier or later times', 'The schedule includes the earliest and latest timed events. Use the hours control above the time labels to show all 24 hours.']
];
function closeOutside(event) { if (!root.value?.contains(event.target) && !panel.value?.contains(event.target)) open.value = false; }
function close() { open.value = false; trigger.value?.focus(); }
function escape(event) { if (event.key === 'Escape' && open.value) close(); }
function reposition() {
  portal.value = document.fullscreenElement || 'body';
  if (!open.value || !trigger.value) return;
  const r = trigger.value.getBoundingClientRect();
  const width = Math.min(370, window.innerWidth - 24);
  const height = Math.min(panel.value?.offsetHeight || 420, window.innerHeight - 24);
  position.value = { width: `${width}px`, left: `${Math.max(12, Math.min(r.left, window.innerWidth - width - 12))}px`, top: `${Math.max(12, Math.min(r.bottom + 8, window.innerHeight - height - 12))}px` };
}
watch(open, async value => { if (value) { reposition(); await nextTick(); reposition(); panel.value?.focus(); } });
function ask() { open.value = false; assistant.openAsk('', 'ask'); }
onMounted(() => { document.addEventListener('pointerdown', closeOutside); document.addEventListener('keydown', escape); window.addEventListener('resize', reposition); document.addEventListener('scroll', reposition, true); document.addEventListener('fullscreenchange', reposition); });
onBeforeUnmount(() => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', reposition); document.removeEventListener('scroll', reposition, true); document.removeEventListener('fullscreenchange', reposition); });
</script>
<template>
  <div ref="root" class="schedule-help" @keydown.esc="open = false">
    <button ref="trigger" type="button" class="schedule-help__trigger" data-tour="my-schedule-help" :aria-expanded="open" @click="open = !open">? How do I…</button>
    <Teleport :to="portal">
    <section v-if="open" ref="panel" class="schedule-help schedule-help__panel" :style="position" role="dialog" tabindex="-1" aria-label="Schedule help">
      <header><strong>Schedule help</strong><button type="button" aria-label="Close schedule help" @click="close">×</button></header>
      <details v-for="[title, answer] in topics" :key="title"><summary>{{ title }}</summary><p>{{ answer }}</p></details>
      <button type="button" class="schedule-help__ask" @click="ask">Ask the assistant…</button>
      <p class="schedule-help__hint">Ask for guidance or help finding a time. Review scheduling changes before confirming them.</p>
    </section>
    </Teleport>
  </div>
</template>
<style scoped>
.schedule-help{position:relative}.schedule-help__trigger{white-space:nowrap}.schedule-help button{font:inherit;cursor:pointer;border:1px solid var(--border,#cbd5e1);border-radius:8px;padding:7px 10px;background:var(--bg-card,#fff);color:inherit}.schedule-help__panel{position:fixed;box-sizing:border-box;width:min(370px,calc(100vw - 40px));max-height:calc(100dvh - 24px);overflow:auto;z-index:2100;border:1px solid var(--border,#cbd5e1);border-radius:12px;padding:14px;background:var(--bg-card,#fff);color:var(--text-primary,#17233a);box-shadow:0 12px 36px #17233a25}.schedule-help header{display:flex;justify-content:space-between;gap:12px;align-items:center}.schedule-help details{border-bottom:1px solid #cbd5e155;padding:10px 0}.schedule-help summary{cursor:pointer;font-size:13px;font-weight:600}.schedule-help p{font-size:13px;line-height:1.5;margin:8px 0}.schedule-help__ask{margin-top:12px}.schedule-help__hint{color:var(--text-secondary,#64748b)}
</style>
