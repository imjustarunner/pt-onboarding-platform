<template>
  <div class="gem-page">
    <header class="gem-header">
      <div>
        <h1 class="gem-title">Gear, Equipment &amp; Materials</h1>
        <p class="gem-sub">
          Track stock, issued items, sent materials, and reorders across all agencies.
        </p>
      </div>
      <button type="button" class="btn btn-primary" @click="openCreate">+ Add Item</button>
    </header>

    <div v-if="loading && !items.length" class="gem-empty">Loading catalog…</div>
    <div v-else-if="error" class="gem-error">{{ error }}</div>

    <template v-else>
      <section class="gem-summary">
        <div class="gem-stat">
          <div class="gem-stat-value">{{ summary.totalItemTypes }}</div>
          <div class="gem-stat-label">Total Item Types</div>
          <div class="gem-stat-hint">Across all categories</div>
        </div>
        <div class="gem-stat">
          <div class="gem-stat-value">{{ formatNum(summary.totalInventory) }}</div>
          <div class="gem-stat-label">Total Inventory</div>
          <div class="gem-stat-hint">Across all agencies</div>
        </div>
        <div class="gem-stat">
          <div class="gem-stat-value">{{ formatNum(summary.issuedSent30d) }}</div>
          <div class="gem-stat-label">Issued / Sent</div>
          <div class="gem-stat-hint">Last 30 days</div>
        </div>
        <div class="gem-stat" :class="{ 'gem-stat--warn': summary.lowStock > 0 }">
          <div class="gem-stat-value">{{ summary.lowStock }}</div>
          <div class="gem-stat-label">Low Stock</div>
          <div class="gem-stat-hint">Reorder suggested</div>
        </div>
        <div class="gem-stat">
          <div class="gem-stat-value">{{ summary.agenciesManaged }}</div>
          <div class="gem-stat-label">Agencies Managed</div>
          <div class="gem-stat-hint">Tenant agencies</div>
        </div>
      </section>

      <div class="gem-filters">
        <select v-model="filters.agencyId" class="gem-select" @change="reload">
          <option value="">All Agencies</option>
          <option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
        </select>
        <select v-model="filters.category" class="gem-select" @change="reload">
          <option value="all">All Types</option>
          <option v-for="c in categoryOptions" :key="c" :value="c">{{ labelCat(c) }}</option>
        </select>
        <select v-model="filters.status" class="gem-select" @change="reload">
          <option value="all">All Statuses</option>
          <option value="healthy">Healthy</option>
          <option value="low">Low</option>
          <option value="reorder">Reorder</option>
        </select>
        <select v-model="filters.sort" class="gem-select" @change="reload">
          <option value="type">Sort by Type</option>
          <option value="agency">Sort by Agency count</option>
          <option value="status">Sort by Status</option>
        </select>
        <input
          v-model="filters.search"
          class="gem-search"
          type="search"
          placeholder="Search items…"
          @keydown.enter="reload"
        />
        <button type="button" class="btn btn-secondary btn-sm" @click="reload">Search</button>
      </div>

      <div class="gem-tabs">
        <button
          v-for="tab in categoryTabs"
          :key="tab.id"
          type="button"
          class="gem-tab"
          :class="{ on: filters.category === tab.id }"
          @click="filters.category = tab.id; reload()"
        >{{ tab.label }}</button>
      </div>

      <div class="gem-main">
        <div class="gem-table-wrap">
          <table class="gem-table">
            <thead>
              <tr>
                <th></th>
                <th>Item Type</th>
                <th>Category</th>
                <th>Agencies</th>
                <th>Stock Mode</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in items"
                :key="item.id"
                :class="{ selected: selectedId === item.id }"
                @click="selectItem(item.id)"
              >
                <td>
                  <div class="gem-thumb">
                    <img v-if="item.primaryImage?.url" :src="item.primaryImage.url" :alt="item.name" />
                    <span v-else class="gem-thumb-ph">{{ initials(item.name) }}</span>
                  </div>
                </td>
                <td class="gem-strong">{{ item.name }}</td>
                <td><span class="gem-pill" :class="`cat-${item.category}`">{{ labelCat(item.category) }}</span></td>
                <td>{{ item.agencyCount }} {{ item.agencyCount === 1 ? 'agency' : 'agencies' }}</td>
                <td>{{ item.stockModeLabel }}</td>
                <td>
                  <span v-if="item.ownerDisplay?.name">{{ item.ownerDisplay.name }}</span>
                  <span v-else class="muted">Unassigned</span>
                </td>
                <td>
                  <span class="gem-status" :class="item.status">{{ statusLabel(item.status) }}</span>
                </td>
                <td>{{ item.availableDisplay }}</td>
              </tr>
              <tr v-if="!items.length">
                <td colspan="8" class="gem-empty-row">No catalog items yet. Add an item to get started.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside v-if="detail" class="gem-detail">
          <div class="gem-detail-head">
            <h2>{{ detail.name }}</h2>
            <button type="button" class="gem-close" @click="selectedId = null; detail = null">×</button>
          </div>
          <div class="gem-detail-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="openEdit(detail)">Edit</button>
            <button type="button" class="btn btn-secondary btn-sm" @click="showSend = true">Send</button>
            <button type="button" class="btn btn-secondary btn-sm" @click="markLowSelected">Mark Low</button>
            <button type="button" class="btn btn-primary btn-sm" @click="reorderSelected">Reorder</button>
          </div>

          <div class="gem-photos">
            <div class="gem-photo-main">
              <img v-if="activePhoto" :src="activePhoto.url" :alt="detail.name" />
              <div v-else class="gem-photo-empty">No photo</div>
            </div>
            <div class="gem-photo-thumbs">
              <button
                v-for="img in detail.images || []"
                :key="img.id"
                type="button"
                class="gem-photo-thumb"
                :class="{ on: activePhotoId === img.id }"
                @click="activePhotoId = img.id"
              >
                <img :src="img.url" alt="" />
              </button>
              <label class="gem-photo-add">
                +
                <input type="file" accept="image/*" hidden @change="onUploadPhoto" />
              </label>
            </div>
          </div>

          <dl class="gem-meta">
            <div><dt>Category</dt><dd>{{ labelCat(detail.category) }}</dd></div>
            <div><dt>Item Type</dt><dd>{{ detail.name }}</dd></div>
            <div><dt>Description</dt><dd>{{ detail.description || '—' }}</dd></div>
            <div><dt>SKU</dt><dd>{{ detail.sku || '—' }}</dd></div>
            <div><dt>Unit</dt><dd>{{ detail.unit || 'Each' }}</dd></div>
            <div><dt>Stock mode</dt><dd>{{ detail.stockModeLabel }}</dd></div>
          </dl>

          <h3>Responsible by Agency</h3>
          <div class="gem-agency-table">
            <div v-for="ag in detail.agencies" :key="ag.agencyId" class="gem-agency-row">
              <div class="gem-agency-name">{{ ag.agencyName }}</div>
              <select
                class="gem-select gem-select--sm"
                :value="ag.responsibleUserId || ''"
                @change="onAssignOwner(ag.agencyId, $event.target.value)"
              >
                <option value="">Select person…</option>
                <option
                  v-for="u in usersByAgency[ag.agencyId] || []"
                  :key="u.id"
                  :value="u.id"
                >{{ u.name }}</option>
              </select>
              <div class="gem-agency-contact muted">
                <span v-if="ag.owner?.email">{{ ag.owner.email }}</span>
                <span v-if="ag.owner?.phone"> · {{ ag.owner.phone }}</span>
              </div>
              <span class="gem-status" :class="ag.status">{{ statusLabel(ag.status) }}</span>
            </div>
          </div>

          <h3>Low Stock Rules</h3>
          <p class="gem-hint">
            Automatic threshold: {{ detail.defaultLowStockThreshold }} units.
            Manual low stock {{ detail.allowManualLow ? 'allowed' : 'disabled' }} for materials that aren’t counted.
          </p>
          <p class="gem-hint">
            Alerts send from <strong>notifications@agency</strong> with reply-to <strong>materials@agency</strong>,
            routed to the responsible person for that agency.
          </p>

          <h3>Recent Activity</h3>
          <ul class="gem-activity">
            <li v-for="a in detail.recentActivity || []" :key="a.id">
              <strong>{{ a.movementType }}</strong>
              <span class="muted"> · {{ a.agencyName }} · {{ fmtWhen(a.createdAt) }}</span>
              <div v-if="a.reason" class="muted">{{ a.reason }}</div>
            </li>
            <li v-if="!(detail.recentActivity || []).length" class="muted">No recent activity.</li>
          </ul>
        </aside>
      </div>

      <section class="gem-activity-section">
        <h2>Issued / Sent Activity</h2>
        <table class="gem-table gem-table--activity">
          <thead>
            <tr>
              <th>Date</th>
              <th>Item</th>
              <th>Type</th>
              <th>Sent To / Event</th>
              <th>Agency</th>
              <th>Qty</th>
              <th>Sent By</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in activity" :key="row.id">
              <td>{{ fmtWhen(row.date) }}</td>
              <td>
                <div class="gem-item-cell">
                  <div class="gem-thumb gem-thumb--sm">
                    <img v-if="row.imageUrl" :src="row.imageUrl" alt="" />
                    <span v-else class="gem-thumb-ph">{{ initials(row.itemName) }}</span>
                  </div>
                  {{ row.itemName }}
                </div>
              </td>
              <td><span class="gem-pill">{{ row.typeLabel }}</span></td>
              <td>{{ row.sentTo || '—' }}</td>
              <td>{{ row.agencyName }}</td>
              <td>{{ row.quantity ?? '—' }}</td>
              <td>{{ row.sentBy || '—' }}</td>
            </tr>
            <tr v-if="!activity.length">
              <td colspan="7" class="gem-empty-row">No issued/sent activity yet.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>

    <!-- Create / Edit modal -->
    <div v-if="showForm" class="gem-modal-backdrop" @click.self="showForm = false">
      <div class="gem-modal">
        <h3>{{ editingId ? 'Edit Item' : 'Add Item' }}</h3>
        <div v-if="modalError" class="gem-error">{{ modalError }}</div>
        <label>Name<input v-model="form.name" type="text" /></label>
        <label>Category
          <select v-model="form.category">
            <option v-for="c in categoryOptions" :key="c" :value="c">{{ labelCat(c) }}</option>
          </select>
        </label>
        <label>Stock mode
          <select v-model="form.stockMode">
            <option value="COUNTED">Counted</option>
            <option value="MANUAL_LOW">Manual Low (materials)</option>
          </select>
        </label>
        <label v-if="form.stockMode === 'COUNTED'">Tracking
          <select v-model="form.trackingMode">
            <option value="SIZED_STOCK">Sized stock</option>
            <option value="UNIQUE_ASSET">Unique asset</option>
          </select>
        </label>
        <label>Description<textarea v-model="form.description" rows="2" /></label>
        <label>SKU<input v-model="form.sku" type="text" /></label>
        <label>Unit<input v-model="form.unit" type="text" /></label>
        <label>Default low threshold
          <input v-model.number="form.defaultLowStockThreshold" type="number" min="0" />
        </label>
        <label v-if="form.stockMode === 'COUNTED' && form.trackingMode === 'SIZED_STOCK'">
          Sizes (comma-separated)
          <input v-model="form.sizeOptionsText" type="text" />
        </label>
        <fieldset class="gem-agencies-pick">
          <legend>Enroll agencies</legend>
          <label v-for="a in agencies" :key="a.id" class="gem-check">
            <input v-model="form.agencyIds" type="checkbox" :value="a.id" />
            {{ a.name }}
          </label>
        </fieldset>
        <div class="gem-modal-actions">
          <button type="button" class="btn btn-secondary" @click="showForm = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="saveForm">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Send modal -->
    <div v-if="showSend && detail" class="gem-modal-backdrop" @click.self="showSend = false">
      <div class="gem-modal">
        <h3>Send / Issue — {{ detail.name }}</h3>
        <div v-if="modalError" class="gem-error">{{ modalError }}</div>
        <label>Agency
          <select v-model="sendForm.agencyId">
            <option v-for="ag in detail.agencies" :key="ag.agencyId" :value="ag.agencyId">{{ ag.agencyName }}</option>
          </select>
        </label>
        <label>Activity type
          <select v-model="sendForm.activityType">
            <option value="sent_to_event">Sent to Event</option>
            <option value="issued_to_person">Issued to Person</option>
          </select>
        </label>
        <label>Destination / Event<input v-model="sendForm.destinationLabel" type="text" /></label>
        <label>Quantity<input v-model.number="sendForm.quantity" type="number" min="1" /></label>
        <div class="gem-modal-actions">
          <button type="button" class="btn btn-secondary" @click="showSend = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="doSend">Send</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';

const categoryOptions = ['gear', 'equipment', 'materials', 'promotional', 'outreach'];
const categoryTabs = [
  { id: 'all', label: 'All' },
  { id: 'gear', label: 'Gear' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'materials', label: 'Materials' },
  { id: 'promotional', label: 'Promotional' },
  { id: 'outreach', label: 'Outreach' },
];

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const modalError = ref('');
const summary = ref({
  totalItemTypes: 0,
  totalInventory: 0,
  issuedSent30d: 0,
  lowStock: 0,
  agenciesManaged: 0,
});
const items = ref([]);
const activity = ref([]);
const agencies = ref([]);
const selectedId = ref(null);
const detail = ref(null);
const usersByAgency = reactive({});
const activePhotoId = ref(null);
const showForm = ref(false);
const showSend = ref(false);
const editingId = ref(null);

const filters = reactive({
  agencyId: '',
  category: 'all',
  status: 'all',
  sort: 'type',
  search: '',
});

const form = reactive({
  name: '',
  category: 'gear',
  stockMode: 'COUNTED',
  trackingMode: 'SIZED_STOCK',
  description: '',
  sku: '',
  unit: 'Each',
  defaultLowStockThreshold: 2,
  sizeOptionsText: 'XS, S, M, L, XL',
  agencyIds: [],
});

const sendForm = reactive({
  agencyId: null,
  activityType: 'sent_to_event',
  destinationLabel: '',
  quantity: 1,
});

const activePhoto = computed(() => {
  const imgs = detail.value?.images || [];
  if (!imgs.length) return null;
  return imgs.find((i) => i.id === activePhotoId.value) || imgs[0];
});

function labelCat(c) {
  const map = {
    gear: 'Gear',
    equipment: 'Equipment',
    materials: 'Materials',
    promotional: 'Promotional',
    outreach: 'Outreach',
  };
  return map[c] || c;
}

function statusLabel(s) {
  if (s === 'reorder') return 'Reorder';
  if (s === 'low') return 'Low';
  return 'Healthy';
}

function formatNum(n) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v.toLocaleString() : '0';
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

function fmtWhen(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return String(d);
  }
}

function catalogParams() {
  const params = { sort: filters.sort };
  if (filters.agencyId) params.agencyId = filters.agencyId;
  if (filters.category && filters.category !== 'all') params.category = filters.category;
  if (filters.status && filters.status !== 'all') params.status = filters.status;
  if (filters.search.trim()) params.search = filters.search.trim();
  return params;
}

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    const [sumRes, listRes, actRes, agRes] = await Promise.all([
      api.get('/gear-inventory/catalog/summary'),
      api.get('/gear-inventory/catalog', { params: catalogParams() }),
      api.get('/gear-inventory/catalog/activity', { params: { limit: 60 } }),
      api.get('/gear-inventory/catalog/agencies'),
    ]);
    summary.value = sumRes.data || summary.value;
    items.value = Array.isArray(listRes.data) ? listRes.data : [];
    activity.value = Array.isArray(actRes.data) ? actRes.data : [];
    agencies.value = Array.isArray(agRes.data) ? agRes.data : [];
    if (selectedId.value) {
      const still = items.value.find((i) => i.id === selectedId.value);
      if (still) await selectItem(selectedId.value);
      else {
        selectedId.value = null;
        detail.value = null;
      }
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to load catalog';
  } finally {
    loading.value = false;
  }
}

async function loadAgencyUsers(agencyId) {
  if (!agencyId || usersByAgency[agencyId]) return;
  try {
    const res = await api.get(`/gear-inventory/catalog/agencies/${agencyId}/users`);
    usersByAgency[agencyId] = Array.isArray(res.data) ? res.data : [];
  } catch {
    usersByAgency[agencyId] = [];
  }
}

async function selectItem(id) {
  selectedId.value = id;
  try {
    const res = await api.get(`/gear-inventory/catalog/${id}`);
    detail.value = res.data;
    activePhotoId.value = detail.value?.primaryImage?.id || detail.value?.images?.[0]?.id || null;
    sendForm.agencyId = detail.value?.agencies?.[0]?.agencyId || null;
    for (const ag of detail.value?.agencies || []) {
      await loadAgencyUsers(ag.agencyId);
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load item';
  }
}

function openCreate() {
  editingId.value = null;
  modalError.value = '';
  Object.assign(form, {
    name: '',
    category: 'materials',
    stockMode: 'MANUAL_LOW',
    trackingMode: 'NONE',
    description: '',
    sku: '',
    unit: 'Each',
    defaultLowStockThreshold: 2,
    sizeOptionsText: 'XS, S, M, L, XL',
    agencyIds: agencies.value.map((a) => a.id),
  });
  showForm.value = true;
}

function openEdit(item) {
  editingId.value = item.id;
  modalError.value = '';
  Object.assign(form, {
    name: item.name,
    category: item.category,
    stockMode: item.stockMode,
    trackingMode: item.trackingMode === 'NONE' ? 'SIZED_STOCK' : item.trackingMode,
    description: item.description || '',
    sku: item.sku || '',
    unit: item.unit || 'Each',
    defaultLowStockThreshold: item.defaultLowStockThreshold ?? 2,
    sizeOptionsText: (item.sizeOptions || []).join(', ') || 'XS, S, M, L, XL',
    agencyIds: (item.agencies || []).map((a) => a.agencyId),
  });
  showForm.value = true;
}

watch(
  () => form.category,
  (cat) => {
    if (['materials', 'promotional', 'outreach'].includes(cat) && !editingId.value) {
      form.stockMode = 'MANUAL_LOW';
    }
  }
);

async function saveForm() {
  saving.value = true;
  modalError.value = '';
  try {
    const sizeOptions = String(form.sizeOptionsText || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      name: form.name,
      category: form.category,
      stockMode: form.stockMode,
      trackingMode: form.stockMode === 'MANUAL_LOW' ? 'NONE' : form.trackingMode,
      description: form.description,
      sku: form.sku,
      unit: form.unit,
      defaultLowStockThreshold: form.defaultLowStockThreshold,
      sizeOptions,
      agencyIds: form.agencyIds,
      allowManualLow: true,
    };
    let id = editingId.value;
    if (editingId.value) {
      await api.patch(`/gear-inventory/catalog/${editingId.value}`, payload);
      await api.put(`/gear-inventory/catalog/${editingId.value}/agencies`, {
        agencies: form.agencyIds.map((agencyId) => ({
          agencyId,
          isActive: true,
          responsibleUserId:
            detail.value?.agencies?.find((a) => a.agencyId === agencyId)?.responsibleUserId || null,
          manualIsLow: detail.value?.agencies?.find((a) => a.agencyId === agencyId)?.manualIsLow || false,
          lowStockThreshold: null,
        })),
      });
    } else {
      const res = await api.post('/gear-inventory/catalog', payload);
      id = res.data?.id;
    }
    showForm.value = false;
    await reload();
    if (id) await selectItem(id);
  } catch (e) {
    modalError.value = e?.response?.data?.error?.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function onAssignOwner(agencyId, userId) {
  if (!detail.value) return;
  try {
    const agenciesPayload = detail.value.agencies.map((ag) => ({
      agencyId: ag.agencyId,
      responsibleUserId: ag.agencyId === agencyId ? (userId ? Number(userId) : null) : ag.responsibleUserId,
      manualIsLow: ag.manualIsLow,
      lowStockThreshold: ag.lowStockThreshold,
      isActive: true,
    }));
    await api.put(`/gear-inventory/catalog/${detail.value.id}/agencies`, { agencies: agenciesPayload });
    await selectItem(detail.value.id);
    await reload();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to assign owner';
  }
}

async function markLowSelected() {
  if (!detail.value?.agencies?.length) return;
  const choices = detail.value.agencies.map((a) => a.agencyName).join(', ');
  const pick = window.prompt(`Mark low for which agency?\n${choices}\n\nEnter agency name (or leave blank for first):`, detail.value.agencies[0].agencyName);
  if (pick === null) return;
  const ag =
    detail.value.agencies.find((a) => a.agencyName.toLowerCase() === String(pick).trim().toLowerCase())
    || detail.value.agencies[0];
  try {
    await api.post(`/gear-inventory/catalog/${detail.value.id}/mark-low`, {
      agencyId: ag.agencyId,
      low: true,
      reason: 'Manually marked low from console',
    });
    await selectItem(detail.value.id);
    await reload();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Mark low failed';
  }
}

async function reorderSelected() {
  if (!detail.value?.agencies?.length) return;
  const lowOnes = detail.value.agencies.filter((a) => a.status === 'low' || a.status === 'reorder' || a.manualIsLow);
  const targets = lowOnes.length ? lowOnes : detail.value.agencies;
  try {
    for (const ag of targets) {
      await api.post(`/gear-inventory/catalog/${detail.value.id}/mark-low`, {
        agencyId: ag.agencyId,
        low: true,
        reason: 'Reorder requested from console',
      });
    }
    await selectItem(detail.value.id);
    await reload();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Reorder alert failed';
  }
}

async function onUploadPhoto(ev) {
  const file = ev.target?.files?.[0];
  if (!file || !detail.value) return;
  const fd = new FormData();
  fd.append('image', file);
  fd.append('isPrimary', detail.value.images?.length ? '0' : '1');
  try {
    await api.post(`/gear-inventory/catalog/${detail.value.id}/images`, fd);
    await selectItem(detail.value.id);
    await reload();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Photo upload failed';
  } finally {
    ev.target.value = '';
  }
}

async function doSend() {
  if (!detail.value) return;
  saving.value = true;
  modalError.value = '';
  try {
    await api.post(`/gear-inventory/catalog/${detail.value.id}/send`, {
      agencyId: sendForm.agencyId,
      activityType: sendForm.activityType,
      destinationLabel: sendForm.destinationLabel,
      quantity: sendForm.quantity,
    });
    showSend.value = false;
    await selectItem(detail.value.id);
    await reload();
  } catch (e) {
    modalError.value = e?.response?.data?.error?.message || 'Send failed';
  } finally {
    saving.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.gem-page {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 16px 20px 40px;
  box-sizing: border-box;
  color: #0f172a;
}
.gem-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.gem-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.gem-sub { margin: 6px 0 0; color: #64748b; }
.gem-empty, .gem-empty-row { padding: 24px; color: #64748b; text-align: center; }
.gem-error { color: #b91c1c; margin: 8px 0; }

.gem-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.gem-stat {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 16px;
}
.gem-stat--warn { background: #fff7ed; border-color: #fed7aa; }
.gem-stat-value { font-size: 1.6rem; font-weight: 800; }
.gem-stat-label { font-size: 0.8rem; font-weight: 700; color: #334155; margin-top: 2px; }
.gem-stat-hint { font-size: 0.72rem; color: #94a3b8; margin-top: 2px; }

.gem-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  align-items: center;
}
.gem-select, .gem-search, .gem-modal input, .gem-modal select, .gem-modal textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
}
.gem-select--sm { padding: 4px 8px; font-size: 0.85rem; }
.gem-search { min-width: 180px; flex: 1; }

.gem-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
.gem-tab {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.gem-tab.on { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }

.gem-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 16px;
  align-items: start;
}
.gem-table-wrap {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: auto;
}
.gem-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.gem-table th, .gem-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
  vertical-align: middle;
}
.gem-table th {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  background: #f8fafc;
}
.gem-table tbody tr { cursor: pointer; }
.gem-table tbody tr:hover, .gem-table tbody tr.selected { background: #f8fafc; }
.gem-strong { font-weight: 700; }
.muted { color: #64748b; }

.gem-thumb {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: #e2e8f0;
  display: grid;
  place-items: center;
}
.gem-thumb--sm { width: 28px; height: 28px; border-radius: 6px; }
.gem-thumb img { width: 100%; height: 100%; object-fit: cover; }
.gem-thumb-ph { font-size: 0.7rem; font-weight: 800; color: #475569; }

.gem-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  background: #e2e8f0;
  color: #334155;
}
.cat-gear { background: #dbeafe; color: #1d4ed8; }
.cat-equipment { background: #e0e7ff; color: #4338ca; }
.cat-materials { background: #dcfce7; color: #166534; }
.cat-promotional { background: #fef9c3; color: #854d0e; }
.cat-outreach { background: #ffedd5; color: #9a3412; }

.gem-status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
}
.gem-status.healthy { background: #dcfce7; color: #166534; }
.gem-status.low { background: #ffedd5; color: #9a3412; }
.gem-status.reorder { background: #fee2e2; color: #b91c1c; }

.gem-detail {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px;
  position: sticky;
  top: 12px;
  max-height: calc(100vh - 100px);
  overflow: auto;
}
.gem-detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.gem-detail-head h2 { margin: 0; font-size: 1.15rem; }
.gem-close {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  cursor: pointer;
  color: #64748b;
}
.gem-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 12px;
}
.gem-photos { margin-bottom: 12px; }
.gem-photo-main {
  width: 100%;
  aspect-ratio: 4/3;
  border-radius: 12px;
  overflow: hidden;
  background: #f1f5f9;
  margin-bottom: 8px;
}
.gem-photo-main img { width: 100%; height: 100%; object-fit: cover; }
.gem-photo-empty {
  height: 100%;
  display: grid;
  place-items: center;
  color: #94a3b8;
}
.gem-photo-thumbs { display: flex; gap: 6px; flex-wrap: wrap; }
.gem-photo-thumb, .gem-photo-add {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  background: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
}
.gem-photo-thumb.on { outline: 2px solid #1d4ed8; }
.gem-photo-thumb img { width: 100%; height: 100%; object-fit: cover; }
.gem-photo-add { font-weight: 800; color: #64748b; }

.gem-meta {
  display: grid;
  gap: 6px;
  margin: 0 0 14px;
}
.gem-meta div { display: grid; grid-template-columns: 110px 1fr; gap: 8px; font-size: 0.88rem; }
.gem-meta dt { color: #64748b; margin: 0; }
.gem-meta dd { margin: 0; font-weight: 600; }

.gem-detail h3 {
  margin: 14px 0 8px;
  font-size: 0.95rem;
}
.gem-agency-table { display: grid; gap: 8px; }
.gem-agency-row {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
  display: grid;
  gap: 4px;
}
.gem-agency-name { font-weight: 700; font-size: 0.88rem; }
.gem-hint { font-size: 0.82rem; color: #64748b; margin: 0 0 8px; line-height: 1.4; }
.gem-activity { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.gem-activity li { font-size: 0.85rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }

.gem-activity-section { margin-top: 28px; }
.gem-activity-section h2 { margin: 0 0 10px; font-size: 1.1rem; }
.gem-item-cell { display: flex; align-items: center; gap: 8px; }

.gem-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  z-index: 80;
  padding: 16px;
}
.gem-modal {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  width: min(520px, 100%);
  max-height: 90vh;
  overflow: auto;
  display: grid;
  gap: 10px;
}
.gem-modal h3 { margin: 0; }
.gem-modal label { display: grid; gap: 4px; font-size: 0.85rem; font-weight: 600; }
.gem-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.gem-agencies-pick {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
  max-height: 160px;
  overflow: auto;
}
.gem-check { display: flex; align-items: center; gap: 8px; font-weight: 500; margin: 4px 0; }

.btn {
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  font: inherit;
}
.btn-sm { padding: 5px 10px; font-size: 0.82rem; }
.btn-primary { background: #1d4ed8; color: #fff; }
.btn-secondary { background: #fff; border-color: #cbd5e1; color: #0f172a; }

@media (max-width: 1100px) {
  .gem-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gem-main { grid-template-columns: 1fr; }
  .gem-detail { position: static; max-height: none; }
}
</style>
