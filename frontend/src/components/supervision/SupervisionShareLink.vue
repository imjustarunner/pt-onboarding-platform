<template>
  <div v-if="url" class="supervision-share">
    <button type="button" class="btn btn-secondary btn-sm" @click="copy">{{ copied ? 'Link copied' : 'Copy session link' }}</button>
    <button v-if="canInviteGuest" type="button" class="btn btn-secondary btn-sm" :disabled="guestBusy" @click="copyGuest">{{ guestBusy ? 'Preparing link…' : 'Invite a guest' }}</button>
    <div v-if="guestUrl" class="supervision-share-details">
      <label>Guest link <input readonly :value="guestUrl" @focus="$event.target.select()" /></label>
      <p>The guest enters their name and follows this session’s waiting-room settings. Guests do not receive attendance credit or compensation.</p>
      <p role="status">{{ guestCopied ? 'Guest link copied.' : 'Select and copy the guest link above.' }}</p>
    </div>
    <p v-if="guestError" role="alert">{{ guestError }}</p>
    <div v-if="opened" class="supervision-share-details">
      <label>Session link <input readonly :value="url" @focus="$event.target.select()" /></label>
      <p>Share with invited or eligible attendees. Each person signs in with their own account.</p>
      <p role="status">{{ copied ? 'Copied. Ready to share.' : 'Select and copy the link above.' }}</p>
    </div>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue';
import { supervisionAccountJoinUrl } from '../../utils/supervisionInvitationAccess';
import api from '../../services/api';
const props = defineProps({ sessionId: { type: [Number, String], required: true }, canInviteGuest: Boolean });
const url = computed(() => supervisionAccountJoinUrl(props.sessionId));
const copied = ref(false), opened = ref(false);
const guestUrl = ref(''), guestBusy = ref(false), guestCopied = ref(false), guestError = ref('');
async function copyGuest() {
  if (guestBusy.value) return;
  guestBusy.value = true; guestError.value = ''; guestCopied.value = false;
  try {
    const { data } = await api.post(`/supervision/sessions/${props.sessionId}/guest-link`, {}, { skipGlobalLoading: true });
    guestUrl.value = data.joinUrl;
    try { await navigator.clipboard.writeText(guestUrl.value); guestCopied.value = true; } catch { /* Keep the selectable URL. */ }
  } catch (error) { guestError.value = error.response?.data?.error?.message || 'The guest link could not be prepared. Please try again.'; }
  finally { guestBusy.value = false; }
}
async function copy() {
  opened.value = true;
  copied.value = false;
  try { await navigator.clipboard.writeText(url.value); copied.value = true; }
  catch { /* The visible link supports copying when clipboard access is unavailable. */ }
}
</script>
<style scoped>
.supervision-share { position:relative; }
.supervision-share-details { margin-top:8px; padding:12px; border:1px solid var(--border-color,#cbd5e1); border-radius:10px; max-width:360px; background:var(--bg-card,#fff); color:var(--text-primary,#172033); font-size:.85rem; }
input { display:block; box-sizing:border-box; width:100%; margin-top:6px; padding:6px; }
p { margin:8px 0 0; }
</style>
