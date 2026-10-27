<template>
  <div class="rsvp-backdrop" @click.self="close" @keydown.esc="close">
    <section ref="dialog" class="rsvp-dialog" role="dialog" aria-modal="true" aria-labelledby="supervision-rsvp-title" tabindex="-1" @keydown.tab="trapFocus">
      <header><h2 id="supervision-rsvp-title">Your group supervision RSVP</h2><button type="button" class="btn btn-secondary" :disabled="saving" @click="close">Close</button></header>
      <p>{{ session.counterpartyName || session.supervisorName || 'Group supervision' }} · {{ when }}</p>
      <p v-if="loading" role="status">Loading your RSVP…</p>
      <template v-else-if="rsvp">
        <p><strong>Current RSVP: {{ statusLabel }}</strong></p>
        <p v-if="rsvp.reason">Your reason: {{ rsvp.reason }}</p>
        <form v-if="rsvp.canRespond" @submit.prevent="save">
          <fieldset :disabled="saving">
            <legend>Update your response for this session</legend>
            <label><input v-model="response" type="radio" value="accepted" :disabled="!canAccept" /> I’m attending</label>
            <label><input v-model="response" type="radio" value="declined" /> I’m not attending</label>
            <label v-if="response === 'declined' && rsvp.required">Reason for not attending (required)
              <textarea v-model="reason" maxlength="2000" rows="3" required />
            </label>
          </fieldset>
          <p v-if="!canAccept">Registration has closed. You can still update your RSVP to not attending.</p>
          <p>This updates only your RSVP for this date.</p>
          <button type="submit" class="btn btn-primary" :disabled="!canSave">{{ saving ? 'Saving…' : 'Save RSVP' }}</button>
        </form>
        <p v-else>RSVP changes are no longer available for this session.</p>
      </template>
      <p v-if="error" role="alert">{{ error }}</p>
      <button v-if="!loading && !rsvp" type="button" class="btn btn-secondary" @click="load">Try again</button>
      <p v-if="saved" role="status">Your RSVP has been updated.</p>
      <footer><button type="button" class="btn btn-secondary" :disabled="saving" @click="$emit('details')">View session details</button></footer>
    </section>
  </div>
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import api from '../../services/api';
import { supervisionSignupState } from '../../utils/supervisionSignupState.js';
const props = defineProps({ session: { type: Object, required: true } });
const emit = defineEmits(['close', 'details', 'saved']);
const dialog = ref(null), rsvp = ref(null), loading = ref(true), saving = ref(false), error = ref(''), saved = ref(false);
const response = ref(''), reason = ref('');
const previousFocus = document.activeElement;
const when = computed(() => new Date(props.session.startAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }));
const accepted = computed(() => ['SIGNED_UP', 'JOINED'].includes(rsvp.value?.status));
const canAccept = computed(() => rsvp.value?.canAccept && (props.session.enrollmentMode !== 'signup_only' || accepted.value || supervisionSignupState(props.session) === 'open'));
const statusLabel = computed(() => accepted.value ? 'Attending' : rsvp.value?.status === 'DECLINED' ? 'Not attending' : 'No response yet');
const canSave = computed(() => !saving.value && rsvp.value?.canRespond && (response.value === 'accepted'
  ? canAccept.value : response.value === 'declined' && (!rsvp.value.required || reason.value.trim())));
function close() { if (!saving.value) emit('close'); }
function trapFocus(event) {
  const controls = [...dialog.value.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')].filter(el => !el.matches(':disabled'));
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && [first, dialog.value].includes(document.activeElement)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
async function load() {
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get(`/supervision/sessions/${props.session.id}/rsvp`);
    rsvp.value = data;
    response.value = accepted.value ? 'accepted' : data.status === 'DECLINED' ? 'declined' : '';
    reason.value = data.reason || '';
  } catch (e) { error.value = e.response?.data?.error?.message || 'Could not load your RSVP.'; }
  finally { loading.value = false; }
}
async function save() {
  if (!canSave.value) return;
  saving.value = true; error.value = ''; saved.value = false;
  const nextResponse = response.value;
  const nextReason = nextResponse === 'declined' && rsvp.value.required ? reason.value.trim() : '';
  try {
    await api.post(`/supervision/sessions/${props.session.id}/rsvp`, { response: nextResponse, reason: nextReason });
    rsvp.value = { ...rsvp.value, status: nextResponse === 'accepted' ? 'SIGNED_UP' : 'DECLINED', reason: nextReason };
    saved.value = true;
    emit('saved');
  } catch (e) { error.value = e.response?.data?.error?.message || 'Could not save your RSVP. Please try again.'; }
  finally { saving.value = false; }
}
onMounted(() => { dialog.value?.focus(); void load(); });
onUnmounted(() => previousFocus?.focus?.());
</script>
<style scoped>
.rsvp-backdrop { position:fixed; inset:0; z-index:10004; background:#0f172a66; display:flex; align-items:center; justify-content:center; padding:20px; }
.rsvp-dialog { width:min(560px,100%); max-height:90vh; overflow:auto; padding:24px; border-radius:20px; background:var(--bg-card,#fff); color:var(--text-primary,#172033); box-shadow:0 20px 70px #0f172a33; }
header { display:flex; align-items:center; justify-content:space-between; gap:12px; } h2 { margin:0; font-size:1.3rem; }
fieldset { border:1px solid var(--border-color,#dce3ee); border-radius:12px; padding:14px; } label { display:block; margin:12px 0; }
textarea { display:block; width:100%; box-sizing:border-box; margin-top:8px; padding:10px; font:inherit; } footer { margin-top:20px; } [role=alert] { color:#b91c1c; }
</style>
