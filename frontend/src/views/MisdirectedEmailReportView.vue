<template>
  <div class="mer">
    <div v-if="loading" class="pad">Loading…</div>
    <div v-else-if="done" class="pad">
      <h1>Report received</h1>
      <p>
        Thank you. We opened a support ticket
        <template v-if="agencyName"> for <strong>{{ agencyName }}</strong></template>
        so the team can escalate and investigate.
      </p>
      <p class="hint">Please destroy all copies of the original message.</p>
    </div>
    <div v-else-if="error" class="err pad">{{ error }}</div>
    <div v-else class="pad">
      <h1>Report misdirected email</h1>
      <p>
        Use this form if you received an email that was meant for someone else
        <template v-if="agencyName"> from <strong>{{ agencyName }}</strong></template>.
      </p>
      <p v-if="subject" class="meta">Subject: {{ subject }}</p>
      <label>
        Your name
        <input v-model="name" type="text" autocomplete="name" />
      </label>
      <label>
        Your email
        <input v-model="email" type="email" autocomplete="email" />
      </label>
      <label>
        What happened? (optional)
        <textarea v-model="details" rows="4" placeholder="Any details that help us investigate…" />
      </label>
      <button type="button" class="btn" :disabled="busy" @click="submit">
        {{ busy ? 'Submitting…' : 'Submit report to support' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const done = ref(false);
const agencyName = ref('');
const subject = ref('');
const name = ref('');
const email = ref('');
const details = ref('');

onMounted(async () => {
  try {
    const token = String(route.params.token || '');
    const { data } = await axios.get(
      `/api/public/misdirected-email-report/${encodeURIComponent(token)}`
    );
    agencyName.value = data.agencyName || '';
    subject.value = data.subject || '';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'This report link is invalid or expired.';
  } finally {
    loading.value = false;
  }
});

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    const token = String(route.params.token || '');
    await axios.post(`/api/public/misdirected-email-report/${encodeURIComponent(token)}`, {
      name: name.value.trim() || null,
      email: email.value.trim() || null,
      details: details.value.trim() || null
    });
    done.value = true;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not submit report.';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.mer {
  min-height: 70vh;
  display: grid;
  place-items: center;
  font-family: system-ui, -apple-system, sans-serif;
  background: #f8fafc;
  color: #0f172a;
}
.pad {
  max-width: 460px;
  width: 100%;
  padding: 28px;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  box-sizing: border-box;
}
h1 { margin: 0 0 10px; font-size: 1.35rem; }
p { margin: 0 0 12px; line-height: 1.45; color: #334155; }
.hint { color: #64748b; font-size: 0.92rem; }
.meta { font-size: 0.88rem; color: #64748b; }
.err { color: #b91c1c; }
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 10px;
  color: #0f172a;
}
input, textarea {
  font: inherit;
  font-weight: 400;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}
.btn {
  margin-top: 6px;
  width: 100%;
  border: 0;
  border-radius: 10px;
  padding: 10px 14px;
  background: #0f766e;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
.btn:disabled { opacity: 0.65; cursor: wait; }
</style>
