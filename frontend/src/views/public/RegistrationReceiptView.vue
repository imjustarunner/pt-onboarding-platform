<template>
  <div class="reg-receipt">
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="reg-receipt__error">{{ error }}</div>
    <div v-else ref="snapshotRoot" class="reg-receipt__snapshot">
      <h1 class="reg-receipt__title">Registration confirmation</h1>
      <p class="muted">
        Hi {{ data.signerName || 'there' }}, this page is a snapshot of your submission for your records.
      </p>

      <section class="reg-receipt__card">
        <h2>Form</h2>
        <p><strong>{{ data.formTitle || 'Digital form' }}</strong></p>
        <p v-if="data.organizationName"><strong>School / site:</strong> {{ data.organizationName }}</p>
        <p v-if="data.agencyName"><strong>Program host:</strong> {{ data.agencyName }}</p>
      </section>

      <section
        v-if="data.registrationReturningAutoMatch?.matched && data.registrationReturningAutoMatch?.initials"
        class="reg-receipt__card reg-receipt__match"
      >
        <h2>Existing profile</h2>
        <p>
          We matched you to an existing profile for
          <strong>{{ data.registrationReturningAutoMatch.initials }}</strong>.
        </p>
      </section>

      <section v-if="data.event?.EVENT_TITLE" class="reg-receipt__card">
        <h2>Session</h2>
        <p><strong>Title:</strong> {{ data.event.EVENT_TITLE }}</p>
        <p v-if="data.event.EVENT_DATES"><strong>Dates:</strong> {{ data.event.EVENT_DATES }}</p>
        <p v-if="data.event.EVENT_ADDRESS"><strong>Location:</strong> {{ data.event.EVENT_ADDRESS }}</p>
        <p v-if="data.event.EVENT_REPORT_TIME"><strong>Report time:</strong> {{ data.event.EVENT_REPORT_TIME }}</p>
        <p v-if="data.event.EVENT_DURATION"><strong>Duration:</strong> {{ data.event.EVENT_DURATION }}</p>
      </section>

      <section v-if="selectionLines.length" class="reg-receipt__card">
        <h2>Registration choices</h2>
        <ul class="reg-receipt__list">
          <li v-for="(line, idx) in selectionLines" :key="idx">{{ line }}</li>
        </ul>
      </section>

      <section v-if="data.fromAddress" class="reg-receipt__notice">
        <strong>About email delivery:</strong>
        Messages come from <code>{{ data.fromAddress }}</code> — add it to your contacts, check spam, and mark as safe
        so you do not miss follow-ups.
      </section>

      <div class="reg-receipt__actions no-print">
        <button type="button" class="btn btn-primary" @click="printSnap">Save event snapshot (Print / PDF)</button>
        <button type="button" class="btn btn-secondary" :disabled="imgWorking" @click="downloadImage">
          {{ imgWorking ? 'Working…' : 'Download snapshot image' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import html2canvas from 'html2canvas';
import api from '../../services/api';

const route = useRoute();
const loading = ref(true);
const error = ref('');
const data = ref({});
const snapshotRoot = ref(null);
const imgWorking = ref(false);

const selectionLines = computed(() => {
  const raw = data.value?.registrationSelections;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const label = String(row?.label || '').trim();
      if (!label) return '';
      const parts = [label];
      const desc = String(row?.description || '').trim();
      if (desc) parts.push(desc);
      return parts.join(' — ');
    })
    .filter(Boolean);
});

onMounted(async () => {
  const id = route.params.submissionId;
  const token = route.query.token;
  if (!id || !token) {
    error.value = 'This receipt link is missing required information.';
    loading.value = false;
    return;
  }
  try {
    const res = await api.get(`/public-intake/registration-receipt/${id}`, {
      params: { token },
      skipGlobalLoading: true
    });
    data.value = res.data || {};
  } catch {
    error.value = 'We could not load this receipt. The link may be invalid or expired.';
  } finally {
    loading.value = false;
  }
});

function printSnap() {
  window.print();
}

async function downloadImage() {
  if (!snapshotRoot.value) return;
  imgWorking.value = true;
  try {
    const canvas = await html2canvas(snapshotRoot.value, { scale: 2, useCORS: true, logging: false });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `registration-receipt-${route.params.submissionId}.png`;
    a.click();
  } catch {
    // non-blocking
  } finally {
    imgWorking.value = false;
  }
}
</script>

<style scoped>
.reg-receipt {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}
.reg-receipt__title {
  margin: 0 0 8px;
  font-size: 1.5rem;
}
.reg-receipt__error {
  color: #b91c1c;
  font-weight: 700;
}
.reg-receipt__snapshot {
  background: #fff;
}
.reg-receipt__card {
  margin-top: 18px;
  padding: 14px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fafafa;
}
.reg-receipt__card h2 {
  margin: 0 0 10px;
  font-size: 1.05rem;
}
.reg-receipt__notice {
  margin-top: 18px;
  padding: 12px 14px;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  font-size: 0.95rem;
}
.reg-receipt__list {
  margin: 0;
  padding-left: 18px;
}
.reg-receipt__actions {
  margin-top: 22px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
@media print {
  .no-print {
    display: none !important;
  }
  .reg-receipt {
    padding: 0;
  }
}
</style>
