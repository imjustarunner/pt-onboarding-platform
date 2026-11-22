<template>
  <div class="schedule-quick-rsvp" role="group" :aria-label="'RSVP for ' + (event.shortLabel || event.title || 'event')"
    @mousedown.stop @pointerdown.stop @click.stop @dblclick.stop @keydown.stop>
    <strong v-if="answered" class="rsvp-result" aria-live="polite">{{ answered }}</strong>
    <template v-else>
      <button v-for="choice in choices" :key="choice.label" type="button" :disabled="saving" @click="save(choice)">
        {{ choice.label }}
      </button>
    </template>
    <span v-if="error" role="alert" class="rsvp-feedback">{{ error }}</span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { notifyCompanyEventRsvpChanged } from '../../utils/companyEventRsvpEvents.js';

const props = defineProps({ event: { type: Object, required: true } });
const emit = defineEmits(['saved']);
const choices = [
  { label: 'Yes', meeting: 'accepted', company: 'yes' },
  { label: 'No', meeting: 'declined', company: 'no' },
  { label: 'Maybe', meeting: 'maybe', company: 'maybe' }
];
const selected = ref(props.event.myRsvp);
const saving = ref(false);
const answered = computed(() => ({ accepted: 'Attending', yes: 'Attending', declined: 'Not Attending', no: 'Not Attending', maybe: 'Maybe Attending' })[selected.value] || '');
const error = ref('');
watch(() => props.event.myRsvp, value => { selected.value = value; });

async function save(choice) {
  if (saving.value) return;
  const { eventId, companyEventId, agencyId } = props.event;
  if (!eventId && !companyEventId) return;
  const response = companyEventId ? choice.company : choice.meeting;
  saving.value = true;
  error.value = '';
  try {
    if (companyEventId) {
      await api.post('/me/company-events/' + companyEventId + '/respond', { response, agencyId }, { params: { agencyId }, skipGlobalLoading: true });
      notifyCompanyEventRsvpChanged({ eventId: companyEventId, agencyId, response });
    } else {
      await api.post('/team-meetings/' + eventId + '/my-rsvp', { response }, { skipGlobalLoading: true });
      window.dispatchEvent(new Event('meeting-rsvp-changed'));
    }
    selected.value = response;
    emit('saved', { eventId, companyEventId, response });
  } catch (failure) {
    error.value = failure.response?.data?.error?.message || 'Could not save your RSVP.';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.schedule-quick-rsvp { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; position: relative; z-index: 2; }
button { padding: 2px 5px; border: 1px solid currentColor; border-radius: 5px; font: inherit; font-size: 11px; color: inherit; background: var(--bg-card, white); cursor: pointer; }
.rsvp-result { font-size: 11px; padding: 2px 5px; border-radius: 5px; background: var(--bg-card, white); }
.rsvp-feedback { font-size: 11px; flex-basis: 100%; }
</style>
