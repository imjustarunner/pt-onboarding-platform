<template>
  <div class="sos">
    <p class="sos__lead">
      Reach your organization admin team here. Product or platform questions go to them first — they can escalate to
      Plot Twist HQ when needed.
    </p>

    <div class="sos__cards">
      <section class="sos__card">
        <h3 class="sos__card-title">Organization help</h3>
        <p class="sos__card-desc">Scheduling, clients, payroll, credentialing, or other team questions.</p>
        <label class="sos__field">
          <span>Topic</span>
          <select v-model="orgTopic">
            <option v-for="t in topics" :key="t.id" :value="t.id">{{ t.label }}</option>
          </select>
        </label>
        <label class="sos__field">
          <span>Subject (optional)</span>
          <input v-model="orgSubject" type="text" maxlength="255" />
        </label>
        <label class="sos__field">
          <span>Question</span>
          <textarea v-model="orgQuestion" rows="3" placeholder="How can your admin team help?" />
        </label>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="sending || !orgQuestion.trim() || !scopeId"
          @click="submit(false)"
        >
          {{ sending && !productMode ? 'Submitting…' : 'Submit to my organization' }}
        </button>
      </section>

      <section class="sos__card sos__card--product">
        <h3 class="sos__card-title">Product / platform question</h3>
        <p class="sos__card-desc">
          Bugs, how-to questions about the product, or Plot Twist features. Your admin team receives this and can
          escalate to platform support.
        </p>
        <label class="sos__field">
          <span>Subject (optional)</span>
          <input v-model="prodSubject" type="text" maxlength="255" placeholder="e.g. Feature question" />
        </label>
        <label class="sos__field">
          <span>Question</span>
          <textarea v-model="prodQuestion" rows="3" placeholder="What about the product do you need help with?" />
        </label>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="sending || !prodQuestion.trim() || !scopeId"
          @click="submit(true)"
        >
          {{ sending && productMode ? 'Submitting…' : 'Send to my admin team' }}
        </button>
      </section>
    </div>

    <p v-if="error" class="sos__error">{{ error }}</p>
    <p v-if="success" class="sos__ok">{{ success }}</p>
    <p v-if="!scopeId" class="sos__hint">No organization context available.</p>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import {
  PROVIDER_TICKET_TOPICS,
  STAFF_TICKET_TOPICS,
  TICKET_TOPICS
} from '../../utils/ticketTopics';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const topics = computed(() => {
  if (role.value === 'provider' || role.value === 'provider_plus') return PROVIDER_TICKET_TOPICS;
  if (role.value === 'staff' || role.value === 'clinical_practice_assistant') return STAFF_TICKET_TOPICS;
  return TICKET_TOPICS.filter((t) => ['general', 'billing', 'credentialing', 'payroll'].includes(t.id));
});

const scopeId = computed(
  () => Number(agencyStore.currentAgency?.id) || Number(agencyStore.userAgencies?.[0]?.id) || null
);

const orgTopic = ref('general');
const orgSubject = ref('');
const orgQuestion = ref('');
const prodSubject = ref('');
const prodQuestion = ref('');
const sending = ref(false);
const productMode = ref(false);
const error = ref('');
const success = ref('');

async function submit(asProductHelp) {
  if (!scopeId.value) return;
  const question = asProductHelp ? prodQuestion.value.trim() : orgQuestion.value.trim();
  if (!question) return;
  sending.value = true;
  productMode.value = asProductHelp;
  error.value = '';
  success.value = '';
  try {
    const subject = asProductHelp
      ? prodSubject.value.trim() || 'Product / platform question'
      : orgSubject.value.trim() || undefined;
    await api.post('/support-tickets', {
      schoolOrganizationId: scopeId.value,
      topic: asProductHelp ? 'general' : orgTopic.value || 'general',
      subject,
      question,
      requestsPlatformHelp: !!asProductHelp
    });
    if (asProductHelp) {
      prodSubject.value = '';
      prodQuestion.value = '';
      success.value = 'Sent to your admin team. They can escalate to Plot Twist HQ if needed.';
    } else {
      orgSubject.value = '';
      orgQuestion.value = '';
      orgTopic.value = 'general';
      success.value = 'Submitted to your organization support queue.';
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Could not submit';
  } finally {
    sending.value = false;
  }
}
</script>

<style scoped>
.sos__lead {
  margin: 0 0 16px;
  font-size: 14px;
  color: #4b5563;
  line-height: 1.5;
}
.sos__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}
.sos__card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.sos__card--product {
  border-color: #bbf7d0;
  background: #f0fdf4;
}
.sos__card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.sos__card-desc {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.4;
}
.sos__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.sos__field input,
.sos__field select,
.sos__field textarea {
  font: inherit;
  font-weight: 400;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.sos__error {
  margin: 12px 0 0;
  color: #b91c1c;
  font-size: 13px;
}
.sos__ok {
  margin: 12px 0 0;
  color: #166534;
  font-size: 13px;
}
.sos__hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: #6b7280;
}
</style>
