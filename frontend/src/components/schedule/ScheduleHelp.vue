<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch, computed } from 'vue';
import { useAskAssistant } from '../../composables/useAskAssistant';
const assistant = useAskAssistant();
const props=defineProps({learningOnly:Boolean,tutoring:Boolean});
const root = ref(null); const open = ref(false);
const panel = ref(null), trigger = ref(null), position = ref({}), portal = ref('body');
const topics = [
  ['Show weekends or change the layout', 'Open Calendar settings, then Display. Change visible days, row height, overlapping cards, and appointment colors. A weekend with scheduled activity stays visible.'],
  ['Jump to a date or change the time zone', 'Select the date range above the schedule to pick a date. Use Day, Agenda or Week to choose your view. Select Time Zone next to those buttons to change the calendar display.'],
  ['Connect a personal calendar', 'Open Calendar settings, then Connections. Use Connect a personal calendar for an Apple, Google or Outlook subscription. Client appointments appear as Client session on connected calendars.'],
  ['See when coworkers are busy', 'Open Calendar settings, then People, and turn on Peers (busy). The overlay shows busy times with client details hidden.'],
  ['Record a past session', 'Choose the date and time, then Book Session. For an in-person visit, choose where it took place. A past visit can be recorded without a room reservation.'],
  ['Use full screen', 'Choose Full screen beside the date controls to give your calendar more room. Choose Exit full screen or press Escape to return.'],
  ['Understand the colors', 'Open Color key to see the appointment types. Select Color key again to collapse it.'],
  ['Book around conflicts', 'When dates overlap a vacation, meeting, supervision or another appointment, review the listed dates. Choose Book all available dates to keep the selected cadence and skip those dates. Confirm overlap keeps the commitments and books the reviewed dates.'],
  ['Schedule an appointment', 'Click an empty hour, choose a quarter-hour from the + control, or drag across a time range. Choose Book Session, select the client, and review before saving.'],
  ['Enable client session booking', 'An administrator can enable each provider under Settings → Provider Scheduling → Client session booking. ITSCO account readiness is reviewed through Individual account conversion.'],
  ['Join or share a video session', 'Open a Video appointment and select Join video. Use Copy link for an expected participant. The assigned provider can allow guests with the link on an older Meet room.'],
  ['Use a phone for a session', 'Use the verified dial-in number and PIN from the session email. In Google Meet, an organizer with dial-out can invite a participant by phone during the call. For an Audio only appointment, call the client and record the reason in the note.'],
  ['Cancel one appointment', 'Open the appointment and choose Change appointment. Enter the reason to share with the client, review follow-up and the generated note, then confirm.'],
  ['Keep or release the office when canceling', 'Open Change appointment, choose Canceled, then review Visits and office time. Keep my office reserved removes the client visit and keeps the room for reuse. Release the office time opens it through the normal office-booking flow. The canceled visit and signed note remain in history.'],
  ['Unschedule a recurring client forward', 'Open the first upcoming visit to cancel. In Change appointment, choose Canceled, then This and future visits in this client’s series. Choose whether to keep or release the associated office time, review every affected date and note, and sign. Progress continues on the calendar. Earlier visits, other series and active client services are preserved. Shared visits are managed individually.'],
  ['Cancel a provider’s day', 'Use Cancel day for the selected provider and date. Review affected appointments, hosted meetings and openings before confirming. Other recurring dates remain scheduled.'],
  ['Remove an opening', 'Open the published availability and choose Remove availability. Choose this occurrence or this and future occurrences. Existing appointments and room reservations stay booked.'],
  ['Contact a client', 'Open the scheduled appointment. Under Info, choose Contact client beside the Conversa logo. Select the client/contact and channel, then review your message before sending.'],
  ['Confirm a past session without writing the note', 'On an eligible past clinical session, choose Yes, No, or Later. Yes confirms attendance and may collect the authorized verified copay. No immediately holds the service copay; finish missed-session or cancellation details now or later. Later keeps an unanswered session on hold. A saved authored session note or a completed cancellation resolves the attendance prompt. Late confirmations go to billing review.'],
  ['Leave a session pin', 'Open the appointment and add a Session pin. It stays on the appointment. Choose “In this appointment and on the schedule” to flag it on the schedule face. Staff with full schedule access can see it; clients cannot.'],
  ['Link an existing office booking', 'Open the session’s Info tab and choose Link an existing office reservation. Select your reserved room. For a recurring series, choose this and future saved appointments. Each date needs an existing reservation; session notes and dates are preserved.'],
  ['Open part of a booked office block', 'Click an hour in the reserved office block. Choose Only this hour or Whole office block in the app. Back to calendar closes the choice without changing your selection or reservation.'],
  ['Split an office hour between sessions', 'Edit the first appointment to shorten it. The unused time stays reserved to you. Open that part of the calendar to book the next session or use Find an open room.'],
  ['Send a school family update', 'Click the school assignment to open its details, then choose Send family update. Review that school’s recipients before sending.'],
  ['Manage a room reservation', 'Open the room block. Confirm room use marks the time occupied. Mark vacant releases that date for coworkers and keeps the recurring reservation. Confirm room use to reclaim a vacant slot while it is still free. Forfeit room now and forward ends the reservation.'],
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
const tutoringTopics=[
 ['Publish tutoring hours','Choose Open Slot, then Tutoring. Select virtual or in person. A one-time opening publishes one tutoring session; weekly tutoring hours repeat through the selected end date. Subjects and grades come from your tutoring profile.'],
 ['Book an assigned student','Choose Book session, then Tutoring if you provide more than one service. Select your assigned student, format and time. Review the session before saving.'],
 ['Message a student or family','Open the student’s Learning record or secure messages. Review the recipient and share only the tutoring information intended for that family.'],
 ['Write tutoring notes','Use the booked session’s Learning workspace. Scheduling notes stay in the app for staff with scheduling access. Publish family updates separately; private tutor notes stay private.'],
 ['Change or remove tutoring hours','Open the published opening and choose this occurrence or this and future occurrences. Existing bookings are preserved.'],
 ['Reachable hours and bookable hours','Availability preferences say when you can be reached. Use Open Slot to publish actual bookable tutoring hours. Contact the office for assignment or location changes.']
];
const visibleTopics=computed(()=>props.learningOnly?tutoringTopics:props.tutoring?[...tutoringTopics,...topics.map(([title,answer])=>['Counseling / general calendar: '+title,answer])]:topics);
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
      <details v-for="[title, answer] in visibleTopics" :key="title"><summary>{{ title }}</summary><p>{{ answer }}</p></details>
      <button type="button" class="schedule-help__ask" @click="ask">Ask the assistant…</button>
      <p class="schedule-help__hint">Ask for guidance or help finding a time. Review scheduling changes before confirming them.</p>
    </section>
    </Teleport>
  </div>
</template>
<style scoped>
.schedule-help{position:relative}.schedule-help__trigger{white-space:nowrap}.schedule-help button{font:inherit;cursor:pointer;border:1px solid var(--border,#cbd5e1);border-radius:8px;padding:7px 10px;background:var(--bg-card,#fff);color:inherit}.schedule-help__panel{position:fixed;box-sizing:border-box;width:min(370px,calc(100vw - 40px));max-height:calc(100dvh - 24px);overflow:auto;z-index:2100;border:1px solid var(--border,#cbd5e1);border-radius:12px;padding:14px;background:var(--bg-card,#fff);color:var(--text-primary,#17233a);box-shadow:0 12px 36px #17233a25}.schedule-help header{display:flex;justify-content:space-between;gap:12px;align-items:center}.schedule-help details{border-bottom:1px solid #cbd5e155;padding:10px 0}.schedule-help summary{cursor:pointer;font-size:13px;font-weight:600}.schedule-help p{font-size:13px;line-height:1.5;margin:8px 0}.schedule-help__ask{margin-top:12px}.schedule-help__hint{color:var(--text-secondary,#64748b)}
</style>
