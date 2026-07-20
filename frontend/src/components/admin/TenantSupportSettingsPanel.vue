<template>
  <div class="tss">
    <header class="tss__header">
      <h2 class="tss__title">Support</h2>
      <p class="tss__sub">
        Contact your organization team for day-to-day help, or reach Plot Twist HQ for product/platform questions.
      </p>
    </header>

    <div class="tss__cards">
      <section class="tss__card">
        <h3 class="tss__card-title">Organization support</h3>
        <p class="tss__card-desc">
          Billing, payroll, credentialing, scheduling, and other questions for your admin team.
        </p>
        <label class="tss__field">
          <span>Audience</span>
          <select v-model="orgTopic">
            <option v-for="t in orgTopics" :key="t.id" :value="t.id">{{ t.label }}</option>
          </select>
        </label>
        <label class="tss__field">
          <span>Subject (optional)</span>
          <input v-model="orgSubject" type="text" maxlength="255" placeholder="Short summary" />
        </label>
        <label class="tss__field">
          <span>Question</span>
          <textarea v-model="orgQuestion" rows="4" placeholder="How can your team help?" />
        </label>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="orgSending || !orgQuestion.trim() || !orgScopeId"
          @click="submitOrgTicket"
        >
          {{ orgSending ? 'Submitting…' : 'Submit to organization' }}
        </button>
        <p v-if="orgError" class="tss__error">{{ orgError }}</p>
        <p v-if="orgSuccess" class="tss__ok">{{ orgSuccess }}</p>
        <p v-if="!orgScopeId" class="tss__hint">Select an organization context first.</p>
      </section>

      <section v-if="canFilePlatform" class="tss__card tss__card--platform">
        <h3 class="tss__card-title">Platform support</h3>
        <p class="tss__card-desc">
          Product bugs, feature questions, and Plot Twist HQ help. This goes directly to the platform team —
          not your tenant ticket queue.
        </p>
        <label class="tss__field">
          <span>Subject (optional)</span>
          <input v-model="platSubject" type="text" maxlength="255" placeholder="Platform issue" />
        </label>
        <label class="tss__field">
          <span>Question</span>
          <textarea v-model="platQuestion" rows="4" placeholder="Describe the product or platform question…" />
        </label>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="platSending || !platQuestion.trim() || !orgScopeId"
          @click="submitPlatformTicket"
        >
          {{ platSending ? 'Submitting…' : 'Submit to Plot Twist HQ' }}
        </button>
        <p v-if="platError" class="tss__error">{{ platError }}</p>
        <p v-if="platSuccess" class="tss__ok">{{ platSuccess }}</p>
      </section>

      <section v-else class="tss__card tss__card--muted">
        <h3 class="tss__card-title">Platform support</h3>
        <p class="tss__card-desc">
          Direct platform tickets are filed by organization admins. If you need product help, ask your admin team —
          they can escalate to Plot Twist HQ when needed.
        </p>
      </section>
    </div>

    <p class="tss__footer">
      <router-link :to="ticketsPath" class="tss__link">Open tickets desk</router-link>
      to claim, reply, or escalate product-help requests from your team.
    </p>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { TICKET_TOPICS } from '../../utils/ticketTopics';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();

const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const canFilePlatform = computed(() => ['admin', 'support', 'super_admin'].includes(role.value));
const orgTopics = TICKET_TOPICS;
const orgScopeId = computed(
  () => Number(agencyStore.currentAgency?.id) || Number(agencyStore.userAgencies?.[0]?.id) || null
);
const ticketsPath = computed(() => {
  const slug = route.params?.organizationSlug;
  return slug ? `/${slug}/tickets` : '/tickets';
});

const orgTopic = ref('general');
const orgSubject = ref('');
const orgQuestion = ref('');
const orgSending = ref(false);
const orgError = ref('');
const orgSuccess = ref('');

const platSubject = ref('');
const platQuestion = ref('');
const platSending = ref(false);
const platError = ref('');
const platSuccess = ref('');

async function submitOrgTicket() {
  if (!orgScopeId.value || !orgQuestion.value.trim()) return;
  orgSending.value = true;
  orgError.value = '';
  orgSuccess.value = '';
  try {
    await api.post('/support-tickets', {
      schoolOrganizationId: orgScopeId.value,
      topic: orgTopic.value || 'general',
      subject: orgSubject.value.trim() || undefined,
      question: orgQuestion.value.trim()
    });
    orgSubject.value = '';
    orgQuestion.value = '';
    orgTopic.value = 'general';
    orgSuccess.value = 'Submitted to your organization support queue.';
  } catch (e) {
    orgError.value = e?.response?.data?.error?.message || e?.message || 'Could not submit';
  } finally {
    orgSending.value = false;
  }
}

async function submitPlatformTicket() {
  if (!orgScopeId.value || !platQuestion.value.trim()) return;
  platSending.value = true;
  platError.value = '';
  platSuccess.value = '';
  try {
    await api.post('/support-tickets/platform', {
      agencyId: orgScopeId.value,
      subject: platSubject.value.trim() || 'Platform support request',
      question: platQuestion.value.trim()
    });
    platSubject.value = '';
    platQuestion.value = '';
    platSuccess.value = 'Submitted to Plot Twist HQ platform support.';
  } catch (e) {
    platError.value = e?.response?.data?.error?.message || e?.message || 'Could not submit';
  } finally {
    platSending.value = false;
  }
}
</script>

<style scoped>
.tss {
  max-width: 920px;
}
.tss__header {
  margin-bottom: 20px;
}
.tss__title {
  margin: 0 0 6px;
  font-size: 1.25rem;
  font-weight: 700;
}
.tss__sub {
  margin: 0;
  color: var(--text-secondary, #64748b);
  font-size: 14px;
  line-height: 1.45;
}
.tss__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
}
.tss__card {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 16px;
  background: var(--bg-alt, #f9fafb);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tss__card--platform {
  border-color: color-mix(in srgb, var(--primary, #166534) 35%, var(--border, #e5e7eb));
  background: color-mix(in srgb, var(--primary, #166534) 6%, #fff);
}
.tss__card--muted {
  opacity: 0.92;
}
.tss__card-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}
.tss__card-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  line-height: 1.45;
}
.tss__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
}
.tss__field input,
.tss__field select,
.tss__field textarea {
  font: inherit;
  font-weight: 400;
  padding: 8px 10px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  background: #fff;
}
.tss__error {
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
}
.tss__ok {
  margin: 0;
  color: #166534;
  font-size: 13px;
}
.tss__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary, #64748b);
}
.tss__footer {
  margin-top: 18px;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
}
.tss__link {
  color: var(--primary, #166534);
  font-weight: 600;
}
</style>
