<template>
  <div class="cep-root">
    <!-- Page Header -->
    <div class="cep-page-header">
      <div class="cep-header-copy">
        <h1 class="cep-title">Client Exchange</h1>
        <p class="cep-subtitle">Navigate, assign, and distribute clients quickly.</p>
      </div>
      <div class="cep-header-actions">
        <button class="cep-btn cep-btn--ghost" type="button" @click="load" :disabled="loading">
          {{ loading ? 'Loading…' : '↺ Refresh' }}
        </button>
        <button class="cep-btn cep-btn--primary" type="button" @click="openPostModal">
          + Post a client
        </button>
      </div>
    </div>

    <!-- Stats row -->
    <div class="cep-stats">
      <div class="cep-stat">
        <div class="cep-stat-icon cep-stat-icon--blue">⇄</div>
        <div>
          <div class="cep-stat-value">{{ openListings.length }}</div>
          <div class="cep-stat-label">Open listings</div>
        </div>
      </div>
      <div class="cep-stat">
        <div class="cep-stat-icon cep-stat-icon--green">✓</div>
        <div>
          <div class="cep-stat-value">{{ closedListings.length }}</div>
          <div class="cep-stat-label">Closed / assigned</div>
        </div>
      </div>
      <div class="cep-stat">
        <div class="cep-stat-icon cep-stat-icon--purple">⏳</div>
        <div>
          <div class="cep-stat-value">{{ pendingRequestCount }}</div>
          <div class="cep-stat-label">Pending requests</div>
        </div>
      </div>
      <div class="cep-stat">
        <div class="cep-stat-icon cep-stat-icon--amber">👥</div>
        <div>
          <div class="cep-stat-value">{{ myListings.length }}</div>
          <div class="cep-stat-label">My activity</div>
        </div>
      </div>
    </div>

    <!-- Tabs + search -->
    <div class="cep-toolbar">
      <div class="cep-tabs" role="tablist">
        <button type="button" class="cep-tab" :class="{ active: activeTab === 'open' }" @click="activeTab = 'open'">
          Open listings
          <span v-if="openListings.length" class="cep-count">{{ openListings.length }}</span>
        </button>
        <button type="button" class="cep-tab" :class="{ active: activeTab === 'mine' }" @click="activeTab = 'mine'">
          My activity
        </button>
        <button type="button" class="cep-tab" :class="{ active: activeTab === 'closed' }" @click="activeTab = 'closed'">
          Closed / withdrawn
        </button>
      </div>

      <div class="cep-search-wrap">
        <span class="cep-search-icon" aria-hidden="true">⌕</span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by type, concern, age, modality…"
          class="cep-search-input"
        />
        <button v-if="searchQuery" class="cep-search-clear" type="button" @click="searchQuery = ''">✕</button>
      </div>
    </div>

    <div v-if="error" class="cep-banner cep-banner--warn">{{ error }}</div>

    <!-- Split layout -->
    <div class="cep-layout" :class="{ 'cep-layout--split': !!selectedListing }">
      <!-- Left: list -->
      <div class="cep-list-col">
        <!-- Open tab -->
        <template v-if="activeTab === 'open'">
          <div v-if="!loading && filteredOpen.length === 0" class="cep-empty">
            {{ searchQuery ? 'No results for your search.' : 'No open listings right now.' }}
          </div>
          <ListingCard
            v-for="listing in filteredOpen"
            :key="listing.id"
            :listing="listing"
            :current-user-id="currentUserId"
            :is-backoffice="isBackoffice"
            :selected="selectedListingId === listing.id"
            :requests="requestsByListing[listing.id] || []"
            :requests-loading="requestsLoadingId === listing.id"
            @select="selectListing(listing)"
            @request="onRequest"
            @withdraw="onWithdraw"
            @expand="onExpand"
            @approve="onApprove"
            @deny="onDeny"
          />
        </template>

        <!-- Mine tab -->
        <template v-else-if="activeTab === 'mine'">
          <div class="cep-sub-heading">Listings I posted or currently hold</div>
          <div v-if="!loading && myListings.length === 0" class="cep-empty">
            You haven't posted any clients to the exchange.
          </div>
          <ListingCard
            v-for="listing in myListings"
            :key="listing.id"
            :listing="listing"
            :current-user-id="currentUserId"
            :is-backoffice="isBackoffice"
            :selected="selectedListingId === listing.id"
            :requests="requestsByListing[listing.id] || []"
            :requests-loading="requestsLoadingId === listing.id"
            @select="selectListing(listing)"
            @request="onRequest"
            @withdraw="onWithdraw"
            @expand="onExpand"
            @approve="onApprove"
            @deny="onDeny"
          />

          <div class="cep-sub-heading" style="margin-top: 1rem;">My requests to other listings</div>
          <div v-if="!loading && myRequests.length === 0" class="cep-empty">
            You haven't requested any listings.
          </div>
          <div v-else class="cep-request-list">
            <div v-for="r in myRequests" :key="r.id" class="cep-request-row">
              <div>
                <span class="cep-status-badge" :class="`cep-status-${r.status}`">{{ r.status }}</span>
              </div>
              <div class="cep-request-dates">{{ formatDate(r.createdAt) }}</div>
              <div class="cep-request-listing-status">Listing: {{ r.listingStatus }}</div>
              <div v-if="r.message" class="cep-request-msg">{{ r.message }}</div>
            </div>
          </div>
        </template>

        <!-- Closed tab -->
        <template v-else>
          <div v-if="!loading && closedListings.length === 0" class="cep-empty">Nothing here yet.</div>
          <ListingCard
            v-for="listing in closedListings"
            :key="listing.id"
            :listing="listing"
            :current-user-id="currentUserId"
            :is-backoffice="isBackoffice"
            :selected="selectedListingId === listing.id"
            :requests="requestsByListing[listing.id] || []"
            :requests-loading="requestsLoadingId === listing.id"
            @select="selectListing(listing)"
            @expand="onExpand"
          />
        </template>
      </div>

      <!-- Right: detail panel -->
      <div class="cep-detail-col" v-if="selectedListing">
        <div class="cep-detail-header">
          <div class="cep-detail-header-left">
            <div class="cep-detail-id-row">
              <span class="cep-status-badge" :class="`cep-status-${selectedListing.status}`">
                {{ selectedListing.status }}
              </span>
              <strong>{{ formatClientType(selectedListing.clientType) }}</strong>
              <span v-if="selectedListing.clientIdentifier" class="cep-detail-code">
                #{{ selectedListing.clientIdentifier }}
              </span>
            </div>
            <p class="cep-detail-posted">Posted {{ formatDate(selectedListing.createdAt) }}</p>
          </div>
          <button type="button" class="cep-close-detail" @click="selectedListingId = null" title="Close">✕</button>
        </div>

        <div v-if="selectedListingChips.length" class="cep-detail-chips">
          <span v-for="(chip, idx) in selectedListingChips" :key="idx" class="cep-chip">{{ chip }}</span>
        </div>

        <section class="cep-detail-section">
          <div class="cep-detail-section-title">Notes</div>
          <p v-if="selectedListing.notes">{{ selectedListing.notes }}</p>
          <p v-else class="cep-muted">No notes provided.</p>
        </section>

        <section v-if="selectedListing.currentProviderName" class="cep-detail-section">
          <div class="cep-detail-section-title">Current provider</div>
          <p>{{ selectedListing.currentProviderName }}</p>
        </section>

        <!-- Requests for this listing -->
        <section class="cep-detail-section">
          <div class="cep-detail-section-title">
            Requests
            <span v-if="selectedListing.pendingRequestCount > 0" class="cep-pending-badge">
              {{ selectedListing.pendingRequestCount }} pending
            </span>
          </div>
          <div v-if="requestsLoadingId === selectedListing.id" class="cep-muted">Loading…</div>
          <div v-else-if="!requestsByListing[selectedListing.id]?.length" class="cep-muted">No requests yet.</div>
          <div v-else class="cep-requests-list">
            <div v-for="r in requestsByListing[selectedListing.id]" :key="r.id" class="cep-request-item">
              <div class="cep-request-item-top">
                <strong>{{ r.requestingProviderName || `Provider #${r.requestingProviderUserId}` }}</strong>
                <span class="cep-status-badge" :class="`cep-status-${r.status}`">{{ r.status }}</span>
              </div>
              <p v-if="r.message" class="cep-request-item-msg">{{ r.message }}</p>
              <div v-if="r.status === 'pending' && (isBackoffice || isCurrentProviderFor(selectedListing))" class="cep-request-item-actions">
                <button type="button" class="cep-btn cep-btn--primary cep-btn--sm" @click="onApprove({ requestId: r.id, listingId: selectedListing.id })">
                  Approve
                </button>
                <button type="button" class="cep-btn cep-btn--ghost cep-btn--sm" @click="onDeny({ requestId: r.id, listingId: selectedListing.id })">
                  Deny
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="cep-btn cep-btn--ghost cep-btn--sm"
            style="margin-top: 0.5rem;"
            @click="onExpand(selectedListing.id)"
          >
            {{ requestsLoadingId === selectedListing.id ? 'Loading…' : 'Refresh requests' }}
          </button>
        </section>

        <!-- Actions -->
        <section class="cep-detail-section cep-detail-section--actions">
          <template v-if="canRequest(selectedListing)">
            <div class="cep-detail-section-title">Request this client</div>
            <textarea
              v-model="requestMessages[selectedListing.id]"
              rows="2"
              class="cep-request-textarea"
              placeholder="Optional note for the current provider…"
            ></textarea>
            <div class="cep-detail-action-row">
              <button type="button" class="cep-btn cep-btn--primary" @click="submitRequest(selectedListing)">
                Send request
              </button>
            </div>
          </template>
          <template v-if="canWithdraw(selectedListing)">
            <button type="button" class="cep-btn cep-btn--ghost" @click="onWithdraw(selectedListing.id)">
              Withdraw listing
            </button>
          </template>
        </section>
      </div>

    </div>

    <!-- Post listing modal -->
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
import { computed, onMounted, ref, reactive } from 'vue';
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
const selectedListingId = ref(null);
const searchQuery = ref('');
const requestMessages = reactive({});

const selectedListing = computed(() => {
  if (!selectedListingId.value) return null;
  return listings.value.find((l) => l.id === selectedListingId.value) || null;
});

const selectedListingChips = computed(() => {
  const l = selectedListing.value;
  if (!l) return [];
  const out = [];
  const demo = l.demographics || {};
  if (demo.ageBand) out.push(`Age: ${demo.ageBand}`);
  if (demo.gender) out.push(demo.gender);
  const problems = l.presentingProblems;
  if (Array.isArray(problems)) out.push(...problems);
  else if (problems && typeof problems === 'object') out.push(...Object.values(problems).filter(Boolean));
  const prefs = l.preferences || {};
  if (prefs.modality) out.push(`Modality: ${prefs.modality}`);
  if (prefs.insurance) out.push(`Insurance: ${prefs.insurance}`);
  return out.filter(Boolean).slice(0, 10);
});

const openListings = computed(() => listings.value.filter((l) => l.status === 'open' || l.status === 'requested'));
const closedListings = computed(() => listings.value.filter((l) => ['approved', 'withdrawn', 'closed'].includes(l.status)));
const myListings = computed(() =>
  listings.value.filter(
    (l) => Number(l.postedByUserId) === currentUserId.value || Number(l.currentProviderUserId) === currentUserId.value
  )
);
const pendingRequestCount = computed(() => openListings.value.reduce((s, l) => s + (l.pendingRequestCount || 0), 0));

const currentTabList = computed(() => {
  if (activeTab.value === 'open') return filteredOpen.value;
  if (activeTab.value === 'mine') return myListings.value;
  return closedListings.value;
});

const searchTokens = computed(() => String(searchQuery.value || '').toLowerCase().split(/\s+/).filter(Boolean));

function matchSearch(listing) {
  if (!searchTokens.value.length) return true;
  const hay = [
    listing.clientType,
    listing.notes,
    listing.currentProviderName,
    ...(listing.chips || [])
  ].filter(Boolean).join(' ').toLowerCase();
  return searchTokens.value.every((t) => hay.includes(t));
}

const filteredOpen = computed(() => openListings.value.filter(matchSearch));

function formatDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(v);
  }
}

function formatClientType(t) {
  if (t === 'clinical') return 'Office / Clinical';
  if (t === 'learning') return 'Learning';
  if (t === 'basic_nonclinical') return 'Coaching / Consulting';
  return t || '—';
}

function isCurrentProviderFor(listing) {
  return Number(listing.currentProviderUserId) === Number(currentUserId.value);
}

function canRequest(listing) {
  if (!['open', 'requested'].includes(listing.status)) return false;
  return !isCurrentProviderFor(listing);
}

function canWithdraw(listing) {
  if (!['open', 'requested'].includes(listing.status)) return false;
  return isBackoffice.value || Number(listing.postedByUserId) === currentUserId.value || isCurrentProviderFor(listing);
}

function selectListing(listing) {
  selectedListingId.value = listing.id;
  if (!requestsByListing.value[listing.id]) {
    onExpand(listing.id);
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
    // Do not auto-select; user clicks to open detail
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

async function submitRequest(listing) {
  const msg = requestMessages[listing.id] || '';
  try {
    await api.post(`/client-exchange/listings/${listing.id}/requests`, { message: msg });
    requestMessages[listing.id] = '';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to request listing';
  }
}

async function onWithdraw(listingId) {
  try {
    await api.post(`/client-exchange/listings/${listingId}/withdraw`);
    selectedListingId.value = null;
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
/* ── Root ──────────────────────────────────────────── */
.cep-root {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── Header ────────────────────────────────────────── */
.cep-page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}
.cep-title {
  font-size: 1.45rem;
  font-weight: 700;
  margin: 0 0 0.2rem;
}
.cep-subtitle {
  margin: 0;
  color: var(--text-secondary, #64748b);
  font-size: 0.85rem;
}
.cep-header-actions {
  display: flex;
  gap: 0.5rem;
}

/* ── Stats ─────────────────────────────────────────── */
.cep-stats {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.cep-stat {
  flex: 1 1 140px;
  background: var(--card-bg, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 0.85rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}
.cep-stat-icon {
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.cep-stat-icon--blue { background: #dbeafe; }
.cep-stat-icon--green { background: #dcfce7; }
.cep-stat-icon--purple { background: #ede9fe; }
.cep-stat-icon--amber { background: #fef9c3; }
.cep-stat-value {
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;
}
.cep-stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #64748b);
  margin-top: 0.15rem;
}

/* ── Toolbar ───────────────────────────────────────── */
.cep-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.cep-tabs {
  display: inline-flex;
  gap: 2px;
  background: var(--surface-muted, #f1f5f9);
  border-radius: 9px;
  padding: 4px;
  flex-shrink: 0;
}
.cep-tab {
  background: transparent;
  border: none;
  padding: 7px 15px;
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
  background: #2563eb1a;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 0 7px;
  font-size: 11px;
  font-weight: 800;
}
.cep-search-wrap {
  flex: 1 1 200px;
  position: relative;
  display: flex;
  align-items: center;
}
.cep-search-icon {
  position: absolute;
  left: 0.6rem;
  color: var(--text-secondary, #9ca3af);
  pointer-events: none;
}
.cep-search-input {
  width: 100%;
  padding: 0.4rem 1.8rem 0.4rem 2rem;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  font-size: 0.88rem;
  background: var(--card-bg, #fff);
}
.cep-search-input:focus {
  outline: 2px solid var(--primary, #2d6a4f);
  outline-offset: -1px;
  border-color: transparent;
}
.cep-search-clear {
  position: absolute;
  right: 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary, #9ca3af);
  font-size: 0.82rem;
}

/* ── Banner ────────────────────────────────────────── */
.cep-banner { border-radius: 8px; padding: 0.65rem 0.85rem; }
.cep-banner--warn { background: #fef9c3; color: #713f12; border: 1px solid #fde68a; }

/* ── Layout ────────────────────────────────────────── */
.cep-layout {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 14px;
  overflow: hidden;
  background: var(--card-bg, #fff);
}
.cep-layout--split {
  display: grid;
  grid-template-columns: 320px 1fr;
  min-height: 500px;
}
@media (max-width: 900px) {
  .cep-layout--split { grid-template-columns: 1fr; }
}

/* ── List column ───────────────────────────────────── */
.cep-list-col {
  border-right: 1px solid var(--border, #e5e7eb);
  overflow-y: auto;
  max-height: 76vh;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.cep-sub-heading {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary, #9ca3af);
  padding: 0.6rem 1rem 0.35rem;
  border-bottom: 1px solid var(--border, #f1f5f9);
}
.cep-empty {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary, #6b7280);
  font-size: 0.88rem;
}

/* ── Request rows (mine tab) ───────────────────────── */
.cep-request-list { padding: 0.5rem 0; }
.cep-request-row {
  padding: 0.65rem 1rem;
  border-bottom: 1px solid var(--border, #f1f5f9);
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.85rem;
  align-items: baseline;
  font-size: 0.85rem;
}
.cep-request-dates { color: var(--text-secondary, #6b7280); }
.cep-request-listing-status { color: var(--text-secondary, #6b7280); }
.cep-request-msg { width: 100%; color: var(--text, #374151); }

/* ── List column in split mode ─────────────────────── */
.cep-layout--split .cep-list-col {
  border-right: 1px solid var(--border, #e5e7eb);
}

/* ── Detail column ─────────────────────────────────── */
.cep-detail-col {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  max-height: 76vh;
}
.cep-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0.65rem 0.9rem;
  border-bottom: 1px solid var(--border, #e5e7eb);
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 2;
  gap: 0.5rem;
}
.cep-detail-header-left { flex: 1; min-width: 0; }
.cep-detail-id-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 0.2rem;
}
.cep-detail-code {
  color: var(--text-secondary, #6b7280);
  font-size: 0.78rem;
}
.cep-detail-posted {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-secondary, #9ca3af);
}
.cep-close-detail {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary, #9ca3af);
  font-size: 0.9rem;
  padding: 0.2rem 0.3rem;
  border-radius: 4px;
  flex-shrink: 0;
  line-height: 1;
}
.cep-close-detail:hover { background: #f3f4f6; color: #374151; }
.cep-detail-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--border, #f1f5f9);
}
.cep-chip {
  background: #f0fdf4;
  color: #14532d;
  border-radius: 999px;
  padding: 0.12rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 600;
}

/* ── Sections ──────────────────────────────────────── */
.cep-detail-section {
  padding: 0.65rem 0.9rem;
  border-bottom: 1px solid var(--border, #f1f5f9);
}
.cep-detail-section--actions {
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.cep-detail-section-title {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary, #94a3b8);
  margin-bottom: 0.4rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.cep-pending-badge {
  background: #fef3c7;
  color: #b45309;
  border-radius: 999px;
  padding: 0.1rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
}
.cep-muted { color: var(--text-secondary, #94a3b8); font-size: 0.85rem; }
.cep-detail-section p { margin: 0; font-size: 0.9rem; line-height: 1.55; }

/* ── Requests in detail panel ──────────────────────── */
.cep-requests-list { display: flex; flex-direction: column; gap: 0.5rem; }
.cep-request-item {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
}
.cep-request-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}
.cep-request-item-msg {
  font-size: 0.82rem;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 0.3rem;
}
.cep-request-item-actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.35rem;
}
.cep-request-textarea {
  width: 100%;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
  font-size: 0.88rem;
  resize: vertical;
  box-sizing: border-box;
  background: #fff;
}
.cep-detail-action-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

/* ── Status badges ─────────────────────────────────── */
.cep-status-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.15rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 700;
}
.cep-status-open { background: #dcfce7; color: #14532d; }
.cep-status-requested { background: #dbeafe; color: #1d4ed8; }
.cep-status-approved { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
.cep-status-withdrawn { background: #f3f4f6; color: #6b7280; }
.cep-status-closed { background: #f3f4f6; color: #6b7280; }
.cep-status-pending { background: #fef9c3; color: #92400e; }
.cep-status-denied { background: #fee2e2; color: #991b1b; }

/* ── Buttons ───────────────────────────────────────── */
.cep-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.12s;
}
.cep-btn--sm { padding: 0.3rem 0.65rem; font-size: 0.82rem; }
.cep-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cep-btn--primary {
  background: var(--primary, #2d6a4f);
  color: #fff;
  border-color: var(--primary, #2d6a4f);
}
.cep-btn--primary:not(:disabled):hover { filter: brightness(1.07); }
.cep-btn--ghost {
  background: transparent;
  color: var(--primary, #2d6a4f);
  border-color: var(--primary, #2d6a4f);
}
.cep-btn--ghost:not(:disabled):hover { background: #f0fdf4; }
</style>
