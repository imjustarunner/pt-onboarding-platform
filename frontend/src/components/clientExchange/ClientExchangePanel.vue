<template>
  <div class="client-exchange-panel">
    <div class="cep-header">
      <div>
        <h2 style="margin: 0;">Client Exchange</h2>
        <p class="muted" style="margin: 4px 0 0;">
          Post an office client that needs a new provider, or browse anonymized listings from other providers.
        </p>
      </div>
      <div class="cep-actions">
        <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        <button class="btn btn-primary btn-sm" type="button" @click="openPostModal">
          Post a client
        </button>
      </div>
    </div>

    <div class="cep-tabs" role="tablist">
      <button
        type="button"
        class="cep-tab"
        :class="{ active: activeTab === 'open' }"
        @click="activeTab = 'open'"
      >
        Open listings
        <span v-if="openListings.length" class="cep-count">{{ openListings.length }}</span>
      </button>
      <button
        type="button"
        class="cep-tab"
        :class="{ active: activeTab === 'mine' }"
        @click="activeTab = 'mine'"
      >
        My activity
      </button>
      <button
        type="button"
        class="cep-tab"
        :class="{ active: activeTab === 'closed' }"
        @click="activeTab = 'closed'"
      >
        Closed / withdrawn
      </button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="activeTab === 'open'" class="cep-list">
      <div v-if="!loading && openListings.length === 0" class="muted empty-state">
        No open listings right now.
      </div>
      <ListingCard
        v-for="listing in openListings"
        :key="listing.id"
        :listing="listing"
        :current-user-id="currentUserId"
        :is-backoffice="isBackoffice"
        :requests="requestsByListing[listing.id] || []"
        :requests-loading="requestsLoadingId === listing.id"
        @request="onRequest"
        @withdraw="onWithdraw"
        @expand="onExpand"
        @approve="onApprove"
        @deny="onDeny"
      />
    </div>

    <div v-else-if="activeTab === 'mine'" class="cep-list">
      <h3 class="cep-subheading">Listings I posted or currently hold</h3>
      <div v-if="!loading && myListings.length === 0" class="muted empty-state">
        You haven't posted any clients to the exchange.
      </div>
      <ListingCard
        v-for="listing in myListings"
        :key="listing.id"
        :listing="listing"
        :current-user-id="currentUserId"
        :is-backoffice="isBackoffice"
        :requests="requestsByListing[listing.id] || []"
        :requests-loading="requestsLoadingId === listing.id"
        @request="onRequest"
        @withdraw="onWithdraw"
        @expand="onExpand"
        @approve="onApprove"
        @deny="onDeny"
      />

      <h3 class="cep-subheading">My requests to other listings</h3>
      <div v-if="!loading && myRequests.length === 0" class="muted empty-state">
        You haven't requested any listings.
      </div>
      <table v-else class="cep-table">
        <thead>
          <tr>
            <th>Requested</th>
            <th>Status</th>
            <th>Listing status</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in myRequests" :key="r.id">
            <td>{{ formatDate(r.createdAt) }}</td>
            <td><span class="status-badge" :class="`status-${r.status}`">{{ r.status }}</span></td>
            <td>{{ r.listingStatus }}</td>
            <td>{{ r.message || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="cep-list">
      <div v-if="!loading && closedListings.length === 0" class="muted empty-state">
        Nothing here yet.
      </div>
      <ListingCard
        v-for="listing in closedListings"
        :key="listing.id"
        :listing="listing"
        :current-user-id="currentUserId"
        :is-backoffice="isBackoffice"
        :requests="requestsByListing[listing.id] || []"
        :requests-loading="requestsLoadingId === listing.id"
        @expand="onExpand"
      />
    </div>

    <PostListingModal
      v-if="showPostModal"
      :agency-id="agencyId"
      :is-backoffice="isBackoffice"
      @close="showPostModal = false"
      @posted="onPosted"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import ListingCard from './ListingCard.vue';
import PostListingModal from './PostListingModal.vue';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});
const currentUserId = computed(() => Number(authStore.user?.id || 0) || null);
const isBackoffice = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['admin', 'super_admin', 'support', 'staff'].includes(role);
});

const activeTab = ref('open');
const loading = ref(false);
const error = ref('');
const listings = ref([]);
const myRequests = ref([]);
const requestsByListing = ref({});
const requestsLoadingId = ref(null);
const showPostModal = ref(false);

const openListings = computed(() => listings.value.filter((l) => l.status === 'open' || l.status === 'requested'));
const closedListings = computed(() => listings.value.filter((l) => l.status === 'approved' || l.status === 'withdrawn' || l.status === 'closed'));
const myListings = computed(() =>
  listings.value.filter(
    (l) => Number(l.postedByUserId) === currentUserId.value || Number(l.currentProviderUserId) === currentUserId.value
  )
);

function formatDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString();
  } catch {
    return String(v);
  }
}

async function load() {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const [listingsRes, myRequestsRes] = await Promise.all([
      api.get('/client-exchange/listings', { params: { agencyId: agencyId.value } }),
      api.get('/client-exchange/my-requests', { params: { agencyId: agencyId.value } })
    ]);
    listings.value = listingsRes.data?.listings || [];
    myRequests.value = myRequestsRes.data?.requests || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load Client Exchange';
  } finally {
    loading.value = false;
  }
}

async function onExpand(listingId) {
  requestsLoadingId.value = listingId;
  try {
    const res = await api.get(`/client-exchange/listings/${listingId}`);
    requestsByListing.value = { ...requestsByListing.value, [listingId]: res.data?.requests || [] };
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load requests';
  } finally {
    requestsLoadingId.value = null;
  }
}

async function onRequest({ listingId, message }) {
  try {
    await api.post(`/client-exchange/listings/${listingId}/requests`, { message });
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to request listing';
  }
}

async function onWithdraw(listingId) {
  try {
    await api.post(`/client-exchange/listings/${listingId}/withdraw`);
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to withdraw listing';
  }
}

async function onApprove({ requestId, listingId }) {
  try {
    await api.post(`/client-exchange/requests/${requestId}/approve`);
    await load();
    await onExpand(listingId);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to approve request';
  }
}

async function onDeny({ requestId, listingId }) {
  try {
    await api.post(`/client-exchange/requests/${requestId}/deny`);
    await load();
    await onExpand(listingId);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to deny request';
  }
}

function openPostModal() {
  showPostModal.value = true;
}

async function onPosted() {
  showPostModal.value = false;
  await load();
}

onMounted(load);
</script>

<style scoped>
.client-exchange-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.cep-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.cep-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.cep-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--surface-muted, #f3f4f6);
  border-radius: 8px;
  width: fit-content;
}
.cep-tab {
  background: transparent;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cep-tab.active {
  background: var(--card-bg, #fff);
  color: var(--text, #111);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.cep-count {
  background: rgba(37, 99, 235, 0.15);
  color: #1d4ed8;
  border-radius: 999px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 800;
}
.cep-list {
  display: grid;
  gap: 10px;
}
.cep-subheading {
  font-size: 14px;
  font-weight: 800;
  margin: 8px 0 0;
  color: var(--text-secondary, #475569);
}
.empty-state {
  border: 1px dashed var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 20px;
  text-align: center;
}
.error {
  color: #c33;
}
.muted {
  color: var(--text-secondary, #64748b);
}
.cep-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  overflow: hidden;
}
.cep-table th,
.cep-table td {
  border-bottom: 1px solid var(--border, #e5e7eb);
  padding: 8px 10px;
  text-align: left;
  font-size: 13px;
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
.status-approved {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}
.status-denied {
  background: rgba(239, 68, 68, 0.15);
  color: #b91c1c;
}
.status-pending {
  background: rgba(245, 158, 11, 0.15);
  color: #92400e;
}
</style>
