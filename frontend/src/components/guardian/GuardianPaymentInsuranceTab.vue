<template>
  <div class="gpi-tab">
    <!-- Saved payment cards -->
    <div class="gpi-section">
      <div class="gpi-section-head">
        <h4>Saved payment methods</h4>
      </div>
      <div v-if="cardsLoading" class="gpi-hint">Loading…</div>
      <div v-else-if="!cards.length" class="gpi-empty">
        No payment methods on file. Payment methods are saved during program enrollment when a self-pay
        cost applies to your enrollment.
      </div>
      <div v-else class="gpi-card-list">
        <div v-for="card in cards" :key="card.id" class="gpi-card-row">
          <div class="gpi-card-brand">{{ card.card_brand || 'Card' }}</div>
          <div class="gpi-card-detail">•••• •••• •••• {{ card.card_last4 }}</div>
          <div class="gpi-card-exp">Expires {{ card.card_exp_month }}/{{ card.card_exp_year }}</div>
          <div class="gpi-card-holder">{{ card.cardholder_name }}</div>
          <div class="gpi-card-tags">
            <span v-if="card.is_default" class="gpi-tag gpi-tag--default">Default</span>
            <span v-if="card.auto_charge" class="gpi-tag gpi-tag--auto">Auto-charge</span>
          </div>
          <button type="button" class="gpi-remove-btn" @click="removeCard(card)">Remove</button>
        </div>
      </div>
      <div v-if="cardsError" class="gpi-error">{{ cardsError }}</div>
    </div>

    <!-- Insurance on file -->
    <div class="gpi-section">
      <div class="gpi-section-head">
        <h4>Insurance information on file</h4>
      </div>
      <div v-if="insLoading" class="gpi-hint">Loading…</div>
      <div v-else-if="!insuranceProfiles.length" class="gpi-empty">
        No insurance information on file. Insurance details are collected during program enrollment when
        applicable to the event or class you are enrolled in.
      </div>
      <div v-else>
        <div v-for="profile in insuranceProfiles" :key="profile.id" class="gpi-ins-row">
          <div class="gpi-ins-head">
            <strong>Primary:</strong> {{ profile.primary_insurer_name || '—' }}
            <span v-if="profile.primary_is_medicaid" class="gpi-tag gpi-tag--medicaid">Medicaid</span>
          </div>
          <div class="gpi-ins-meta">
            <span>Member ID: {{ profile.primary_member_id || '—' }}</span>
            <span v-if="profile.primary_group_number">Group: {{ profile.primary_group_number }}</span>
          </div>
          <div v-if="profile.secondary_insurer_name" class="gpi-ins-secondary">
            <strong>Secondary:</strong> {{ profile.secondary_insurer_name }}
            <span v-if="profile.secondary_is_medicaid" class="gpi-tag gpi-tag--medicaid">Medicaid</span>
            <br />
            <span>Member ID: {{ profile.secondary_member_id || '—' }}</span>
          </div>
          <div class="gpi-ins-date">Collected: {{ formatDate(profile.collected_at) }}</div>
        </div>
      </div>
      <div v-if="insError" class="gpi-error">{{ insError }}</div>
    </div>

    <div class="gpi-notice">
      To update insurance information or add a new payment method, please contact the program administrator
      or re-enroll through a registration form.
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  guardianUserId: { type: [Number, String], default: null }
});

const cards = ref([]);
const cardsLoading = ref(false);
const cardsError = ref('');

const insuranceProfiles = ref([]);
const insLoading = ref(false);
const insError = ref('');

async function loadCards() {
  if (!props.agencyId || !props.guardianUserId) return;
  cardsLoading.value = true;
  cardsError.value = '';
  try {
    const resp = await api.get(`/guardian-billing/payment-cards`, {
      params: { agencyId: props.agencyId }
    });
    cards.value = resp.data?.cards || [];
  } catch {
    cardsError.value = 'Could not load payment methods.';
  } finally {
    cardsLoading.value = false;
  }
}

async function loadInsurance() {
  if (!props.agencyId || !props.guardianUserId) return;
  insLoading.value = true;
  insError.value = '';
  try {
    const resp = await api.get(`/guardian-billing/insurance`, {
      params: { agencyId: props.agencyId }
    });
    insuranceProfiles.value = resp.data?.profiles || [];
  } catch {
    insError.value = 'Could not load insurance information.';
  } finally {
    insLoading.value = false;
  }
}

async function removeCard(card) {
  if (!confirm(`Remove ${card.card_brand || 'card'} ending in ${card.card_last4}?`)) return;
  try {
    await api.delete(`/guardian-billing/payment-cards/${card.id}`);
    cards.value = cards.value.filter((c) => c.id !== card.id);
  } catch {
    cardsError.value = 'Could not remove payment method.';
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

onMounted(() => {
  loadCards();
  loadInsurance();
});
</script>

<style scoped>
.gpi-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px 0;
}
.gpi-section {
  background: var(--bg, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 16px;
}
.gpi-section-head {
  margin-bottom: 12px;
}
.gpi-section-head h4 {
  margin: 0;
  font-size: 1rem;
}
.gpi-hint, .gpi-empty {
  font-size: 14px;
  color: var(--text-secondary, #64748b);
  padding: 6px 0;
}
.gpi-error {
  font-size: 13px;
  color: var(--danger, #dc2626);
  margin-top: 8px;
}
.gpi-card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.gpi-card-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
}
.gpi-card-brand {
  font-weight: 600;
  min-width: 60px;
}
.gpi-card-detail {
  font-family: monospace;
  flex: 1;
}
.gpi-card-exp, .gpi-card-holder {
  color: #64748b;
  font-size: 13px;
}
.gpi-card-tags {
  display: flex;
  gap: 6px;
}
.gpi-remove-btn {
  font-size: 12px;
  color: var(--danger, #dc2626);
  background: none;
  border: none;
  cursor: pointer;
  margin-left: auto;
}
.gpi-ins-row {
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 8px;
}
.gpi-ins-head {
  font-weight: 600;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.gpi-ins-meta {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #475569;
  margin-bottom: 4px;
}
.gpi-ins-secondary {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
  font-size: 13px;
  color: #475569;
}
.gpi-ins-date {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 6px;
}
.gpi-tag {
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  padding: 1px 6px;
}
.gpi-tag--default { background: #dbeafe; color: #1d4ed8; }
.gpi-tag--auto { background: #fef9c3; color: #713f12; }
.gpi-tag--medicaid { background: #dcfce7; color: #166534; }
.gpi-notice {
  font-size: 13px;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
}
</style>
