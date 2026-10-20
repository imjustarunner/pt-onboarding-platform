<template>
 <Teleport to="body">
  <section v-if="prompts.length || error" class="dashboard-invitations" aria-label="Training and supervision invitations">
    <p v-if="error" class="invitation-error" role="alert">{{ error }}</p>
    <div class="invitation-list" aria-live="polite">
      <article v-for="event in visible" :key="event.key" class="invitation-toast" :class="{ 'invitation-toast--required': event.required }">
        <div class="invitation-copy">
          <span class="invitation-kind">{{ event.type === 'training' ? 'Training' : 'Group supervision' }} · {{ event.required ? 'Required' : 'Optional' }}</span>
          <h3>{{ event.title }}</h3>
          <p>{{ when(event) }}</p>
          <p v-if="event.signupOnly" class="signup-countdown">Sign-up required · {{ countdown(event) }}</p>
          <p v-else>{{ event.required ? 'Please RSVP. Include a reason if you cannot attend.' : 'You are welcome to attend. Not interested stops reminders; no reason is needed.' }}</p>
        </div>
        <div class="invitation-actions">
          <button type="button" class="attend" :disabled="!!busy || (event.signupOnly && !signupAvailable(event))" @click="respond(event, 'accepted')">{{ event.signupOnly ? 'Sign up' : 'I’m attending' }}</button>
          <button type="button" :disabled="!!busy" @click="details(event)">More info</button>
          <button v-if="!event.required" type="button" :disabled="!!busy" @click="respond(event, 'declined')">Dismiss · not interested</button>
          <button v-else type="button" :disabled="!!busy" :aria-expanded="declining === event.key" @click="declining = declining === event.key ? '' : event.key; reason = ''">I can’t attend</button>
        </div>
        <form v-if="event.required && declining === event.key" class="decline-form" @submit.prevent="respond(event, 'declined')">
          <label :for="`absence-${event.key}`">Reason for not attending (required)</label>
          <textarea :id="`absence-${event.key}`" v-model="reason" maxlength="2000" rows="2" required />
          <button type="submit" :disabled="!!busy || !reason.trim()">Save response</button>
        </form>
      </article>
    </div>
    <button v-if="prompts.length > 1" type="button" class="show-invitations" :aria-expanded="showAll" @click="showAll = !showAll">{{ showAll ? 'Show fewer invitations' : `Show all ${prompts.length} invitations` }}</button>
    <div v-if="selectedTraining" class="training-details-backdrop" @click.self="closeDetails" @keydown.esc="closeDetails" @keydown.tab="trapDialogFocus">
      <section ref="dialog" class="training-details-modal" role="dialog" aria-modal="true" aria-label="Training details" tabindex="-1">
        <button type="button" class="close-details" aria-label="Close training details" @click="closeDetails">×</button>
        <ScheduledTrainingPanel :event-id="selectedTraining" @rsvp-saved="load" />
      </section>
    </div>
  </section>
 </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import ScheduledTrainingPanel from './ScheduledTrainingPanel.vue';
const props = defineProps({ userId: { type: [Number, String], required: true } });
const route = useRoute(), router = useRouter();
const prompts = ref([]), error = ref(''), busy = ref(''), now = ref(Date.now());
const declining = ref(''), reason = ref(''), selectedTraining = ref(null), showAll = ref(false);
const dialog = ref(null); let previousFocus;
const visible = computed(() => showAll.value ? prompts.value : prompts.value.slice(0, 1));
let timer, inFlight = false, mounted = true;
function when(event) {
  return new Intl.DateTimeFormat('en-US', { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:event.timeZone || 'America/Denver', timeZoneName:'short' }).format(new Date(event.startAt));
}
function signupAvailable(event) { return Date.parse(event.signupClosesAt) > now.value; }
function countdown(event) {
  const minutes = Math.ceil((Date.parse(event.signupClosesAt) - now.value) / 60000);
  if (!(minutes > 0)) return 'Registration closed';
  return `${minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`} left to register`;
}
async function load() {
  now.value = Date.now();
  if (inFlight || !props.userId || document.visibilityState === 'hidden') return;
  inFlight = true; const uid = props.userId;
  try {
    const { data } = await api.get('/meeting-invitations/upcoming', { skipGlobalLoading:true });
    if (mounted && uid === props.userId) prompts.value = Array.isArray(data?.prompts) ? data.prompts : [];
  } catch { /* Existing cards remain actionable during a temporary refresh failure. */ }
  finally { inFlight = false; }
}
async function respond(event, response) {
  if (busy.value) return;
  busy.value = event.key; error.value = '';
  try {
    const base = event.type === 'training' ? `/team-meetings/${event.id}/training/rsvp`
      : `/supervision/sessions/${event.id}/${event.signupOnly ? response === 'accepted' ? 'signup' : 'signup-dismiss' : 'rsvp'}`;
    await api.post(base, { response, ...(event.required && response === 'declined' ? {reason:reason.value.trim()} : {}) });
    prompts.value = prompts.value.filter(row => row.key !== event.key);
    declining.value = ''; reason.value = '';
    window.dispatchEvent(new CustomEvent('meeting-rsvp-changed'));
  } catch (e) { error.value = e.response?.data?.error?.message || 'Your response could not be saved. Please try again.'; }
  finally { busy.value = ''; }
}
function details(event) {
  if (event.type === 'training') { previousFocus=document.activeElement; selectedTraining.value = event.id; void nextTick(()=>dialog.value?.focus()); return; }
  const prefix = route.params.organizationSlug ? `/${route.params.organizationSlug}` : '';
  router.push({ path:`${prefix}/my-schedule`, query:{eventId:event.id,eventKind:'SUPERVISION',weekStart:event.startAt.slice(0,10)} });
}
function closeDetails() { selectedTraining.value=null; void nextTick(()=>previousFocus?.focus?.()); }
function trapDialogFocus(event) {
  const targets=[...(dialog.value?.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') || [])];
  if (!targets.length) { event.preventDefault(); dialog.value?.focus(); return; }
  if (event.shiftKey && (document.activeElement === targets[0] || document.activeElement === dialog.value)) { event.preventDefault(); targets.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === targets.at(-1)) { event.preventDefault(); targets[0].focus(); }
}
watch(() => props.userId, () => { prompts.value=[]; selectedTraining.value=null; void load(); });
onMounted(() => { void load(); timer=setInterval(load,60000); window.addEventListener('focus',load); window.addEventListener('meeting-rsvp-changed',load); });
onUnmounted(() => { mounted=false; clearInterval(timer); window.removeEventListener('focus',load); window.removeEventListener('meeting-rsvp-changed',load); });
</script>

<style scoped>
.dashboard-invitations { position: fixed; bottom: max(16px, env(safe-area-inset-bottom)); right: 16px; width: min(420px, calc(100vw - 32px)); z-index: 1000; max-height: 65vh; overflow: auto; box-shadow: 0 8px 32px #172a3340; border-radius: 14px; background: var(--bg, #fff); }

.dashboard-invitations{margin:0}.invitation-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:10px}.invitation-toast{border:1px solid var(--border,#a9cfc1);border-left:4px solid #248065;border-radius:12px;background:var(--bg-card,#f2faf6);padding:14px;color:var(--text-primary,#183e35)}.invitation-toast--required{border-left-color:#98630b}.invitation-kind{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em}.invitation-copy h3{font-size:1rem;margin:5px 0}.invitation-copy p{font-size:.85rem;line-height:1.45;margin:5px 0}.signup-countdown{font-weight:700}.invitation-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.dashboard-invitations button{font:inherit;min-height:40px;padding:7px 10px;border:1px solid var(--border,#b4c8bf);border-radius:7px;background:var(--bg-card,#fff);color:inherit;cursor:pointer}.dashboard-invitations button.attend{background:#17633f;color:#fff;border-color:#17633f;font-weight:600}.dashboard-invitations button:disabled{opacity:.55;cursor:default}.decline-form{display:grid;gap:7px;margin-top:10px}.decline-form textarea{width:100%;font:inherit;border:1px solid var(--border,#a9cfc1);border-radius:6px}.show-invitations{margin-top:8px}.invitation-error{color:var(--danger,#a32727)}.training-details-backdrop{position:fixed;inset:0;background:#11182788;z-index:2100;display:grid;place-items:center;padding:20px}.training-details-modal{position:relative;background:var(--bg-card,#fff);border-radius:14px;width:min(800px,100%);max-height:85dvh;overflow:auto;padding:38px 12px 12px}.close-details{position:absolute;right:12px;top:8px;font-size:1.5rem!important}.dashboard-invitations button:focus-visible{outline:3px solid #5b7fc5;outline-offset:2px}
</style>
