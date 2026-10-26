<template>
          <section class="event-travel-panel" id="event-travel">
            <h2>Travel time</h2>
            <p>Record actual travel to and from this event as Support Activity → Approved Travel, paid at your Support Activity rate. Submit each direction separately from time checked in at the event.</p>
            <p v-if="loading">Loading travel access…</p>
            <p v-else-if="!canSubmitTravel && !error">A coordinator must assign you to an event date before you can submit travel.</p>
            <p v-if="error" role="alert" class="error">{{ error }}</p>
            <form v-if="canSubmitTravel" @submit.prevent="submitTravel">
              <label>Travel direction<select v-model="travelDirection" required><option value="to_event">To the event</option><option value="from_event">From the event</option></select></label>
              <p>Enter times in your device timezone: {{ deviceTimezone }}.</p>
              <div class="travel-fields">
                <label>Travel started<input v-model="travelStartedAt" type="datetime-local" required /></label>
                <label>Travel ended<input v-model="travelEndedAt" type="datetime-local" :min="travelStartedAt" required /></label>
              </div>
              <label class="attestation"><input v-model="travelAttestation" type="checkbox" required /> This is my actual travel time and I have not logged it elsewhere.</label>
              <button type="submit" class="btn btn-secondary" :disabled="busy || !travelAttestation || !travelStartedAt || !travelEndedAt">Submit travel for review</button>
            </form>
            <p v-if="notice" role="status">{{ notice }}</p>
          </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ eventId: { type: [Number, String], required: true }, participation: { type: Object, default: null } });
const loadedParticipation = ref(null);
const loading = ref(false), error = ref(''), notice = ref(''), busy = ref(false);
const travelStartedAt = ref(''), travelEndedAt = ref(''), travelAttestation = ref(false), travelDirection = ref('to_event');
const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const canSubmitTravel = computed(() => {
  const p = props.participation || loadedParticipation.value;
  return !!(p?.canSubmitTravel || p?.assigned || p?.lastPunch);
});
watch(() => [props.eventId, props.participation], async ([eventId, participation]) => {
  loadedParticipation.value = null; error.value = ''; notice.value = '';
  travelStartedAt.value = ''; travelEndedAt.value = ''; travelAttestation.value = false;
  if (!eventId || participation) return;
  loading.value = true;
  try {
    const { data } = await api.get(`/me/company-events/${eventId}/participation`);
    if (String(props.eventId) === String(eventId)) loadedParticipation.value = data;
  } catch (e) {
    if (String(props.eventId) === String(eventId)) error.value = e?.response?.data?.error?.message || 'Could not load travel access.';
  } finally { if (String(props.eventId) === String(eventId)) loading.value = false; }
}, { immediate: true });
async function submitTravel() {
  if (busy.value || !travelAttestation.value) return;
  const start = new Date(travelStartedAt.value);
  const end = new Date(travelEndedAt.value);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) { error.value = 'Travel end must be after travel start.'; return; }
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const { data } = await api.post(`/me/company-events/${props.eventId}/travel-context`, { travelStartedAt: start.toISOString(), travelEndedAt: end.toISOString(), travelDirection: travelDirection.value, attestation: true });
    await api.post('/payroll/me/time-claims', data);
    notice.value = 'Travel time submitted for review.';
    travelStartedAt.value = ''; travelEndedAt.value = ''; travelAttestation.value = false;
  } catch (e) { error.value = e?.response?.data?.error?.message || 'Could not submit travel time.'; }
  finally { busy.value = false; }
}
</script>
<style scoped>
.event-travel-panel { margin: 16px 0; padding: 18px; border: 1px solid var(--border-color, #e2e8f0); border-radius: 10px; background: var(--surface-elevated, #fff); }
h2 { margin-top: 0; font-size: 20px; } p { line-height: 1.5; }
.travel-fields { display: flex; flex-wrap: wrap; gap: 16px; } .travel-fields label { flex: 1; min-width: 190px; }
input[type="datetime-local"], select { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; display: block; margin-top: 6px; }
.attestation { display: block; margin: 16px 0; font-size: 14px; line-height: 1.5; } .error { color: #b91c1c; }
</style>
