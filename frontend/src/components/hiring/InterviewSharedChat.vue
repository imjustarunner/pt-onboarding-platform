<template>
  <section class="interview-shared-chat" :class="{ 'interview-shared-chat--sage': theme === 'sage' }" :aria-label="heading">
    <h2>{{ heading }}</h2>
    <p>Everyone in this interview can see these messages.</p>
    <div ref="messageLog" class="messages" role="log" aria-live="polite" aria-label="Interview messages" tabindex="0">
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
import { nextTick, onMounted, onBeforeUnmount, ref, useId } from 'vue';
import api from '../../services/api';
const props = defineProps({ endpoint: { type: String, required: true }, heading: { type: String, default: 'Chat with applicant' }, theme: { type: String, default: 'dark' } });
const inputId = useId(), messages = ref([]), draft = ref(''), error = ref(''), sending = ref(false);
const messageLog = ref(null);
const options = { skipAuthRedirect: true, skipGlobalLoading: true, timeout: 15000 };
let timer, stopped = false, loading = false;
async function refresh() {
  if (loading || stopped) return;
  loading = true;
  try {
    const { data } = await api.get(props.endpoint, options);
    if (!stopped) {
      const el = messageLog.value;
      const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 36;
      messages.value = data.messages || []; error.value = '';
      await nextTick();
      if (atBottom && messageLog.value) messageLog.value.scrollTop = messageLog.value.scrollHeight;
    }
  }
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
.interview-shared-chat{padding:12px 16px;background:#172332;color:#f4f7fb;border-radius:12px;min-width:0;box-sizing:border-box;flex:0 0 220px;height:220px;display:flex;flex-direction:column;gap:6px;overflow:hidden}
h2{font-size:1rem;margin:0;color:#f4f7fb}p{font-size:.85rem;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.messages{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.messages p{margin:0 0 10px}form{flex-shrink:0}
form{display:flex;gap:8px}input{flex:1;min-width:0;padding:10px;border-radius:6px}button{padding:8px 14px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.interview-shared-chat--sage{background:linear-gradient(135deg,#dce3d2,#becbb7);color:#18382f;border:1px solid #eff2df;border-radius:22px;padding:18px 20px;gap:7px;box-shadow:0 8px 30px #00160c20}
.interview-shared-chat--sage h2{color:#18382f;font-size:1rem;font-weight:650}.interview-shared-chat--sage>p{font-size:.73rem;color:#3d5748}
.interview-shared-chat--sage input{background:#fcf8ef;color:#18382f;border:1px solid #7e9580;min-height:40px;font:inherit;font-size:.85rem}.interview-shared-chat--sage input::placeholder{color:#566a5a}
.interview-shared-chat--sage button{background:#163b30;color:#fff8ee;border:1px solid #163b30;border-radius:10px;min-height:40px;font-weight:600;cursor:pointer}.interview-shared-chat--sage button:disabled{opacity:.5;cursor:default}
.interview-shared-chat--sage :is(input,button):focus-visible{outline:3px solid #91583f;outline-offset:2px}
</style>
