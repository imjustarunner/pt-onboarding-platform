<template>
  <div class="cc-enc-tab">
    <div class="cc-enc-toolbar">
      <div class="cc-enc-toolbar__meta">
        <h3>Billing</h3>
        <p class="muted tiny">Imported billing report amounts (admin / support only).</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <p v-if="error" class="cc-enc-error">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading billing lines…</p>
    <p v-else-if="!sortedEncounters.length" class="cc-enc-empty">
      No imported billing sessions for this client.
    </p>

    <template v-else>
      <div class="cc-enc-kpi-row">
        <div class="cc-enc-kpi">
          <div class="cc-enc-kpi__label">Account balance</div>
          <div
            class="cc-enc-kpi__value"
            :class="{ 'cc-enc-kpi__value--warn': accountBalance > 0 }"
          >
            {{ formatEncounterMoney(accountBalance) }}
          </div>
        </div>
        <div class="cc-enc-kpi">
          <div class="cc-enc-kpi__label">Insurance outstanding</div>
          <div class="cc-enc-kpi__value">{{ formatEncounterMoney(totals.insuranceOutstanding) }}</div>
        </div>
        <div class="cc-enc-kpi">
          <div class="cc-enc-kpi__label">Patient owed</div>
          <div
            class="cc-enc-kpi__value"
            :class="{ 'cc-enc-kpi__value--warn': totals.patientBalance > 0 }"
          >
            {{ formatEncounterMoney(totals.patientBalance) }}
          </div>
        </div>
        <div class="cc-enc-kpi">
          <div class="cc-enc-kpi__label">Total billed</div>
          <div class="cc-enc-kpi__value">{{ formatEncounterMoney(totals.totalBilled) }}</div>
        </div>
        <div class="cc-enc-kpi">
          <div class="cc-enc-kpi__label">Payments received</div>
          <div class="cc-enc-kpi__value cc-enc-kpi__value--ok">
            {{ formatEncounterMoney(totals.paymentsReceived) }}
          </div>
        </div>
        <div class="cc-enc-kpi">
          <div class="cc-enc-kpi__label">Pending claims</div>
          <div class="cc-enc-kpi__value">{{ pendingClaimsCount }}</div>
        </div>
      </div>

      <div class="cc-enc-billing-layout">
        <div class="cc-enc-claims-wrap">
          <table class="cc-enc-claims-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Code</th>
                <th>Status</th>
                <th>Provider</th>
                <th>Diagnosis</th>
                <th class="num">Charge</th>
                <th class="num">Pt owed</th>
                <th class="num">Ins owed</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in sortedEncounters" :key="row.id">
                <td>{{ formatEncounterDate(row.service_date) }}</td>
                <td class="cc-enc-mono">{{ row.service_code || '—' }}</td>
                <td>
                  <span class="cc-enc-claim-pill" :class="`cc-enc-claim-pill--${claimStatusForRow(row)}`">
                    {{ claimStatusLabel(row) }}
                  </span>
                </td>
                <td>{{ formatEncounterProvider(row) }}</td>
                <td>{{ row.diagnosis_text || '—' }}</td>
                <td class="num">{{ formatEncounterMoney(row.charge_rate) }}</td>
                <td class="num">{{ formatEncounterMoney(row.patient_balance) }}</td>
                <td class="num">{{ formatEncounterMoney(row.insurance_outstanding) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside class="cc-enc-sidebar">
          <div class="cc-enc-sidebar-card">
            <h4>Account summary</h4>
            <div class="cc-enc-sidebar-row">
              <span class="cc-enc-sidebar-row__label">Sessions</span>
              <span class="cc-enc-sidebar-row__value">{{ sessionCount }}</span>
            </div>
            <div class="cc-enc-sidebar-row">
              <span class="cc-enc-sidebar-row__label">Total billed</span>
              <span class="cc-enc-sidebar-row__value">{{ formatEncounterMoney(totals.totalBilled) }}</span>
            </div>
            <div class="cc-enc-sidebar-row">
              <span class="cc-enc-sidebar-row__label">Balance due</span>
              <span class="cc-enc-sidebar-row__value">{{ formatEncounterMoney(accountBalance) }}</span>
            </div>
            <div class="cc-enc-sidebar-row">
              <span class="cc-enc-sidebar-row__label">Payments</span>
              <span class="cc-enc-sidebar-row__value">{{ formatEncounterMoney(totals.paymentsReceived) }}</span>
            </div>
          </div>

          <div class="cc-enc-sidebar-card">
            <h4>Insurance</h4>
            <div class="cc-enc-sidebar-row">
              <span class="cc-enc-sidebar-row__label">Type</span>
              <span class="cc-enc-sidebar-row__value">{{ insuranceTypeLabel }}</span>
            </div>
            <div class="cc-enc-sidebar-row">
              <span class="cc-enc-sidebar-row__label">Primary payer</span>
              <span class="cc-enc-sidebar-row__value">{{ primaryPayerLabel }}</span>
            </div>
            <div class="cc-enc-sidebar-row">
              <span class="cc-enc-sidebar-row__label">Member ID</span>
              <span class="cc-enc-sidebar-row__value">{{ memberIdLabel }}</span>
            </div>
          </div>

          <div class="cc-enc-sidebar-card">
            <h4>Recent payments</h4>
            <template v-if="recentPaymentLines.length">
              <div v-for="row in recentPaymentLines" :key="`pay-${row.id}`" class="cc-enc-payment-line">
                <div>{{ formatEncounterDate(row.service_date) }} · {{ row.service_code || '—' }}</div>
                <div class="muted tiny">
                  Pt {{ formatEncounterMoney(row.patient_amount) }}
                  · Ins {{ formatEncounterMoney(row.insurance_amount) }}
                </div>
              </div>
            </template>
            <p v-else class="muted tiny" style="margin: 0;">No payment amounts on imported lines yet.</p>
          </div>

          <div class="cc-enc-sidebar-card">
            <h4>Billing tools</h4>
            <nav class="cc-enc-tool-links">
              <RouterLink :to="billingReportsPath" class="cc-enc-tool-link">
                Billing reports
              </RouterLink>
              <RouterLink :to="receivablesPath" class="cc-enc-tool-link">
                Receivables
              </RouterLink>
            </nav>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useClientEncounters } from '../../composables/useClientEncounters.js';
import {
  CLAIM_STATUS_LABELS,
  claimStatusForRow,
  formatEncounterDate,
  formatEncounterMoney,
  formatEncounterProvider
} from '../../utils/clientEncounterUtils.js';
import '../../styles/client-encounters-tab.css';

const props = defineProps({
  agencyId: { type: Number, default: null },
  clientId: { type: Number, default: null },
  client: { type: Object, default: null }
});

const route = useRoute();

const agencyRef = computed(() => props.agencyId);
const clientRef = computed(() => props.clientId);

const {
  sortedEncounters,
  loading,
  error,
  load,
  sessionCount,
  totals,
  accountBalance,
  pendingClaimsCount,
  recentPaymentLines
} = useClientEncounters(agencyRef, clientRef, { medicalOnly: false });

const insuranceTypeLabel = computed(() =>
  String(props.client?.insurance_type_label || '').trim() || '—'
);

const primaryPayerLabel = computed(() => {
  const name = String(props.client?.primary_insurer_name || '').trim();
  if (name) return name;
  return insuranceTypeLabel.value !== '—' ? insuranceTypeLabel.value : '—';
});

const memberIdLabel = computed(() =>
  String(props.client?.insurance_member_id || props.client?.member_id || '').trim() || '—'
);

const orgSlug = computed(() => String(route.params?.organizationSlug || '').trim());

const billingReportsPath = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/admin/billing-reports` : '/admin/billing-reports'
);

const receivablesPath = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/admin/receivables` : '/admin/receivables'
);

function claimStatusLabel(row) {
  return CLAIM_STATUS_LABELS[claimStatusForRow(row)] || 'Submitted';
}
</script>

<style scoped>
.muted { color: var(--text-secondary, #64748b); }
.tiny { font-size: 12px; }
</style>
