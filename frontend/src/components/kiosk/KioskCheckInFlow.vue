<template>
  <div class="arrival-overlay" @pointerdown="touch" @keydown="onKeydown">
    <section ref="panel" class="arrival-panel" role="dialog" aria-modal="true" aria-labelledby="arrival-title" tabindex="-1">
      <header>
        <span class="eyebrow">{{ step === 'done' ? 'ALL SET' : 'YOUR VISIT' }}</span>
        <button class="close" :disabled="saving" aria-label="Close check-in" @click="emit('close')">×</button>
      </header>
      <div class="provider"><KioskPerson :person="provider" /></div>

      <template v-if="step === 'slots'">
        <h2 id="arrival-title">What time is your appointment?</h2>
        <p>Choose your scheduled time. No client name needed.</p>
        <div v-if="loading" class="state" role="status">Finding today’s appointment times…</div>
        <div v-else-if="loadError" class="state" role="alert">{{ loadError }}<button class="secondary" @click="loadSlots">Try again</button></div>
        <div v-else-if="!slots.length" class="state">No appointment times are listed today. Please ask the office team for help.</div>
        <div v-else class="times" aria-label="Appointment times">
          <button v-for="slot in slots" :key="slot.eventId" class="time" :class="{ selected: selected?.eventId === slot.eventId }" :aria-pressed="selected?.eventId === slot.eventId" @click="selected = slot">
            <strong>{{ formatKioskTime(slot.startAt) }}</strong><span>{{ roomLabel(slot) }}</span>
          </button>
        </div>
        <p class="help">Don’t see your time? Please ask the office team. This screen is for scheduled visits.</p>
        <button class="primary" :disabled="!selected || loading || !!loadError" @click="step = 'confirm'">Continue <span aria-hidden="true">→</span></button>
      </template>

      <template v-else-if="step === 'confirm'">
        <h2 id="arrival-title">Ready to check in?</h2>
        <p>We’ll let your provider know you’ve arrived.</p>
        <fieldset class="respondent"><legend>Who is checking in?</legend><label><input v-model="respondentType" type="radio" value="adult_self" /> I’m answering for myself (18 or older)</label><label><input v-model="respondentType" type="radio" value="youth_self" /> I’m answering for myself (under 18)</label><label><input v-model="respondentType" type="radio" value="caregiver" /> I’m answering for my child</label></fieldset>
        <div class="visit"><span>Today at</span><strong>{{ formatKioskTime(selected.startAt) }}</strong><span>{{ roomLabel(selected) }}</span></div>
        <p>Please wait in the lobby after checking in. Your provider will come get you.</p>
        <div v-if="error" class="error" role="alert">{{ error }}</div>
        <div class="actions"><button class="secondary" :disabled="saving" @click="props.directSlot ? emit('close') : (step = 'slots'); error = ''">Back</button><button class="primary" :disabled="saving || !respondentType" @click="checkIn">{{ saving ? 'Checking you in…' : 'I’m here · Check in' }}</button></div>
      </template>

      <KioskVisitForms v-else-if="step === 'forms'" :forms="forms" :saving="saving" :error="error" @submit="submitForms" />
      <template v-else>
        <div class="success" aria-hidden="true">✓</div>
        <h2 id="arrival-title">You’re checked in.</h2>
        <p role="status">An arrival notification is saved for {{ provider.firstName }}. Make yourself comfortable in the lobby.</p>
        <div class="visit compact"><strong>{{ formatKioskTime(selected.startAt) }}</strong><span>{{ roomLabel(selected) }}</span></div>
        <p v-if="formsUnavailable">Please ask your provider about completing the remaining questionnaires.</p>
        <button class="primary" @click="emit('close')">Done</button>
        <p class="help">Returning to the welcome screen in {{ remaining }} seconds.</p>
      </template>
      <button v-if="step !== 'done'" class="secondary start-over" :disabled="saving" @click="emit('close')">Clear selection · Start over</button>
      <footer>Your responses stay private. This screen clears when you finish or start over.</footer>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import api from '../../services/api';
import KioskPerson from './KioskPerson.vue';
import KioskVisitForms from './KioskVisitForms.vue';
import { formatKioskTime } from '../../utils/kioskTime';
const props = defineProps({ provider: { type: Object, required: true }, locationId: { type: [Number, String], required: true }, directSlot: {type:Object,default:null}, timezone: { type: String, default: 'America/Denver' } });
const emit = defineEmits(['close','checked-in','busy']);
const panel = ref(null);
const step = ref(props.directSlot?'confirm':'slots');
const slots = ref(props.directSlot?[props.directSlot]:[]);
const selected = ref(props.directSlot);
const loading = ref(true);
const saving = ref(false);
const loadError = ref('');
const error = ref('');
const remaining = ref(12);
const respondentType = ref('');
const forms = ref([]), formsUnavailable = ref(false);
let submissionKey = crypto.randomUUID();
const initials = computed(() => `${props.provider.firstName?.[0] || ''}${props.provider.lastName?.[0] || ''}`);
const roomLabel = (slot) => slot.roomNumber ? `Office ${slot.roomNumber}` : slot.roomName || 'Your provider’s office';
let activityAt = Date.now();
let timer;
let previousFocus;
let disposed = false;
function touch() { activityAt = Date.now(); }
async function loadSlots() {
  loading.value = true; loadError.value = ''; selected.value = null;
  try { const { data } = await api.get(`/kiosk/${props.locationId}/providers/${props.provider.id}/slots-today`); slots.value = data?.slots || []; }
  catch { loadError.value = 'We couldn’t load appointment times. Please try again or ask the office team.'; }
  finally { loading.value = false; }
}
async function checkIn() {
  if (saving.value || !selected.value) return;
  saving.value = true; error.value = '';
  try {
    const { data } = await api.post(`/kiosk/${props.locationId}/checkin`, { eventId: selected.value.eventId, providerId: props.provider.id, submissionKey, respondentType:respondentType.value, ...(props.directSlot?{appointmentStartAt:props.directSlot.appointmentStartAt,nextHour:!!props.directSlot.nextHour}:{}) });
    if (!data?.ok || !data?.notification?.inApp) throw new Error('Unconfirmed arrival');
    if (!disposed && props.directSlot) { emit('checked-in'); return; }
    if (!disposed) { forms.value = data.submission?.forms || []; formsUnavailable.value = !!data.submission?.formsUnavailable; step.value = forms.value.length && !data.submission?.completed ? 'forms' : 'done'; remaining.value = 12; }
  } catch (err) { error.value = err.response?.data?.error?.message || 'We couldn’t confirm your check-in. Try again or ask the office team for help.'; }
  finally { saving.value = false; touch(); }
}
async function submitForms(answers) {
  if (saving.value) return; saving.value = true; error.value = '';
  try {
    const {data} = await api.post(`/kiosk/${props.locationId}/checkin/forms`,{submissionKey,answers});
    if (!data?.ok) throw new Error('Unconfirmed submission');
    if (!disposed) {step.value='done'; remaining.value=12;}
  } catch(e) {error.value=e.response?.data?.error?.message || 'Your responses could not be saved. Please try again.';}
  finally {saving.value=false;touch();}
}
function onKeydown(event) {
  touch();
  if (event.key === 'Escape' && !saving.value) emit('close');
  if (event.key !== 'Tab') return;
  const buttons = [...panel.value.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
  const first = buttons[0], last = buttons.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
watch(saving,value=>emit('busy',value));
watch(step, async () => { touch(); await nextTick(); panel.value?.focus(); });
onMounted(() => {
  previousFocus = document.activeElement; panel.value?.focus(); if(!props.directSlot) loadSlots(); else loading.value=false;
  timer = setInterval(() => {
    if (!saving.value && ['slots', 'confirm'].includes(step.value)) {
      slots.value = slots.value.filter(s => !s.checkinClosesAt || Date.parse(s.checkinClosesAt) > Date.now());
      if (selected.value && !slots.value.some(s => s.eventId === selected.value.eventId)) {
        selected.value = null; step.value = 'slots'; error.value = 'That check-in time has passed. Please choose another appointment or ask the office team.';
      }
    }
    if (step.value === 'done') { remaining.value -= 1; if (remaining.value <= 0) emit('close'); }
    else if (!props.directSlot && !saving.value && Date.now() - activityAt > 180_000) emit('close');
  }, 1000);
});
onUnmounted(() => { disposed = true; submissionKey = null; forms.value = []; clearInterval(timer); previousFocus?.focus(); });
</script>

<style scoped>
.arrival-overlay{position:fixed;inset:0;z-index:1000;background:#122e35a8;backdrop-filter:blur(9px);display:flex;align-items:center;justify-content:center;padding:24px;color:#193d40;font-family:inherit}
.arrival-panel{width:100%;max-width:590px;max-height:92dvh;overflow:auto;background:#fffefa;border-radius:28px;padding:30px;box-shadow:0 30px 100px #102e3540;outline:none;box-sizing:border-box}
header{display:flex;align-items:center;justify-content:space-between}.eyebrow{font-size:11px;letter-spacing:2px;font-weight:800;color:#627972}.close{width:48px;height:48px;border:1px solid #dae3dc;border-radius:50%;background:transparent;font-size:28px;color:inherit;cursor:pointer}
.provider{display:flex;gap:14px;align-items:center;margin:14px 0 26px}.avatar{display:grid;place-items:center;background:#e7eee3;width:54px;height:54px;border-radius:18px;font-weight:700}.provider strong,.provider div span{display:block}.provider strong{font-size:19px}.provider div span{font-size:13px;color:#657774;margin-top:4px}
h2{font-size:32px;line-height:1.13;letter-spacing:-1px;margin:0 0 14px}p{line-height:1.65;color:#617370}.times{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:24px 0;max-height:300px;overflow:auto}.time{border:1px solid #dce5dc;border-radius:14px;padding:18px 8px;background:white;color:inherit;cursor:pointer}.time strong,.time span{display:block}.time strong{font-size:19px}.time span{font-size:12px;margin-top:6px}.time.selected{background:#e7f0e2;border:2px solid #416952;padding:17px 7px}
.respondent{border:1px solid #cedbd2;border-radius:12px;padding:16px}.respondent label{display:flex;align-items:center;gap:12px;min-height:48px}.respondent input{width:22px;height:22px}
.start-over{width:100%;margin-top:18px}.primary,.secondary{min-height:54px;padding:14px 22px;border-radius:14px;font:inherit;font-weight:700;cursor:pointer}.primary{background:#234e45;color:white;border:1px solid #234e45;width:100%;display:flex;justify-content:space-between;align-items:center}.secondary{border:1px solid #cedbd2;background:transparent;color:#234e45}.actions{display:flex;gap:10px}.actions .primary{flex:1}.help{font-size:12px}.visit{padding:25px;background:#eef2e8;border-radius:18px;margin:24px 0;display:flex;flex-direction:column;gap:8px}.visit strong{font-size:36px;letter-spacing:-1px}.visit.compact{flex-direction:row;justify-content:space-between;align-items:center}.visit.compact strong{font-size:23px}.success{width:66px;height:66px;background:#e6efde;color:#426c45;font-size:38px;border-radius:50%;display:grid;place-items:center;margin:12px 0 24px}.state,.error{padding:20px;background:#f2f0e6;border-radius:12px;margin:18px 0;line-height:1.6}.state button{display:block;margin-top:12px}.error{color:#8c392e;background:#fff1eb}footer{border-top:1px solid #e6eae2;margin-top:26px;padding-top:18px;font-size:11px;color:#6e7c73;text-align:center}button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:3px solid #b78432;outline-offset:4px}@media(max-width:520px){.arrival-overlay{padding:10px}.arrival-panel{padding:22px;border-radius:20px}h2{font-size:27px}.times{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
