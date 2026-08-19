<template>
  <div class="mr-page">
    <header class="mr-header">
      <div>
        <h1>Materials Requests</h1>
        <p class="mr-sub">Track onboarding, collaborative year update, and provider fall-update materials. Check items off and issue carts, shirts, and bags from inventory.</p>
      </div>
      <div class="mr-header-actions">
        <select v-if="agencies.length > 1 && !fixedAgencyId" v-model="agencyId" class="mr-select" @change="load">
          <option v-for="a in agencies" :key="a.id" :value="Number(a.id)">{{ a.name }}</option>
        </select>
        <button type="button" class="mr-btn mr-btn--ghost" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="mr-error">{{ error }}</div>

    <section class="mr-metrics">
      <div class="mr-metric">
        <strong>{{ summary.totalGroups || 0 }}</strong>
        <span>Total schools / providers</span>
      </div>
      <div class="mr-metric">
        <strong>{{ summary.groupsWithRequests || 0 }}</strong>
        <span>With requests</span>
      </div>
      <div class="mr-metric">
        <strong>{{ summary.needingDelivery || 0 }}</strong>
        <span>Needing delivery</span>
      </div>
      <div class="mr-metric">
        <strong>{{ summary.paperPacketRequests || 0 }}</strong>
        <span>Paper packet requests</span>
      </div>
      <div class="mr-metric">
        <strong>{{ summary.trifoldRequests || 0 }}</strong>
        <span>Trifold requests</span>
      </div>
      <div class="mr-metric">
        <strong>{{ summary.pendingFollowUps || 0 }}</strong>
        <span>Assigned follow-ups</span>
      </div>
      <div class="mr-metric">
        <strong>{{ summary.cartRequests || 0 }}</strong>
        <span>Carts to issue</span>
      </div>
      <div class="mr-metric">
        <strong>{{ summary.shirtRequests || 0 }}</strong>
        <span>Shirts / polos</span>
      </div>
      <div class="mr-metric">
        <strong>{{ summary.businessCardRequests || 0 }}</strong>
        <span>Business cards</span>
      </div>
    </section>

    <div class="mr-filters">
      <input v-model="search" class="mr-search" type="search" placeholder="Search schools, providers, or contacts…" />
      <select v-model="sourceFilter" class="mr-select">
        <option value="all">All sources</option>
        <option value="school_onboarding">Onboarding</option>
        <option value="school_reinit">Collaborative update</option>
        <option value="provider_year_update">Provider fall update</option>
      </select>
      <select v-model="statusFilter" class="mr-select">
        <option value="all">All statuses</option>
        <option value="open">Open items</option>
        <option value="assigned">Assigned</option>
        <option value="fulfilled">Completed</option>
        <option value="delivery">Delivery needed</option>
        <option value="inventory">Inventory items</option>
      </select>
      <select v-model="kindFilter" class="mr-select">
        <option value="all">Schools &amp; providers</option>
        <option value="school">Schools</option>
        <option value="provider">Providers</option>
      </select>
    </div>

    <p class="mr-count">Showing {{ sortedFilteredGroups.length }} of {{ groups.length }}</p>

    <div class="mr-layout" :class="{ 'mr-layout--open': selected }">
      <div class="mr-table-wrap">
        <table class="mr-table">
          <thead>
            <tr>
              <th class="mr-th-sort" :class="{ 'mr-th-sort--active': sortBy === 'name' }" @click="setSort('name')">Name <span class="mr-sort-arrow">{{ sortIndicator('name') }}</span></th>
              <th class="mr-th-sort" :class="{ 'mr-th-sort--active': sortBy === 'source' }" @click="setSort('source')">Source <span class="mr-sort-arrow">{{ sortIndicator('source') }}</span></th>
              <th class="mr-th-sort" :class="{ 'mr-th-sort--active': sortBy === 'paper_packets' }" @click="setSort('paper_packets')">Paper packets <span class="mr-sort-arrow">{{ sortIndicator('paper_packets') }}</span></th>
              <th class="mr-th-sort" :class="{ 'mr-th-sort--active': sortBy === 'trifolds' }" @click="setSort('trifolds')">Trifolds <span class="mr-sort-arrow">{{ sortIndicator('trifolds') }}</span></th>
              <th class="mr-th-sort" :class="{ 'mr-th-sort--active': sortBy === 'business_cards' }" @click="setSort('business_cards')">Business cards <span class="mr-sort-arrow">{{ sortIndicator('business_cards') }}</span></th>
              <th class="mr-th-sort" :class="{ 'mr-th-sort--active': sortBy === 'delivery' }" @click="setSort('delivery')">Delivery <span class="mr-sort-arrow">{{ sortIndicator('delivery') }}</span></th>
              <th class="mr-th-sort" :class="{ 'mr-th-sort--active': sortBy === 'inventory' }" @click="setSort('inventory')">Inventory <span class="mr-sort-arrow">{{ sortIndicator('inventory') }}</span></th>
              <th class="mr-th-sort" :class="{ 'mr-th-sort--active': sortBy === 'notes' }" @click="setSort('notes')">Notes <span class="mr-sort-arrow">{{ sortIndicator('notes') }}</span></th>
              <th class="mr-th-sort" :class="{ 'mr-th-sort--active': sortBy === 'updated' }" @click="setSort('updated')">Updated <span class="mr-sort-arrow">{{ sortIndicator('updated') }}</span></th>
              <th class="mr-th-sort" :class="{ 'mr-th-sort--active': sortBy === 'followUp' }" @click="setSort('followUp')">Follow-up <span class="mr-sort-arrow">{{ sortIndicator('followUp') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!sortedFilteredGroups.length">
              <td colspan="10" class="mr-empty">No materials requests match these filters.</td>
            </tr>
            <tr
              v-for="g in sortedFilteredGroups"
              :key="g.key"
              class="mr-row"
              :class="{ 'is-active': selected?.key === g.key }"
              @click="selectGroup(g)"
            >
              <td>
                <div class="mr-name">{{ g.subjectName }}</div>
                <div class="mr-muted">{{ g.subjectKind === 'provider' ? 'Provider' : 'School' }}{{ g.contactName && g.contactName !== g.subjectName ? ` · ${g.contactName}` : '' }}</div>
              </td>
              <td>
                <span v-for="s in g.sources" :key="s" class="mr-chip">{{ s }}</span>
              </td>
              <td><span v-if="g.needPaperPackets" class="mr-yes">Yes</span><span v-else class="mr-dash">—</span></td>
              <td><span v-if="g.needTrifolds" class="mr-yes">Yes</span><span v-else class="mr-dash">—</span></td>
              <td><span v-if="g.needBusinessCards" class="mr-yes">Yes</span><span v-else class="mr-dash">—</span></td>
              <td><span v-if="g.deliveryNeeded" class="mr-yes">Yes</span><span v-else class="mr-dash">—</span></td>
              <td>
                <span v-if="inventoryPending(g)" class="mr-inv">{{ inventoryPending(g) }}</span>
                <span v-else class="mr-dash">—</span>
              </td>
              <td class="mr-notes">{{ g.notes || '—' }}</td>
              <td class="mr-muted">{{ formatDate(g.updatedAt) }}</td>
              <td>
                <span class="mr-pill" :class="'mr-pill--' + g.followUp">{{ followLabel(g.followUp) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <aside v-if="selected" class="mr-drawer">
        <div class="mr-drawer-head">
          <div>
            <h2>{{ selected.subjectName }}</h2>
            <p class="mr-muted">
              {{ selected.subjectKind === 'provider' ? 'Provider' : 'School' }}
              <template v-if="selected.contactEmail"> · {{ selected.contactEmail }}</template>
            </p>
          </div>
          <button type="button" class="mr-btn mr-btn--ghost" @click="selected = null">Close</button>
        </div>

        <div class="mr-drawer-section">
          <h3>Requested items</h3>
          <div
            v-for="item in selected.items"
            :key="item.itemKey + item.sourceId"
            class="mr-item"
            :class="{
              'mr-item--fulfilled': item.fulfillment.status === 'fulfilled',
              'mr-item--busy': busyKey === itemKey(item),
            }"
          >
            <button
              type="button"
              class="mr-check-btn"
              :class="{ 'mr-check-btn--done': item.fulfillment.status === 'fulfilled' }"
              :disabled="busyKey === itemKey(item)"
              :aria-pressed="item.fulfillment.status === 'fulfilled'"
              :aria-label="item.fulfillment.status === 'fulfilled' ? `${item.itemLabel} — handled` : `Mark ${item.itemLabel} as handled`"
              @click="toggleFulfill(item, item.fulfillment.status !== 'fulfilled')"
            >
              <span class="mr-check-btn__box" aria-hidden="true">
                <svg v-if="item.fulfillment.status === 'fulfilled'" class="mr-check-btn__icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </span>
              <span class="mr-check-btn__body">
                <span class="mr-check-btn__label">
                  <strong>{{ item.itemLabel }}</strong>
                  <span class="mr-chip">{{ item.sourceLabel }}</span>
                  <span v-if="item.inventoryBacked" class="mr-chip mr-chip--inv">Inventory</span>
                </span>
                <span v-if="item.fulfillment.status === 'fulfilled'" class="mr-handled-badge">Handled</span>
                <span v-else class="mr-check-btn__hint">Tap to mark handled</span>
              </span>
            </button>
            <p v-if="item.detail" class="mr-muted mr-item-detail">{{ item.detail }}</p>
            <div class="mr-item-actions">
              <select
                class="mr-select mr-select--sm"
                :value="item.fulfillment.assignedToUserId || ''"
                :disabled="item.fulfillment.status === 'fulfilled' || busyKey === itemKey(item)"
                @change="assignItem(item, $event.target.value)"
              >
                <option value="">Assign to…</option>
                <option v-for="u in assignees" :key="u.id" :value="u.id">{{ u.name }}</option>
              </select>
              <span v-if="item.fulfillment.status === 'fulfilled'" class="mr-pill mr-pill--complete">Done</span>
              <span v-else-if="item.fulfillment.assignedToName" class="mr-pill mr-pill--pending">{{ item.fulfillment.assignedToName }}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <div v-if="issueModal" class="mr-overlay" @click.self="issueModal = null">
      <div class="mr-modal">
        <h3>Issue from inventory</h3>
        <p class="mr-muted">
          {{ issueModal.item.itemLabel }} for {{ issueModal.item.subjectName }}.
          Issuing removes it from available stock.
        </p>
        <div v-if="inventoryLoading" class="mr-muted">Loading inventory…</div>
        <div v-else-if="!inventoryOptions.types?.length" class="mr-error">
          No matching gear types in inventory. Add a cart, shirt/polo, or canvas bag in Gear Inventory, or check the item off without issuing.
        </div>
        <template v-else>
          <label class="mr-label">
            Inventory type
            <select v-model="issueForm.gearItemTypeId" class="mr-select" @change="onTypeChange">
              <option v-for="t in inventoryOptions.types" :key="t.id" :value="t.id">{{ t.name }} ({{ t.trackingMode === 'UNIQUE_ASSET' ? 'unique' : 'sized' }})</option>
            </select>
          </label>
          <label v-if="selectedType?.trackingMode === 'UNIQUE_ASSET'" class="mr-label">
            Available unit
            <select v-model="issueForm.uniqueAssetId" class="mr-select">
              <option value="">Select…</option>
              <option v-for="a in selectedType.assets || []" :key="a.id" :value="a.id">{{ a.assetCode }}</option>
            </select>
          </label>
          <template v-if="selectedType?.trackingMode === 'SIZED_STOCK'">
            <label v-if="selectedType.isGendered" class="mr-label">
              Gender
              <select v-model="issueForm.gender" class="mr-select">
                <option value="">Select…</option>
                <option v-for="g in selectedType.genders || []" :key="g.value" :value="g.value">{{ g.label }}</option>
              </select>
            </label>
            <label class="mr-label">
              Size
              <select v-model="issueForm.sizeLabel" class="mr-select">
                <option value="">Select…</option>
                <option
                  v-for="s in sizedOptions"
                  :key="s.gender + s.sizeLabel"
                  :value="s.sizeLabel"
                >{{ s.displayLabel }} ({{ s.quantityOnHand }})</option>
              </select>
            </label>
          </template>
        </template>
        <div class="mr-modal-actions">
          <button type="button" class="mr-btn mr-btn--ghost" @click="issueModal = null">Cancel</button>
          <button
            v-if="!inventoryOptions.types?.length"
            type="button"
            class="mr-btn mr-btn--primary"
            :disabled="issuing"
            @click="fulfillWithoutStock"
          >
            Check off without inventory
          </button>
          <button
            v-else
            type="button"
            class="mr-btn mr-btn--primary"
            :disabled="issuing || !canIssue"
            @click="confirmIssue"
          >
            {{ issuing ? 'Issuing…' : 'Issue & check off' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
});

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const fixedAgencyId = computed(() => (props.agencyId ? Number(props.agencyId) : null));
const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');
const agencies = computed(() =>
  isSuperAdmin.value ? agencyStore.agencies || [] : agencyStore.userAgencies || agencyStore.agencies || []
);

const agencyId = ref(null);
const loading = ref(false);
const error = ref('');
const groups = ref([]);
const summary = ref({});
const assignees = ref([]);
const search = ref('');
const sourceFilter = ref('all');
const statusFilter = ref('all');
const kindFilter = ref('all');
const sortBy = ref('name');
const sortDir = ref('asc');
const selected = ref(null);
const busyKey = ref('');
const issueModal = ref(null);
const inventoryLoading = ref(false);
const inventoryOptions = ref({ types: [] });
const issueForm = ref({ gearItemTypeId: null, uniqueAssetId: '', sizeLabel: '', gender: '' });
const issuing = ref(false);

const selectedType = computed(() =>
  (inventoryOptions.value.types || []).find((t) => Number(t.id) === Number(issueForm.value.gearItemTypeId)) || null
);
const sizedOptions = computed(() => {
  const sizes = selectedType.value?.sizes || [];
  const g = issueForm.value.gender;
  if (selectedType.value?.isGendered && g) return sizes.filter((s) => s.gender === g);
  return sizes;
});
const canIssue = computed(() => {
  const t = selectedType.value;
  if (!t) return false;
  if (t.trackingMode === 'UNIQUE_ASSET') return !!issueForm.value.uniqueAssetId;
  return !!issueForm.value.sizeLabel;
});

function itemKey(item) {
  return `${item.sourceType}:${item.sourceId}:${item.itemKey}`;
}
function inventoryPending(g) {
  const keys = [];
  if (g.items.some((i) => i.itemKey === 'school_cart' && i.fulfillment.status !== 'fulfilled')) keys.push('Cart');
  if (g.items.some((i) => i.itemKey === 'shirt' && i.fulfillment.status !== 'fulfilled')) keys.push('Shirt');
  if (g.items.some((i) => i.itemKey === 'canvas_bag' && i.fulfillment.status !== 'fulfilled')) keys.push('Bag');
  return keys.join(', ');
}
function followLabel(v) {
  if (v === 'complete') return 'Complete';
  if (v === 'pending') return 'Assigned';
  if (v === 'in_progress') return 'In progress';
  return 'Open';
}
const FOLLOW_UP_RANK = { none: 0, in_progress: 1, pending: 2, complete: 3 };

function groupSources(g) {
  return (g.sources || []).join(', ');
}

function setSort(field) {
  if (sortBy.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = field;
    sortDir.value = (field === 'updated') ? 'desc' : 'asc';
  }
}

function sortIndicator(field) {
  if (sortBy.value !== field) return '↕';
  return sortDir.value === 'asc' ? '↑' : '↓';
}

function boolSort(a, b) {
  return Number(Boolean(a)) - Number(Boolean(b));
}

function formatDate(raw) {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

const filteredGroups = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (groups.value || []).filter((g) => {
    if (kindFilter.value !== 'all' && g.subjectKind !== kindFilter.value) return false;
    if (sourceFilter.value !== 'all' && !g.items.some((i) => i.sourceType === sourceFilter.value)) return false;
    if (statusFilter.value === 'open' && g.pendingCount === 0) return false;
    if (statusFilter.value === 'assigned' && g.followUp !== 'pending') return false;
    if (statusFilter.value === 'fulfilled' && g.pendingCount !== 0) return false;
    if (statusFilter.value === 'delivery' && !g.deliveryNeeded) return false;
    if (statusFilter.value === 'inventory' && !inventoryPending(g)) return false;
    if (q) {
      const itemHay = (g.items || []).map((i) => `${i.itemLabel} ${i.sourceLabel} ${i.detail || ''}`).join(' ');
      const hay = `${g.subjectName} ${g.contactName || ''} ${g.contactEmail || ''} ${g.notes || ''} ${groupSources(g)} ${itemHay}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
});

const sortedFilteredGroups = computed(() => {
  const d = sortDir.value === 'asc' ? 1 : -1;
  return [...filteredGroups.value].sort((a, b) => {
    switch (sortBy.value) {
      case 'name':
        return d * String(a.subjectName || '').localeCompare(String(b.subjectName || ''));
      case 'source':
        return d * groupSources(a).localeCompare(groupSources(b));
      case 'paper_packets':
        return d * boolSort(a.needPaperPackets, b.needPaperPackets);
      case 'trifolds':
        return d * boolSort(a.needTrifolds, b.needTrifolds);
      case 'business_cards':
        return d * boolSort(a.needBusinessCards, b.needBusinessCards);
      case 'delivery':
        return d * boolSort(a.deliveryNeeded, b.deliveryNeeded);
      case 'inventory':
        return d * String(inventoryPending(a) || '').localeCompare(String(inventoryPending(b) || ''));
      case 'notes':
        return d * String(a.notes || '').localeCompare(String(b.notes || ''));
      case 'updated': {
        const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return d * (da - db);
      }
      case 'followUp':
        return d * ((FOLLOW_UP_RANK[a.followUp] ?? 0) - (FOLLOW_UP_RANK[b.followUp] ?? 0));
      default:
        return 0;
    }
  });
});

function resolveAgency() {
  if (fixedAgencyId.value) return fixedAgencyId.value;
  const fromStore = Number(agencyStore.currentAgency?.id || agencies.value[0]?.id || 0);
  return fromStore || null;
}

async function load() {
  const aid = Number(agencyId.value || resolveAgency());
  if (!aid) return;
  agencyId.value = aid;
  loading.value = true;
  error.value = '';
  try {
    const [board, people] = await Promise.all([
      api.get(`/materials-requests/${aid}`),
      api.get(`/materials-requests/${aid}/assignees`),
    ]);
    groups.value = board.data?.groups || [];
    summary.value = board.data?.summary || {};
    assignees.value = people.data?.users || [];
    if (selected.value) {
      selected.value = groups.value.find((g) => g.key === selected.value.key) || null;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load materials requests';
  } finally {
    loading.value = false;
  }
}

function selectGroup(g) {
  selected.value = g;
}

async function assignItem(item, userId) {
  busyKey.value = itemKey(item);
  error.value = '';
  try {
    await api.post(`/materials-requests/${agencyId.value}/items/assign`, {
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      itemKey: item.itemKey,
      assignedToUserId: userId ? Number(userId) : null,
    });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Assign failed';
  } finally {
    busyKey.value = '';
  }
}

async function toggleFulfill(item, checked) {
  if (!checked) {
    if (item.fulfillment.gearAssignmentId) {
      error.value = 'Return issued gear in Gear Inventory before unchecking this item.';
      await load();
      return;
    }
    busyKey.value = itemKey(item);
    try {
      await api.post(`/materials-requests/${agencyId.value}/items/reopen`, {
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        itemKey: item.itemKey,
      });
      await load();
    } catch (e) {
      error.value = e.response?.data?.error?.message || e.message || 'Could not reopen';
    } finally {
      busyKey.value = '';
    }
    return;
  }

  if (item.inventoryBacked) {
    issueModal.value = { item };
    issueForm.value = { gearItemTypeId: null, uniqueAssetId: '', sizeLabel: '', gender: '' };
    inventoryOptions.value = { types: [] };
    inventoryLoading.value = true;
    try {
      const r = await api.get(`/materials-requests/${agencyId.value}/inventory-options`, {
        params: { itemKey: item.itemKey },
      });
      inventoryOptions.value = r.data || { types: [] };
      const first = inventoryOptions.value.types?.[0];
      if (first) issueForm.value.gearItemTypeId = first.id;
    } catch (e) {
      error.value = e.response?.data?.error?.message || e.message || 'Could not load inventory';
      issueModal.value = null;
    } finally {
      inventoryLoading.value = false;
    }
    return;
  }

  await fulfillPlain(item);
}

async function fulfillPlain(item, extra = {}) {
  busyKey.value = itemKey(item);
  error.value = '';
  try {
    await api.post(`/materials-requests/${agencyId.value}/items/fulfill`, {
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      itemKey: item.itemKey,
      issueToUserId: item.userId || extra.issueToUserId || null,
      ...extra,
    });
    issueModal.value = null;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not check off';
  } finally {
    busyKey.value = '';
    issuing.value = false;
  }
}

function onTypeChange() {
  issueForm.value.uniqueAssetId = '';
  issueForm.value.sizeLabel = '';
}

async function confirmIssue() {
  const item = issueModal.value?.item;
  if (!item || !canIssue.value) return;
  issuing.value = true;
  await fulfillPlain(item, {
    gearItemTypeId: Number(issueForm.value.gearItemTypeId),
    uniqueAssetId: issueForm.value.uniqueAssetId ? Number(issueForm.value.uniqueAssetId) : null,
    sizeLabel: issueForm.value.sizeLabel || null,
    gender: issueForm.value.gender || '',
    issueToUserId: item.userId,
  });
}

async function fulfillWithoutStock() {
  const item = issueModal.value?.item;
  if (!item) return;
  issuing.value = true;
  try {
    await api.post(`/materials-requests/${agencyId.value}/items/fulfill`, {
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      itemKey: item.itemKey,
      issueToUserId: item.userId,
      skipInventory: true,
      notes: 'Checked off without inventory issue',
    });
    issueModal.value = null;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Check-off failed — inventory items need a stock type unless you add one in Gear Inventory.';
  } finally {
    issuing.value = false;
  }
}

watch(
  () => props.agencyId,
  (id) => {
    if (id) {
      agencyId.value = Number(id);
      load();
    }
  }
);

onMounted(async () => {
  if (!agencyStore.agencies?.length && agencyStore.fetchAgencies) {
    try { await agencyStore.fetchAgencies(); } catch { /* ignore */ }
  }
  agencyId.value = resolveAgency();
  if (agencyId.value) await load();
});
</script>

<style scoped>
.mr-page { padding: 0 0 2rem; }
.mr-header { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.mr-header h1 { margin: 0 0 0.25rem; font-size: 1.6rem; }
.mr-sub { margin: 0; color: #64748b; max-width: 42rem; font-size: 0.9rem; }
.mr-header-actions { display: flex; gap: 0.5rem; align-items: center; }
.mr-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.65rem; margin-bottom: 1rem; }
.mr-metric { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.75rem 0.9rem; }
.mr-metric strong { display: block; font-size: 1.35rem; }
.mr-metric span { font-size: 0.75rem; color: #64748b; }
.mr-filters { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; }
.mr-search { flex: 1; min-width: 220px; padding: 0.45rem 0.7rem; border: 1px solid #cbd5e1; border-radius: 8px; }
.mr-select { padding: 0.4rem 0.6rem; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; }
.mr-select--sm { font-size: 0.8rem; }
.mr-count { font-size: 0.8rem; color: #64748b; margin: 0 0 0.5rem; }
.mr-layout { display: grid; grid-template-columns: 1fr; gap: 1rem; }
.mr-layout--open { grid-template-columns: 1fr minmax(280px, 360px); }
.mr-table-wrap { overflow-x: auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; }
.mr-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.mr-table th { text-align: left; padding: 0.65rem 0.75rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; border-bottom: 1px solid #e2e8f0; }
.mr-th-sort { cursor: pointer; user-select: none; white-space: nowrap; }
.mr-th-sort:hover { color: #334155; background: #f8fafc; }
.mr-th-sort--active { color: #15803d; }
.mr-sort-arrow { font-size: 0.65rem; margin-left: 0.15rem; opacity: 0.7; }
.mr-th-sort--active .mr-sort-arrow { opacity: 1; }
.mr-table td { padding: 0.7rem 0.75rem; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.mr-row { cursor: pointer; }
.mr-row:hover, .mr-row.is-active { background: #f8fafc; }
.mr-name { font-weight: 600; }
.mr-muted { color: #64748b; font-size: 0.8rem; }
.mr-notes { max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mr-yes { color: #15803d; font-weight: 700; }
.mr-dash { color: #cbd5e1; }
.mr-inv { font-size: 0.78rem; color: #9a3412; font-weight: 600; }
.mr-chip { display: inline-block; font-size: 0.7rem; background: #f1f5f9; color: #334155; border-radius: 999px; padding: 0.1rem 0.45rem; margin: 0 0.2rem 0.15rem 0; }
.mr-chip--inv { background: #ffedd5; color: #9a3412; }
.mr-pill { display: inline-block; font-size: 0.72rem; font-weight: 700; border-radius: 999px; padding: 0.15rem 0.5rem; }
.mr-pill--complete { background: #dcfce7; color: #166534; }
.mr-pill--pending { background: #ffedd5; color: #9a3412; }
.mr-pill--in_progress { background: #e0f2fe; color: #075985; }
.mr-pill--none { background: #f1f5f9; color: #64748b; }
.mr-empty { text-align: center; color: #64748b; padding: 2rem !important; }
.mr-error { background: #fef2f2; color: #991b1b; padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; }
.mr-drawer { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; max-height: 80vh; overflow-y: auto; }
.mr-drawer-head { display: flex; justify-content: space-between; gap: 0.75rem; margin-bottom: 1rem; }
.mr-drawer-head h2 { margin: 0; font-size: 1.1rem; }
.mr-drawer-section h3 { margin: 0 0 0.75rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
.mr-item { border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.7rem 0.8rem; margin-bottom: 0.55rem; transition: border-color 0.15s, background 0.15s; }
.mr-item--fulfilled { border-color: #86efac; background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); }
.mr-item--busy { opacity: 0.7; pointer-events: none; }
.mr-check-btn { display: flex; gap: 0.75rem; align-items: flex-start; width: 100%; padding: 0; border: none; background: transparent; text-align: left; cursor: pointer; }
.mr-check-btn:disabled { cursor: not-allowed; }
.mr-check-btn__box { flex-shrink: 0; width: 2rem; height: 2rem; border: 2.5px solid #94a3b8; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: #fff; transition: all 0.15s; margin-top: 0.05rem; }
.mr-check-btn:hover .mr-check-btn__box { border-color: #15803d; box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15); }
.mr-check-btn--done .mr-check-btn__box { background: #15803d; border-color: #15803d; box-shadow: 0 2px 8px rgba(21, 128, 61, 0.35); }
.mr-check-btn__icon { width: 1.25rem; height: 1.25rem; color: #fff; }
.mr-check-btn__body { flex: 1; min-width: 0; }
.mr-check-btn__label { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; }
.mr-check-btn--done .mr-check-btn__label strong { text-decoration: line-through; color: #166534; }
.mr-check-btn__hint { display: block; font-size: 0.72rem; color: #94a3b8; margin-top: 0.2rem; }
.mr-handled-badge { display: inline-block; margin-top: 0.3rem; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #fff; background: #15803d; border-radius: 999px; padding: 0.2rem 0.55rem; }
.mr-item-detail { margin: 0.35rem 0 0 2.75rem; }
.mr-item-actions { display: flex; gap: 0.5rem; align-items: center; margin: 0.5rem 0 0 2.75rem; }
.mr-btn { border: 1px solid transparent; border-radius: 8px; padding: 0.4rem 0.75rem; cursor: pointer; font-size: 0.85rem; }
.mr-btn--primary { background: #15803d; color: #fff; }
.mr-btn--ghost { background: #fff; border-color: #cbd5e1; color: #334155; }
.mr-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.mr-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 80; }
.mr-modal { background: #fff; border-radius: 12px; padding: 1.25rem; width: min(440px, 94vw); }
.mr-modal h3 { margin: 0 0 0.35rem; }
.mr-label { display: block; font-size: 0.8rem; font-weight: 600; margin: 0.75rem 0; }
.mr-label .mr-select { display: block; width: 100%; margin-top: 0.3rem; }
.mr-modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
@media (max-width: 960px) {
  .mr-layout--open { grid-template-columns: 1fr; }
}
</style>
