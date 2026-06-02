<template>
  <div class="pay-hub">
    <header class="pay-hub__header">
      <div class="pay-hub__header-left">
        <div class="pay-hub__title-row">
          <span class="pay-hub__title-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </span>
          <h2 class="pay-hub__title">{{ title }}</h2>
        </div>
        <p v-if="subtitle" class="pay-hub__subtitle">{{ subtitle }}</p>
      </div>
      <div class="pay-hub__header-actions">
        <slot name="header-actions">
          <button type="button" class="pay-hub__btn pay-hub__btn--ghost" :disabled="loading" @click="$emit('refresh')">
            Refresh
          </button>
        </slot>
      </div>
    </header>

    <div v-if="!loading && showStats" class="pay-hub__stats">
      <div class="pay-hub__stat">
        <div class="pay-hub__stat-icon pay-hub__stat-icon--teal">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 7v10a2 2 0 0 0 2 2h16v-5"/></svg>
        </div>
        <div>
          <div class="pay-hub__stat-value">{{ stats.totalPeriods }}</div>
          <div class="pay-hub__stat-label">Pay Periods</div>
          <div class="pay-hub__stat-hint">Posted history</div>
        </div>
      </div>
      <div class="pay-hub__stat">
        <div class="pay-hub__stat-icon pay-hub__stat-icon--orange">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="8" y1="12" x2="12" y2="12"/></svg>
        </div>
        <div>
          <div class="pay-hub__stat-value">{{ stats.pendingSubmissions }}</div>
          <div class="pay-hub__stat-label">Pending Submissions</div>
          <div class="pay-hub__stat-hint">Awaiting approval</div>
        </div>
      </div>
      <div class="pay-hub__stat">
        <div class="pay-hub__stat-icon pay-hub__stat-icon--green">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div>
          <div class="pay-hub__stat-value">{{ formatMoney(stats.ytdPay) }}</div>
          <div class="pay-hub__stat-label">YTD Pay</div>
          <div class="pay-hub__stat-hint">{{ new Date().getFullYear() }} total</div>
        </div>
      </div>
      <div class="pay-hub__stat">
        <div class="pay-hub__stat-icon pay-hub__stat-icon--purple">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
        </div>
        <div>
          <div class="pay-hub__stat-value">{{ fmtNum(stats.ptoHoursTotal) }}</div>
          <div class="pay-hub__stat-label">PTO Balance</div>
          <div class="pay-hub__stat-hint">Sick + training hrs</div>
        </div>
      </div>
    </div>

    <slot name="filters" />

    <div v-if="!loading && actionItems.length" class="pay-hub__action-required">
      <div class="pay-hub__action-required-head">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="8" y1="12" x2="12" y2="12" />
        </svg>
        <strong>Action required</strong>
        <span class="pay-hub__action-required-count">{{ actionItems.length }} item{{ actionItems.length === 1 ? '' : 's' }}</span>
      </div>
      <ul class="pay-hub__action-required-list">
        <li v-for="item in actionItems" :key="item.key">
          <span class="pay-hub__action-required-name">{{ item.title }}</span>
          <span :class="['hub-pill', 'hub-pill--sm', item.statusClass]">{{ item.statusLabel }}</span>
          <button
            type="button"
            class="pay-hub__btn pay-hub__btn--primary pay-hub__btn--sm"
            @click="$emit('action-item', item)"
          >
            Review
          </button>
        </li>
      </ul>
    </div>

    <div v-if="showInfoBanner && !loading" class="pay-hub__banner">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <p>{{ infoBannerText }}</p>
      <button type="button" class="pay-hub__banner-close" aria-label="Dismiss" @click="showInfoBanner = false">×</button>
    </div>

    <div v-if="loading" class="pay-hub__state">
      <div class="pay-hub__spinner" />
      <p>Loading payroll…</p>
    </div>
    <div v-else-if="error" class="pay-hub__error">{{ error }}</div>

    <div v-else class="pay-hub__body">
      <main class="pay-hub__main">
        <slot />
      </main>
      <aside v-if="showSidebar" class="pay-hub__sidebar">
        <div class="pay-hub__widget">
          <h3>Latest pay period</h3>
          <p v-if="stats.latestPeriodLabel" class="pay-hub__widget-period">{{ stats.latestPeriodLabel }}</p>
          <p v-else class="pay-hub__widget-muted">No posted periods yet</p>
          <p v-if="stats.latestPeriodPay" class="pay-hub__widget-amount">{{ formatMoney(stats.latestPeriodPay) }}</p>
        </div>
        <div class="pay-hub__widget">
          <h3>PTO available</h3>
          <ul class="pay-hub__mini-list">
            <li><span>Sick leave</span><strong>{{ fmtNum(sidebar.ptoSickHours) }}h</strong></li>
            <li>
              <span>Training PTO</span>
              <strong>{{ sidebar.ptoTrainingEligible ? fmtNum(sidebar.ptoTrainingHours) + 'h' : '—' }}</strong>
            </li>
          </ul>
        </div>
        <div v-if="stats.pendingSubmissions > 0" class="pay-hub__widget pay-hub__widget--alert">
          <h3>Submissions</h3>
          <p class="pay-hub__widget-alert">{{ stats.pendingSubmissions }} pending approval</p>
        </div>
        <slot name="sidebar" />
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { formatPayrollMoney } from '../../utils/payrollUiHelpers';

const props = defineProps({
  title: { type: String, default: 'My Payroll' },
  subtitle: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  stats: {
    type: Object,
    default: () => ({
      totalPeriods: 0,
      pendingSubmissions: 0,
      ytdPay: 0,
      ptoHoursTotal: 0,
      latestPeriodLabel: null,
      latestPeriodPay: 0,
    }),
  },
  sidebar: {
    type: Object,
    default: () => ({ ptoSickHours: 0, ptoTrainingHours: 0, ptoTrainingEligible: false }),
  },
  actionItems: { type: Array, default: () => [] },
  showSidebar: { type: Boolean, default: true },
  showStats: { type: Boolean, default: true },
  infoBannerText: {
    type: String,
    default:
      'Pay history and submissions are organized by category. Expand a section to view details or submit new claims.',
  },
});

defineEmits(['refresh', 'action-item']);

const showInfoBanner = ref(true);
const formatMoney = formatPayrollMoney;
const fmtNum = (n) => {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
</script>

<style scoped>
.pay-hub {
  --hub-green: #166534;
  --hub-green-dark: #14532d;
  --hub-border: #e5e7eb;
  --hub-muted: #6b7280;
  font-family: var(--font-body, 'Inter', system-ui, sans-serif);
  color: #111827;
}

.pay-hub__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
}

.pay-hub__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.pay-hub__title-icon {
  display: flex;
  color: var(--hub-green);
}

.pay-hub__title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.pay-hub__subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--hub-muted);
  max-width: 560px;
  line-height: 1.5;
}

.pay-hub__header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.pay-hub__btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  white-space: nowrap;
}

.pay-hub__btn--primary {
  background: var(--hub-green);
  color: #fff;
}
.pay-hub__btn--primary:hover {
  background: var(--hub-green-dark);
}

.pay-hub__btn--ghost {
  background: #fff;
  color: #374151;
  border: 1px solid var(--hub-border);
}
.pay-hub__btn--ghost:hover {
  background: #f9fafb;
}

.pay-hub__btn--sm {
  padding: 6px 14px;
  font-size: 13px;
}

.pay-hub__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

@media (max-width: 1100px) {
  .pay-hub__stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 520px) {
  .pay-hub__stats {
    grid-template-columns: 1fr;
  }
}

.pay-hub__stat {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 18px 20px;
  background: #fff;
  border: 1px solid var(--hub-border);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.pay-hub__stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pay-hub__stat-icon--teal {
  background: #ccfbf1;
  color: #0f766e;
}
.pay-hub__stat-icon--orange {
  background: #ffedd5;
  color: #c2410c;
}
.pay-hub__stat-icon--green {
  background: #dcfce7;
  color: var(--hub-green);
}
.pay-hub__stat-icon--purple {
  background: #f3e8ff;
  color: #7c3aed;
}

.pay-hub__stat-value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
}

.pay-hub__stat-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-top: 2px;
}

.pay-hub__stat-hint {
  font-size: 12px;
  color: var(--hub-muted);
  margin-top: 2px;
}

.pay-hub__action-required {
  margin-bottom: 16px;
  padding: 14px 16px;
  background: linear-gradient(135deg, #fffbeb 0%, #fff7ed 100%);
  border: 1px solid #fcd34d;
  border-radius: 10px;
}

.pay-hub__action-required-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  color: #92400e;
  font-size: 14px;
}

.pay-hub__action-required-count {
  margin-left: auto;
  font-size: 12px;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  padding: 2px 8px;
  border-radius: 999px;
}

.pay-hub__action-required-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pay-hub__action-required-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #fde68a;
  border-radius: 8px;
}

.pay-hub__action-required-name {
  flex: 1;
  min-width: 140px;
  font-size: 14px;
  font-weight: 600;
}

.pay-hub__banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 20px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  color: #166534;
  font-size: 14px;
}

.pay-hub__banner p {
  margin: 0;
  flex: 1;
}

.pay-hub__banner-close {
  background: none;
  border: none;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
}

.pay-hub__state,
.pay-hub__error {
  text-align: center;
  padding: 48px 24px;
  color: var(--hub-muted);
}

.pay-hub__error {
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
}

.pay-hub__spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e5e7eb;
  border-top-color: var(--hub-green);
  border-radius: 50%;
  animation: pay-hub-spin 0.8s linear infinite;
  margin: 0 auto 12px;
}

@keyframes pay-hub-spin {
  to {
    transform: rotate(360deg);
  }
}

.pay-hub__body {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 24px;
  align-items: start;
}

@media (max-width: 1024px) {
  .pay-hub__body {
    grid-template-columns: 1fr;
  }
}

.pay-hub__sidebar {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pay-hub__widget {
  background: #fff;
  border: 1px solid var(--hub-border);
  border-radius: 10px;
  padding: 16px 18px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.pay-hub__widget h3 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 700;
}

.pay-hub__widget-period {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--hub-muted);
}

.pay-hub__widget-amount {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--hub-green);
}

.pay-hub__widget-muted {
  margin: 0;
  font-size: 13px;
  color: var(--hub-muted);
}

.pay-hub__mini-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.pay-hub__mini-list li {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px solid #f3f4f6;
}

.pay-hub__mini-list li:last-child {
  border-bottom: none;
}

.pay-hub__widget--alert {
  border-color: #fcd34d;
  background: #fffbeb;
}

.pay-hub__widget-alert {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #92400e;
}

:deep(.hub-pill) {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
:deep(.hub-pill--sm) {
  font-size: 11px;
  padding: 2px 8px;
}
:deep(.hub-pill--success) {
  background: #dcfce7;
  color: #166534;
}
:deep(.hub-pill--warning) {
  background: #fef3c7;
  color: #92400e;
}
:deep(.hub-pill--danger) {
  background: #fee2e2;
  color: #b91c1c;
}
:deep(.hub-pill--muted) {
  background: #f3f4f6;
  color: #4b5563;
}
</style>
