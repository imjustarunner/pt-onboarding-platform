<template>
  <section class="virtual-booked" data-testid="virtual-session-booked" aria-live="polite">
    <h3>{{ booking.uncertain ? 'Check booking status' : booking.partial ? 'Booking needs review' : booking.historical ? 'Past session recorded' : 'Session scheduled' }}</h3>
    <p v-if="booking.uncertain">The booking response was interrupted. Refresh your schedule before trying again; an appointment may already have been saved.</p>
    <template v-else>
      <p><strong>{{ booking.clientLabel }}</strong> · {{ booking.whenLabel }}</p>
      <p>{{ booking.appointments.length }} {{ booking.appointments.length === 1 ? 'appointment is' : 'appointments are' }} saved on your schedule.</p>
      <p v-if="booking.partial">Part of this booking needs review. Keep these saved appointments; do not schedule the same sessions again.</p>
      <p v-if="booking.historical">No booking confirmation, reminders, or video room were created.</p>
      <p v-else-if="booking.noVideo">No video room was created.</p>
      <p v-else-if="busy" role="status">Finishing the session’s video links…</p>
      <p v-else-if="!shareUrl && !booking.externalMeeting">The appointment is saved. Its video link is not ready yet. Retry links to continue with these same appointments.</p>
      <p v-if="booking.externalMeeting && !shareUrl">The session uses an external meeting. You can add its link to the appointment later.</p>
      <label v-if="shareUrl">Client video link<input :value="shareUrl" readonly aria-label="Client video link" /></label>
      <button v-if="shareUrl" type="button" @click="$emit('copy')">{{ copied ? 'Copied' : 'Copy client link' }}</button>
      <p v-if="booking.officeRequestError" role="alert">{{ booking.officeRequestError }}</p>
      <p v-if="booking.googleCalendarWarning">The appointment is saved in the app. {{ booking.googleCalendarWarning }}</p>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup>
defineProps({ booking: { type: Object, required: true }, shareUrl: { type: String, default: '' }, copied: Boolean, busy: Boolean, error: { type: String, default: '' } });
defineEmits(['copy']);
</script>
<style scoped>
.virtual-booked { display: grid; gap: 12px; padding: 24px; }
h3, p { margin: 0; }
label { display: grid; gap: 6px; font-weight: 600; }
input { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #b8c6d8; border-radius: 8px; }
button { justify-self: start; padding: 8px 14px; border-radius: 8px; border: 1px solid #0e766e; background: white; color: #0e766e; cursor: pointer; }
[role="alert"] { color: #b42318; }
</style>
