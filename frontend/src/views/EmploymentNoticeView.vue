<template>
  <main class="employment-notice">
    <article class="notice-card" aria-labelledby="notice-title">
      <h1 id="notice-title">Important Employment Notice</h1>
      <p v-if="loading" role="status">Opening your notice…</p>
      <p v-if="error" class="notice-error" role="alert">{{ error }}</p>
      <template v-if="notice">
        <p class="effective">Effective {{ format(notice.restrictFrom, effectiveDate) }}</p>
        <p>Your organizational workspace access is temporarily suspended for an administrative restructuring review from {{ format(notice.restrictFrom, cutoffDate) }} through {{ format(notice.restrictUntil, cutoffDate) }}.</p>
        <p>Please review the leadership communication for the paid administrative leave dates and instructions regarding November 30.</p>

        <details>
          <summary>{{ notice.subject }}</summary>
          <div class="notice-letter">
            <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
          </div>
          <button type="button" class="download" @click="downloadLetter">Download letter</button>
        </details>

        <section aria-labelledby="receipt-title">
          <h2 id="receipt-title">Acknowledgment</h2>
          <p>This acknowledgment only confirms receipt.</p>
          <p v-if="acknowledgedAt" role="status">Your acknowledgment was recorded on {{ format(acknowledgedAt, cutoffDate) }}.</p>
          <form v-else @submit.prevent="acknowledge">
            <label><input v-model="checked" type="checkbox" required /> <span>{{ notice.acknowledgment }}</span></label>
            <button type="submit" :disabled="!checked || saving">{{ saving ? 'Saving…' : 'Acknowledge receipt' }}</button>
          </form>
          <p v-if="notice.restrictionPending">Workspace access remains restricted through the time shown above.</p>
        </section>

        <p class="contact">For employment questions, contact <a :href="'mailto:' + notice.contactEmail">{{ notice.contactEmail }}</a>.</p>
      </template>
      <p v-else-if="!loading" class="contact"><a href="/login">Return to sign-in</a></p>
    </article>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../services/api';

const notice = ref(null);
const loading = ref(true);
const acknowledgedAt = ref(null);
const checked = ref(false);
const saving = ref(false);
const error = ref('');
const paragraphs = computed(() => notice.value?.letter?.trim().split(/\n[ \t]*\n+/) || []);
const effectiveDate = { dateStyle: 'long' };
const cutoffDate = { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
const requestOptions = { skipGlobalLoading: true, skipAuthRedirect: true, cookieAuthOnly: true };
const storageKey = 'employmentNoticeKey';
let key = '';

function format(value, options) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', ...options }).format(new Date(value));
}

onMounted(async () => {
  const fragment = window.location.hash.slice(1);
  try {
    key = fragment || sessionStorage.getItem(storageKey) || '';
    if (fragment) sessionStorage.setItem(storageKey, fragment);
  } catch {
    key = fragment;
  }
  if (fragment) window.history.replaceState(window.history.state, '', window.location.pathname);
  try {
    if (!key) throw new Error('missing key');
    const result = await api.post('/employment-notice/read', { key }, requestOptions);
    notice.value = result.data;
    acknowledgedAt.value = result.data.acknowledgedAt;
  } catch (failure) {
    error.value = failure.response?.data?.error?.message || 'Open the notice using the link in your personal email or sign in again.';
  } finally {
    loading.value = false;
  }
});

async function acknowledge() {
  if (!checked.value || saving.value || acknowledgedAt.value) return;
  error.value = '';
  saving.value = true;
  try {
    const response = await api.post('/employment-notice/acknowledge', {
      key, version: notice.value.version, acknowledged: true
    }, requestOptions);
    acknowledgedAt.value = response.data.acknowledgedAt;
  } catch (failure) {
    error.value = failure.response?.data?.error?.message || 'Your acknowledgment could not be saved. Please try again.';
  } finally {
    saving.value = false;
  }
}

function downloadLetter() {
  const href = URL.createObjectURL(new Blob([`${notice.value.subject}\n\n${notice.value.letter}`], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = 'employment-notice.txt';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
</script>

<style scoped>
.employment-notice {
  min-height: 100vh;
  padding: clamp(16px, 5vw, 48px);
  background: #131719;
  color: #f5f6f4;
  font: 1rem/1.6 system-ui, sans-serif;
}
.notice-card {
  max-width: 48rem;
  margin: 0 auto;
  padding: clamp(16px, 5vw, 40px);
  border: 1px solid #465052;
  border-radius: 18px;
  background: #1d2326;
}
h1, h2 { color: inherit; line-height: 1.16; }
h1 { margin: 0; font-size: clamp(1.85rem, 6vw, 2.7rem); }
h2 { margin: 0; font-size: 1.25rem; }
.effective, .contact { color: #ccd5d4; }
details, section { margin-top: 1.25rem; border-top: 1px solid #465052; padding-top: 1.25rem; }
summary { cursor: pointer; font-weight: 700; color: #e0eee8; }
.notice-letter p { white-space: pre-line; }
button {
  background: #bcf0d7;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: .65rem 1rem;
  font: inherit;
  font-weight: 650;
  color: #162923;
  cursor: pointer;
}
button:disabled { opacity: .55; cursor: default; }
.download { margin: 12px 0 0; }
label { display: flex; gap: .75rem; align-items: flex-start; margin: 1rem 0; }
input { margin-top: .35rem; width: 1.15rem; height: 1.15rem; flex: none; accent-color: #bcf0d7; }
a { color: #bcf0d7; overflow-wrap: anywhere; }
.notice-error { color: #ffc3b8; }
:focus-visible { outline: 2px solid #fff; outline-offset: 4px; }
@media print {
  .employment-notice, .notice-card { background: white; color: black; border: 0; padding: 0; }
  button, form { display: none; }
}
</style>
