<template>
  <DigitalFormShell
    class="reg-receipt"
    :branding="formBranding"
    :program-title-override="data.organizationName || data.agencyName || 'Registration'"
    form-subtitle="Registration confirmation"
    :cover-mode="loading || !!error"
    :progress-steps="[]"
    :progress-index="0"
  >
    <div v-if="loading" class="df-loading">Loading…</div>
    <div v-else-if="error" class="df-banner df-banner--warn">{{ error }}</div>
    <div v-else ref="snapshotRoot" class="reg-receipt__snapshot">
      <h1 class="df-title">Registration confirmation</h1>
      <p class="df-subtitle">
        Hi {{ data.signerName || 'there' }}, this page is a snapshot of your submission for your records.
      </p>

      <section class="reg-receipt__card">
        <h2 class="df-section-title">Form</h2>
        <p><strong>{{ data.formTitle || 'Digital form' }}</strong></p>
        <p v-if="data.organizationName"><strong>School / site:</strong> {{ data.organizationName }}</p>
        <p v-if="data.agencyName"><strong>Program host:</strong> {{ data.agencyName }}</p>
      </section>

      <section
        v-if="data.registrationReturningAutoMatch?.matched && data.registrationReturningAutoMatch?.initials"
        class="reg-receipt__card reg-receipt__match"
      >
        <h2 class="df-section-title">Existing profile</h2>
        <p>
          We matched you to an existing profile for
          <strong>{{ data.registrationReturningAutoMatch.initials }}</strong>.
        </p>
      </section>

      <section v-if="data.event?.EVENT_TITLE" class="reg-receipt__card">
        <h2 class="df-section-title">Session</h2>
        <p><strong>Title:</strong> {{ data.event.EVENT_TITLE }}</p>
        <p v-if="data.event.EVENT_DATES"><strong>Dates:</strong> {{ data.event.EVENT_DATES }}</p>
        <p v-if="data.event.EVENT_ADDRESS"><strong>Location:</strong> {{ data.event.EVENT_ADDRESS }}</p>
        <p v-if="data.event.EVENT_REPORT_TIME"><strong>Report time:</strong> {{ data.event.EVENT_REPORT_TIME }}</p>
        <p v-if="data.event.EVENT_DURATION"><strong>Duration:</strong> {{ data.event.EVENT_DURATION }}</p>
      </section>

      <section v-if="selectionLines.length" class="reg-receipt__card">
        <h2 class="df-section-title">Registration choices</h2>
        <ul class="reg-receipt__list">
          <li v-for="(line, idx) in selectionLines" :key="idx">{{ line }}</li>
        </ul>
      </section>

      <section v-if="data.fromAddress" class="df-banner df-banner--info" style="margin-top: 18px;">
        <strong>About email delivery:</strong>
        Messages come from <code>{{ data.fromAddress }}</code> — add it to your contacts, check spam, and mark as safe
        so you do not miss follow-ups.
      </section>

      <div class="reg-receipt__actions no-print">
        <DigitalFormActions
          primary-label="Save event snapshot (Print / PDF)"
          :secondary-label="imgWorking ? 'Working…' : 'Download snapshot image'"
          :secondary-disabled="imgWorking"
          :show-arrow="false"
          @primary="printSnap"
          @secondary="downloadImage"
        />
      </div>
    </div>
  </DigitalFormShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import html2canvas from 'html2canvas';
import api from '../../services/api';
import {
  DigitalFormShell,
  DigitalFormActions
} from '../../components/digital-form';

const route = useRoute();
const loading = ref(true);
const error = ref('');
const data = ref({});
const formBranding = ref(null);
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
    formBranding.value = res.data?.branding || null;
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
.df-loading {
  padding: 2rem 0;
  color: var(--df-muted);
  text-align: center;
}
.reg-receipt__snapshot {
  background: #fff;
}
.reg-receipt__card {
  margin-top: 18px;
  padding: 14px 16px;
  border: 1px solid var(--df-border, #e5e7eb);
  border-radius: 10px;
  background: color-mix(in srgb, var(--df-primary) 3%, #fff);
}
.reg-receipt__card .df-section-title {
  margin-top: 0;
}
.reg-receipt__list {
  margin: 0;
  padding-left: 18px;
}
.reg-receipt__actions {
  margin-top: 22px;
}
@media print {
  .no-print {
    display: none !important;
  }
}
</style>
