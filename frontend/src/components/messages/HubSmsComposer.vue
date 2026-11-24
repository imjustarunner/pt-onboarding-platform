<template>
  <div class="sms-compose-overlay" :class="{ 'is-mobile': mobile }" @click.self="close">
    <form class="sms-compose" role="dialog" aria-modal="true" aria-labelledby="sms-compose-title" @keydown.esc.stop.prevent="close" @submit.prevent="send">
      <header>
        <h2 id="sms-compose-title">New SMS</h2>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="sending" @click="close">Close</button>
      </header>

      <p v-if="loadingLines" role="status">Loading provider lines…</p>
      <template v-else-if="lines.length">
        <label>
          Send from
          <select v-model="lineId" :disabled="sending">
            <option v-for="line in lines" :key="line.numberId" :value="line.numberId">
              {{ line.agencyName }} · {{ line.phoneNumber }}
            </option>
          </select>
        </label>
        <label>
          Recipient
          <input v-model="query" type="search" placeholder="Search by client or guardian name" :disabled="sending" />
        </label>
        <p v-if="searching" role="status">Checking text eligibility…</p>
        <ul v-else-if="recipients.length && !recipient" class="sms-recipients">
          <li v-for="item in recipients" :key="recipientKey(item)">
            <button type="button" @click="choose(item)">
              <strong>{{ item.name }}</strong>
              <span>{{ item.relationship === 'Client' ? 'Client' : `${item.relationship} for ${item.clientName}` }} · ending in {{ item.phoneEnding }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="query.trim().length >= 2 && !recipient && !error" role="status">No confirmed recipients match this search on this line.</p>
        <template v-if="recipient">
          <div class="sms-compose-recipient">
            <div><strong>{{ recipient.name }}</strong><span>{{ recipient.relationship === 'Client' ? 'Client' : `${recipient.relationship} for ${recipient.clientName}` }} · ending in {{ recipient.phoneEnding }}</span></div>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="sending" @click="recipient = null">Change</button>
          </div>
          <label>
            Message
            <textarea ref="messageInput" v-model="body" rows="4" maxlength="1600" placeholder="Write a text message…" :disabled="sending" required />
          </label>
            <MessageLinkControl :textarea="messageInput" :disabled="sending" />
        </template>
      </template>
      <p v-else-if="!error" role="status">No registered provider lines are available to you.</p>
      <p v-if="error" class="sms-compose-error" role="alert">{{ error }}</p>
      <footer>
        <button type="submit" class="btn btn-primary" :disabled="sending || !recipient || !line || !body.trim()">
          {{ sending ? 'Sending…' : 'Send text' }}
        </button>
      </footer>
    </form>
  </div>
</template>

<script setup>
import MessageLinkControl from './MessageLinkControl.vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';

const messageInput = ref(null);
const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  apiClient: { type: Object, default: () => api },
  mobile: Boolean
});
const emit = defineEmits(['close', 'sent']);
const lines = ref([]);
const lineId = ref(null);
const line = computed(() => lines.value.find(item => item.numberId === lineId.value));
const query = ref('');
const recipients = ref([]);
const recipient = ref(null);
const body = ref('');
const error = ref('');
const loadingLines = ref(true);
const searching = ref(false);
const sending = ref(false);
let searchTimer;
let searchController;
const lineController = new AbortController();
const recipientKey = item => `${item.clientId}:${item.guardianUserId || 0}`;

function close() {
  if (!sending.value) emit('close');
}

function choose(item) {
  recipient.value = item;
}

watch([lineId, query], () => {
  clearTimeout(searchTimer);
  searchController?.abort();
  const selectedLine = line.value;
  const q = query.value.trim();
  recipients.value = [];
  recipient.value = null;
  error.value = '';
  searching.value = false;
  if (!selectedLine || q.length < 2) return;
  searching.value = true;
  const controller = new AbortController();
  searchController = controller;
  searchTimer = setTimeout(async () => {
    try {
      const { data } = await props.apiClient.get('/messages/hub/sms-recipients', {
        params: { agencyId: selectedLine.agencyId, numberId: selectedLine.numberId, q },
        signal: controller.signal, skipGlobalLoading: true
      });
      if (!controller.signal.aborted) recipients.value = data?.recipients || [];
    } catch {
      if (!controller.signal.aborted) error.value = 'Could not check text eligibility. Try searching again.';
    } finally {
      if (!controller.signal.aborted) searching.value = false;
    }
  }, 300);
});

async function send() {
  if (!line.value || !recipient.value || !body.value.trim() || sending.value) return;
  const target = recipient.value;
  sending.value = true;
  error.value = '';
  try {
    await props.apiClient.post('/messages/send', {
      clientId: target.clientId, guardianUserId: target.guardianUserId,
      numberId: line.value.numberId, body: body.value.trim(), startNewConversation: true
    }, { skipGlobalLoading: true });
    emit('sent');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not send this text.';
  } finally {
    sending.value = false;
  }
}

onMounted(async () => {
  try {
    const { data } = await props.apiClient.get('/messages/hub/sms-lines', { signal: lineController.signal, skipGlobalLoading: true });
    lines.value = data?.lines || [];
    lineId.value = (lines.value.find(item => Number(item.agencyId) === Number(props.agencyId)) || lines.value[0])?.numberId ?? null;
  } catch {
    if (!lineController.signal.aborted) error.value = 'Could not load your provider lines.';
  } finally {
    loadingLines.value = false;
  }
});
onUnmounted(() => {
  clearTimeout(searchTimer);
  searchController?.abort();
  lineController.abort();
});
</script>

<style scoped>
.sms-compose-overlay { position: fixed; inset: 0; z-index: 2200; display: grid; place-items: center; padding: 16px; background: rgb(15 23 42 / 55%); }
.sms-compose { width: min(100%, 32rem); max-height: 90dvh; overflow-y: auto; display: grid; gap: 14px; padding: 20px; border-radius: 14px; background: var(--bg-primary, #fff); color: var(--text-primary, #172c48); }
.sms-compose header, .sms-compose footer, .sms-compose-recipient { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sms-compose h2, .sms-compose p { margin: 0; }
.sms-compose footer { justify-content: flex-end; }
.sms-compose label { display: grid; gap: 5px; font-weight: 600; }
.sms-compose input, .sms-compose select, .sms-compose textarea { width: 100%; box-sizing: border-box; font: inherit; font-weight: 400; padding: 9px 10px; border: 1px solid var(--border, #cbd5e1); border-radius: 8px; background: var(--bg-primary, #fff); color: inherit; }
.sms-recipients { list-style: none; padding: 0; margin: 0; max-height: 12rem; overflow-y: auto; }
.sms-recipients button { text-align: left; width: 100%; display: grid; gap: 2px; padding: 8px; border: 0; border-bottom: 1px solid var(--border, #e2e8f0); background: transparent; color: inherit; cursor: pointer; }
.sms-recipients span, .sms-compose-recipient span { display: block; color: var(--text-secondary, #475569); font-size: .86rem; }
.sms-compose-error { color: var(--danger, #b42318); }
.is-mobile .sms-compose {
  max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 32px);
}
.is-mobile .sms-compose input,
.is-mobile .sms-compose select,
.is-mobile .sms-compose textarea { font-size: 16px; }
.is-mobile .sms-compose .btn { min-height: 44px; padding: 8px 14px; border: 1px solid #dbe3ef; border-radius: 10px; background: #f2f4f9; color: #183054; font: inherit; }
.is-mobile .sms-compose .btn-primary { background: #3157d3; border-color: #3157d3; color: #fff; }
.is-mobile .sms-compose .btn:disabled { opacity: .5; }
</style>
