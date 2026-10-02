<template>
  <section class="interview-shared-chat" aria-label="Chat with applicant">
    <h2>Chat with applicant</h2>
    <p>Everyone in this interview can see these messages.</p>
    <div class="messages" role="log" aria-live="polite">
      <p v-for="message in messages" :key="message.id"><strong>{{ message.authorName }} · {{ message.roleLabel }}</strong><br>{{ message.text }}</p>
      <p v-if="!messages.length">No messages yet.</p>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <form @submit.prevent="send">
      <label class="sr-only" :for="inputId">Message everyone in the interview</label>
      <input :id="inputId" v-model="draft" maxlength="4000" placeholder="Message everyone…" />
      <button :disabled="sending || !draft.trim()">Send</button>
    </form>
  </section>
</template>
<script setup>
import { onMounted, onBeforeUnmount, ref, useId } from 'vue';
import api from '../../services/api';
const props = defineProps({ endpoint: { type: String, required: true } });
const inputId = useId(), messages = ref([]), draft = ref(''), error = ref(''), sending = ref(false);
const options = { skipAuthRedirect: true, skipGlobalLoading: true, timeout: 15000 };
let timer, stopped = false, loading = false;
async function refresh() {
  if (loading || stopped) return;
  loading = true;
  try { const { data } = await api.get(props.endpoint, options); if (!stopped) messages.value = data.messages || []; }
  catch (e) { if (!stopped) error.value = e.response?.data?.error?.message || 'Chat is temporarily unavailable.'; }
  finally { loading = false; }
}
async function send() {
  if (sending.value || !draft.value.trim()) return;
  sending.value = true; error.value = '';
  const text = draft.value.trim();
  try { await api.post(props.endpoint, { text }, options); if (draft.value.trim() === text) draft.value = ''; await refresh(); }
  catch (e) { error.value = e.response?.data?.error?.message || 'Message was not sent. Please try again.'; }
  finally { sending.value = false; }
}
onMounted(() => { void refresh(); timer = setInterval(refresh, 4000); });
onBeforeUnmount(() => { stopped = true; clearInterval(timer); });
</script>
<style scoped>
.interview-shared-chat{padding:16px;background:#172332;color:#f4f7fb;border-radius:12px;min-width:0}
h2{font-size:1rem;margin:0}p{font-size:.9rem;white-space:pre-wrap;overflow-wrap:anywhere}.messages{max-height:180px;overflow:auto}
form{display:flex;gap:8px}input{flex:1;min-width:0;padding:10px;border-radius:6px}button{padding:8px 14px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
</style>
