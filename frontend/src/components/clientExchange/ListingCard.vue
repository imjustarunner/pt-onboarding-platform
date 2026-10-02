<template>
  <div
    class="listing-card"
    :class="{
      'listing-card--selected': selected,
      'listing-card--compact': compact
    }"
    @click="$emit('select', listing)"
  >
    <template v-if="compact">
      <div class="lc-compact-row">
        <strong class="lc-client-label">{{ clientLabel || 'Client' }}</strong>
        <span v-if="listing.pendingRequestCount > 0" class="lc-pending-badge lc-pending-badge--compact">
          {{ listing.pendingRequestCount }}
        </span>
      </div>
    </template>

    <template v-else>
      <div class="lc-top">
        <div class="lc-title">
          <span class="status-badge" :class="`status-${listing.status}`">{{ listing.status }}</span>
          <strong v-if="clientLabel" class="lc-client-label">{{ clientLabel }}</strong>
          <span v-if="listing.clientType" class="lc-type">{{ formatClientType(listing.clientType) }}</span>
          <span v-if="listing.pendingRequestCount > 0" class="lc-pending-badge">
            {{ listing.pendingRequestCount }} pending request{{ listing.pendingRequestCount === 1 ? '' : 's' }}
          </span>
        </div>
        <div class="lc-meta muted">Posted {{ formatDate(listing.createdAt) }}</div>
      </div>

      <ClientExchangeSummary :listing="listing" />

      <p>{{ listing.referralKind === 'additional_service' ? 'Additional services · current therapist retained' : 'Transfer' }} · {{ listing.serviceType || 'individual' }} <span v-if="listing.targetProviderUserId">· Direct referral</span></p>
      <p v-if="listing.notes" class="lc-notes">{{ listing.notes }}</p>

      <div class="lc-current" v-if="listing.currentProviderName">
        <span class="muted">Current provider:</span> {{ listing.currentProviderName }}
      </div>

      <div class="lc-actions" @click.stop>
        <button type="button" class="btn btn-primary btn-sm" @click="$emit('select', listing)">View client</button>
        <button
          v-if="canWithdraw"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="$emit('withdraw', listing.id)"
        >
          Withdraw
        </button>
        <button type="button" class="btn-link" @click="toggleExpand">
          {{ expanded ? 'Hide requests' : 'Review requests' }}
        </button>
      </div>

      <div v-if="expanded" class="lc-requests" @click.stop>
        <div v-if="requestsLoading" class="muted">Loading requests…</div>
        <div v-else-if="requests.length === 0" class="muted">No requests yet.</div>
        <table v-else class="lc-requests-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Message</th>
              <th>Status</th>
              <th v-if="listing.canManageClaims"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in requests" :key="r.id">
              <td>{{ r.requestingProviderName || `Provider #${r.requestingProviderUserId}` }}</td>
              <td>{{ r.message || '—' }}</td>
              <td><span class="status-badge" :class="`status-${r.status}`">{{ r.status }}</span></td>
              <td v-if="listing.canManageClaims">
                <div v-if="r.status === 'pending'" class="lc-request-resolve">
                  <button type="button" class="btn btn-primary btn-sm" @click="$emit('approve', { requestId: r.id, listingId: listing.id })">
                    {{ listing.currentProviderUserId ? 'Transfer to provider' : 'Assign to provider' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" @click="$emit('deny', { requestId: r.id, listingId: listing.id })">
                    Deny
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import ClientExchangeSummary from './ClientExchangeSummary.vue';

const props = defineProps({
  listing: { type: Object, required: true },
  currentUserId: { type: Number, default: null },
  isBackoffice: { type: Boolean, default: false },
  requests: { type: Array, default: () => [] },
  requestsLoading: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  clientLabel: { type: String, default: '' },
  compact: { type: Boolean, default: false }
});
const emit = defineEmits(['withdraw', 'expand', 'approve', 'deny', 'select']);

const expanded = ref(false);

const isCurrentProvider = computed(() => Number(props.listing.currentProviderUserId) === Number(props.currentUserId));
const isPoster = computed(() => Number(props.listing.postedByUserId) === Number(props.currentUserId));

const canWithdraw = computed(() => {
  if (!['open', 'requested'].includes(props.listing.status)) return false;
  return props.isBackoffice || isPoster.value || isCurrentProvider.value;
});

function formatClientType(t) {
  if (t === 'clinical') return 'Office / Clinical client';
  if (t === 'learning') return 'Learning client';
  if (t === 'school') return 'School client';
  return t;
}

function formatDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString();
  } catch {
    return String(v);
  }
}

function toggleExpand() {
  expanded.value = !expanded.value;
  if (expanded.value) emit('expand', props.listing.id);
}


</script>

<style scoped>
.listing-card {
  border: none;
  border-bottom: 1px solid var(--border, #f1f5f9);
  border-radius: 0;
  padding: 0.9rem 1rem;
  background: #fff;
  display: grid;
  gap: 7px;
  cursor: pointer;
  transition: background 0.1s;
}
.listing-card--compact {
  padding: 0.45rem 0.65rem;
  gap: 0;
}
.listing-card:hover { background: #f8fafc; }
.listing-card--selected { background: #f0fdf4 !important; border-left: 3px solid var(--primary, #2d6a4f); }
.lc-compact-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.lc-compact-row .lc-client-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}
.lc-pending-badge--compact {
  flex-shrink: 0;
  min-width: 20px;
  text-align: center;
  padding: 2px 6px;
}
.lc-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.lc-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.lc-client-label {
  font-size: 14px;
  color: var(--text, #1e293b);
}
.lc-type {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  font-weight: 600;
}
.lc-pending-badge {
  background: rgba(245, 158, 11, 0.15);
  color: #92400e;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 800;
}
.lc-meta {
  font-size: 12px;
}
.lc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.lc-chip {
  background: var(--surface-muted, #f3f4f6);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--text, #334155);
}
.lc-notes {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary, #475569);
}
.lc-current {
  font-size: 13px;
}
.lc-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.btn-link {
  background: none;
  border: none;
  color: #1d4ed8;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  padding: 0;
}
.lc-request-form {
  display: grid;
  gap: 8px;
}
.lc-request-form textarea {
  width: 100%;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 8px;
  font: inherit;
  resize: vertical;
}
.lc-request-form-actions {
  display: flex;
  gap: 8px;
}
.lc-requests {
  border-top: 1px solid var(--border, #e5e7eb);
  padding-top: 8px;
}
.lc-requests-table {
  width: 100%;
  border-collapse: collapse;
}
.lc-requests-table th,
.lc-requests-table td {
  text-align: left;
  padding: 6px 8px;
  font-size: 12px;
  border-bottom: 1px solid var(--border, #f1f5f9);
}
.lc-request-resolve {
  display: flex;
  gap: 6px;
}
.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  text-transform: capitalize;
  background: rgba(100, 116, 139, 0.14);
  color: #475569;
}
.status-open {
  background: rgba(37, 99, 235, 0.15);
  color: #1d4ed8;
}
.status-requested {
  background: rgba(245, 158, 11, 0.15);
  color: #92400e;
}
.status-approved {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}
.status-denied,
.status-withdrawn {
  background: rgba(148, 163, 184, 0.2);
  color: #475569;
}
.status-closed {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}
.status-pending {
  background: rgba(245, 158, 11, 0.15);
  color: #92400e;
}
.muted {
  color: var(--text-secondary, #64748b);
  font-size: 13px;
}
</style>
