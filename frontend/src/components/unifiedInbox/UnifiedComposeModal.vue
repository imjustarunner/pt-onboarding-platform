<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import DirectoryRecipientInput from './DirectoryRecipientInput.vue';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  inboxes: { type: Array, default: () => [] },
  defaultInboxId: { type: [Number, String, null], default: null }
});
const emit = defineEmits(['close', 'sent']);

const inboxId = ref(props.defaultInboxId || props.inboxes[0]?.id || null);
const to = ref('');
const cc = ref('');
const bcc = ref('');
const subject = ref('');
const body = ref('');
const showCc = ref(false);
const sending = ref(false);
const error = ref('');
const pendingWarnings = ref([]);
const confirmOpen = ref(false);

watch(
  () => props.defaultInboxId,
  (v) => {
    if (v) inboxId.value = v;
  }
);

const selectedInbox = computed(() => props.inboxes.find((i) => Number(i.id) === Number(inboxId.value)));

async function runPreflight() {
  const { data } = await api.post(
    '/communications/send-preflight',
    {
      agencyId: props.agencyId,
      inboxId: inboxId.value,
      to: to.value,
      cc: cc.value,
      bcc: bcc.value,
      subject: subject.value,
      text: body.value,
      fromEmail: selectedInbox.value?.from_email
    },
    { skipGlobalLoading: true }
  );
  return data;
}

async function send({ skipConfirm = false } = {}) {
  error.value = '';
  if (!inboxId.value) {
    error.value = 'Select an inbox / From address';
    return;
  }
  if (!to.value.trim()) {
    error.value = 'To is required';
    return;
  }
  sending.value = true;
  try {
    if (!skipConfirm) {
      const pre = await runPreflight();
      if (pre?.warnings?.length) {
        pendingWarnings.value = pre.warnings;
        confirmOpen.value = true;
        sending.value = false;
        return;
      }
    }
    await api.post('/communications/conversations', {
      agencyId: props.agencyId,
      inboxId: inboxId.value,
      to: to.value,
      cc: cc.value || undefined,
      bcc: bcc.value || undefined,
      subject: subject.value,
      text: body.value
    });
    confirmOpen.value = false;
    emit('sent');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Send failed';
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="uc-modal-backdrop" @click.self="emit('close')">
    <div class="uc-modal" role="dialog" aria-label="New message">
      <header>
        <h3>New Message</h3>
        <button type="button" class="uc-x" aria-label="Close" @click="emit('close')">×</button>
      </header>

      <label class="uc-row">
        <span>Send as</span>
        <select v-model="inboxId">
          <option v-for="box in inboxes" :key="box.id" :value="box.id">
            {{ box.display_name }} ({{ box.from_email }})
          </option>
        </select>
      </label>
      <p v-if="selectedInbox?.from_email" class="uc-hint">From {{ selectedInbox.from_email }}</p>

      <label class="uc-row">
        <span>To</span>
        <DirectoryRecipientInput v-model="to" :agency-id="agencyId" />
      </label>
      <button type="button" class="uc-link" @click="showCc = !showCc">{{ showCc ? 'Hide' : 'Show' }} CC / BCC</button>
      <template v-if="showCc">
        <label class="uc-row"><span>CC</span><DirectoryRecipientInput v-model="cc" :agency-id="agencyId" /></label>
        <label class="uc-row"><span>BCC</span><DirectoryRecipientInput v-model="bcc" :agency-id="agencyId" /></label>
      </template>
      <label class="uc-row">
        <span>Subject</span>
        <input v-model="subject" type="text" />
      </label>
      <textarea v-model="body" rows="8" placeholder="Message…" />

      <p v-if="error" class="uc-err">{{ error }}</p>

      <footer>
        <button type="button" class="uc-cancel" @click="emit('close')">Cancel</button>
        <button type="button" class="uc-send" :disabled="sending" @click="send()">
          {{ sending ? 'Sending…' : 'Send' }}
        </button>
      </footer>
    </div>

    <div v-if="confirmOpen" class="uc-confirm" role="alertdialog">
      <h4>Review before sending</h4>
      <ul>
        <li v-for="(w, i) in pendingWarnings" :key="i">{{ w.message }}</li>
      </ul>
      <div class="uc-confirm-actions">
        <button type="button" class="uc-cancel" @click="confirmOpen = false">Go back</button>
        <button type="button" class="uc-send" :disabled="sending" @click="send({ skipConfirm: true })">
          Send anyway
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.uc-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.uc-modal {
  width: min(560px, 100%);
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
}
.uc-modal header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.uc-modal h3 { margin: 0; color: #166534; }
.uc-x {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}
.uc-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 0.85rem;
  color: #64748b;
}
.uc-row input,
.uc-row select,
.uc-modal textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.9rem;
  font-family: inherit;
  box-sizing: border-box;
}
.uc-modal textarea { margin-top: 4px; resize: vertical; }
.uc-hint { font-size: 0.75rem; color: #94a3b8; margin: -4px 0 10px 82px; }
.uc-link {
  border: none;
  background: none;
  color: #166534;
  font-size: 0.8rem;
  cursor: pointer;
  margin: 0 0 10px 82px;
  padding: 0;
  text-decoration: underline;
}
.uc-err { color: #b91c1c; font-size: 0.85rem; }
.uc-modal footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.uc-cancel, .uc-send {
  border-radius: 8px;
  padding: 9px 14px;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.9rem;
}
.uc-cancel { border: 1px solid #cbd5e1; background: #fff; }
.uc-send { border: none; background: #166534; color: #fff; }
.uc-send:disabled { opacity: 0.6; }
.uc-confirm {
  position: absolute;
  width: min(420px, 92vw);
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.3);
  border: 1px solid #fde68a;
}
.uc-confirm h4 { margin: 0 0 8px; color: #92400e; }
.uc-confirm ul { margin: 0 0 12px; padding-left: 18px; font-size: 0.88rem; color: #334155; }
.uc-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
