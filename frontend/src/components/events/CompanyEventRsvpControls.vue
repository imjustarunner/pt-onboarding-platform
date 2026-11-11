<template>
  <section v-if="event.isInvitedCompanyEvent" class="company-rsvp" aria-label="Your event RSVP">
    <div class="rsvp-heading"><div><strong>Your RSVP: {{ responseLabel }}</strong><small>{{ event.mandatory ? 'Required attendance' : 'Optional invitation' }}</small></div><span v-if="response === 'maybe'" class="tentative">Tentative</span></div>
    <p class="rsvp-help">{{ event.canRsvp === false ? 'RSVP changes are closed. Contact the organizer if your plans have changed.' : 'Choose Yes, Maybe or No. You can change your response here.' }}</p>
    <div class="rsvp-choices" role="group" aria-label="Change event RSVP">
      <button v-for="choice in choices" :key="choice.value" type="button" :class="{ selected: response === choice.value }" :aria-pressed="response === choice.value" :disabled="saving || event.canRsvp !== true" @click="save(choice.value)">{{ saving === choice.value ? 'Saving…' : choice.label }}</button>
    </div>
    <p v-if="notice" class="rsvp-notice" role="status">{{ notice }}</p><p v-if="error" class="rsvp-error" role="alert">{{ error }}</p>
    <a v-if="event.staffPageUrl" class="rsvp-details" :href="event.staffPageUrl">Details, votes &amp; potluck →</a>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
import { notifyCompanyEventRsvpChanged } from '../../utils/companyEventRsvpEvents.js';

const props = defineProps({ event: { type: Object, required: true } });
const emit = defineEmits(['changed']);
const choices = [{ value: 'yes', label: 'Yes' }, { value: 'maybe', label: 'Maybe' }, { value: 'no', label: 'No' }];
const normalize = value => ({ yes:'yes', y:'yes', '1':'yes', no:'no', n:'no', '2':'no', maybe:'maybe', m:'maybe', '3':'maybe' })[String(value || '').toLowerCase()] || '';
const eventId = computed(() => Number(props.event.companyEventId || props.event.id));
const initialResponse = () => normalize(props.event.myRsvp || props.event.response || props.event.myResponse?.key || props.event.myResponse?.responseKey);
const response = ref(initialResponse()), saving = ref(''), notice = ref(''), error = ref('');
const responseLabel = computed(() => ({ yes:'Yes', maybe:'Maybe', no:'No' })[response.value] || 'Not yet answered');
let generation = 0;
watch(() => [eventId.value, props.event.agencyId, initialResponse()], () => { generation++; response.value=initialResponse(); saving.value=''; notice.value=''; error.value=''; });
onBeforeUnmount(() => { generation++; });
async function save(value) {
  if (saving.value || props.event.canRsvp !== true || !eventId.value) return;
  const version=generation, id=eventId.value, agencyId=Number(props.event.agencyId) || undefined;
  saving.value=value; error.value=''; notice.value='';
  try {
    const {data}=await api.post(`/me/company-events/${id}/respond`, {response:value,agencyId}, {params:{agencyId}});
    if(version!==generation)return;
    response.value=normalize(data?.response || data?.responseKey) || value;
    notice.value=`RSVP saved: ${({yes:'Yes',maybe:'Maybe',no:'No'})[response.value]}.`;
    const change={eventId:id,agencyId,response:response.value};
    notifyCompanyEventRsvpChanged(change);emit('changed',change);
  } catch(e) { if(version===generation)error.value=e?.response?.data?.error?.message || 'Could not save your RSVP. Please try again.'; }
  finally { if(version===generation)saving.value=''; }
}
</script>

<style scoped>
.company-rsvp{border:1px solid #d8e4dc;background:#f7faf6;border-radius:12px;padding:16px;margin-top:16px;color:#244638}.rsvp-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.rsvp-heading strong{display:block;font-size:14px}.rsvp-heading small{display:block;margin-top:4px;color:#62776a;font-size:12px}.tentative{background:#fff1cf;color:#73551c;border-radius:20px;padding:5px 10px;font-size:12px}.rsvp-help{font-size:13px;line-height:1.6;color:#627267;margin:12px 0}.rsvp-choices{display:flex;gap:8px;flex-wrap:wrap}.rsvp-choices button{min-width:76px;border:1px solid #cbdcd0;border-radius:8px;padding:9px 14px;background:#fff;color:#315b46;font:inherit;font-size:13px;cursor:pointer}.rsvp-choices button.selected{background:#315e4c;border-color:#315e4c;color:#fff}.rsvp-choices button:disabled{opacity:.6;cursor:default}.rsvp-details{display:inline-block;margin-top:14px;font-size:13px;color:#315e4c;text-underline-offset:3px}.rsvp-notice,.rsvp-error{margin:12px 0 0;font-size:13px;line-height:1.6}.rsvp-notice{color:#315e4c}.rsvp-error{color:#a7382a}button:focus-visible,a:focus-visible{outline:3px solid #80aa91;outline-offset:3px}
</style>
