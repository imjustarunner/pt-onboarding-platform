<template>
  <div class="gi-page">
    <header class="gi-header">
      <div>
        <h1 class="gi-title">Gear &amp; Inventory</h1>
        <p class="gi-sub">Catalog, stock levels, unique assets, and issue history for {{ agencyName }}.</p>
      </div>
    </header>

    <div v-if="!agencyId" class="gi-empty">Select an organization to manage gear inventory.</div>
    <div v-else-if="loading" class="gi-empty">Loading inventory…</div>
    <div v-else-if="error" class="gi-error">{{ error }}</div>

    <template v-else>
      <!-- Summary strip -->
      <section class="gi-summary">
        <div class="gi-stat">
          <div class="gi-stat-value">{{ summary.activeTypes }}</div>
          <div class="gi-stat-label">Active types</div>
        </div>
        <div class="gi-stat" :class="{ 'gi-stat--warn': summary.lowStockCount > 0 }">
          <div class="gi-stat-value">{{ summary.lowStockCount }}</div>
          <div class="gi-stat-label">Low stock</div>
        </div>
        <div class="gi-stat">
          <div class="gi-stat-value">{{ summary.assetsAvailable }}</div>
          <div class="gi-stat-label">Assets available</div>
        </div>
        <div class="gi-stat">
          <div class="gi-stat-value">{{ summary.assetsIssued }}</div>
          <div class="gi-stat-label">Assets issued</div>
        </div>
        <div class="gi-stat">
          <div class="gi-stat-value">{{ summary.activeAssignments }}</div>
          <div class="gi-stat-label">People with gear</div>
        </div>
      </section>

      <div class="gi-tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="gi-tab"
          :class="{ on: panel === t.id }"
          @click="panel = t.id"
        >{{ t.label }}</button>
      </div>

      <!-- Catalog -->
      <section v-if="panel === 'catalog'" class="gi-panel">
        <div class="gi-panel-head">
          <h2>Catalog</h2>
          <button type="button" class="btn btn-primary btn-sm" @click="openTypeForm()">Add type</button>
        </div>
        <div class="gi-table">
          <div class="gi-thead">
            <span>Name</span><span>Category</span><span>Mode</span><span>Lifecycle link</span><span></span>
          </div>
          <div v-for="t in types" :key="t.id" class="gi-row">
            <span class="gi-strong">{{ t.name }}</span>
            <span>{{ t.category }}</span>
            <span>{{ t.trackingMode === 'UNIQUE_ASSET' ? 'Unique asset' : 'Sized stock' }}</span>
            <span class="muted">{{ t.lifecycleItemKey || '—' }}</span>
            <span class="gi-actions">
              <button type="button" class="gi-link" @click="openTypeForm(t)">Edit</button>
            </span>
          </div>
          <div v-if="!types.length" class="gi-empty-row">No gear types yet.</div>
        </div>
      </section>

      <!-- Stock -->
      <section v-if="panel === 'stock'" class="gi-panel">
        <div class="gi-panel-head">
          <h2>Sized stock</h2>
        </div>
        <div class="gi-stock-grid">
          <div
            v-for="s in stock"
            :key="s.id"
            class="gi-stock-card"
            :class="{ low: s.isLow }"
          >
            <div class="gi-stock-name">{{ s.typeName }}</div>
            <div class="gi-stock-size">Size {{ s.sizeLabel }}</div>
            <div class="gi-stock-qty">{{ s.quantityOnHand }}</div>
            <div class="gi-stock-meta">{{ s.isLow ? 'Low stock' : 'On hand' }}</div>
            <button type="button" class="btn btn-secondary btn-sm" @click="openAdjust(s)">Adjust</button>
          </div>
          <div v-if="!stock.length" class="gi-empty-row">No sized stock rows. Add a sized catalog type first.</div>
        </div>
      </section>

      <!-- Assets -->
      <section v-if="panel === 'assets'" class="gi-panel">
        <div class="gi-panel-head">
          <h2>Unique assets</h2>
          <button type="button" class="btn btn-primary btn-sm" @click="openAssetForm()">Add asset</button>
        </div>
        <div class="gi-table">
          <div class="gi-thead gi-thead-assets">
            <span>Code</span><span>Type</span><span>Status</span><span>Holder</span><span></span>
          </div>
          <div v-for="a in assets" :key="a.id" class="gi-row gi-row-assets">
            <span class="gi-strong">{{ a.assetCode }}</span>
            <span>{{ a.typeName }}</span>
            <span>
              <span class="gi-pill" :class="`st-${a.status}`">{{ a.status }}</span>
            </span>
            <span>{{ a.holder?.name || '—' }}</span>
            <span class="gi-actions">
              <button
                v-if="a.status !== 'RETIRED'"
                type="button"
                class="gi-link"
                @click="retireAsset(a)"
              >Retire</button>
            </span>
          </div>
          <div v-if="!assets.length" class="gi-empty-row">No unique assets yet.</div>
        </div>
      </section>

      <!-- Movements -->
      <section v-if="panel === 'movements'" class="gi-panel">
        <div class="gi-panel-head">
          <h2>Recent movements</h2>
        </div>
        <div class="gi-table">
          <div class="gi-thead gi-thead-mov">
            <span>When</span><span>Type</span><span>Item</span><span>Delta</span><span>Person</span><span>Reason</span>
          </div>
          <div v-for="m in movements" :key="m.id" class="gi-row gi-row-mov">
            <span>{{ fmtWhen(m.createdAt) }}</span>
            <span>{{ m.movementType }}</span>
            <span>{{ m.typeName }}{{ m.sizeLabel ? ` · ${m.sizeLabel}` : '' }}{{ m.assetCode ? ` · ${m.assetCode}` : '' }}</span>
            <span>{{ m.quantityDelta }}</span>
            <span>{{ m.userName || '—' }}</span>
            <span class="muted">{{ m.reason || '—' }}</span>
          </div>
          <div v-if="!movements.length" class="gi-empty-row">No movements yet.</div>
        </div>
      </section>
    </template>

    <!-- Type modal -->
    <div v-if="showTypeModal" class="gi-modal-backdrop" @click.self="showTypeModal = false">
      <div class="gi-modal">
        <h3>{{ editingType?.id ? 'Edit gear type' : 'Add gear type' }}</h3>
        <label class="lbl">Name</label>
        <input v-model="typeForm.name" class="input" type="text" placeholder="e.g. Company hoodie" />
        <label class="lbl">Category</label>
        <select v-model="typeForm.category" class="input">
          <option value="general">General</option>
          <option value="apparel">Apparel</option>
          <option value="electronics">Electronics</option>
          <option value="keys_access">Keys / Access</option>
          <option value="vehicle">Vehicle / Cart</option>
          <option value="other">Other</option>
        </select>
        <label class="lbl">Tracking mode</label>
        <select v-model="typeForm.trackingMode" class="input" :disabled="!!editingType?.id">
          <option value="SIZED_STOCK">Sized stock (qty by size)</option>
          <option value="UNIQUE_ASSET">Unique asset (Cart #4, laptop SN…)</option>
        </select>
        <template v-if="typeForm.trackingMode === 'SIZED_STOCK'">
          <label class="lbl">Sizes (comma-separated)</label>
          <input v-model="typeForm.sizeOptionsText" class="input" type="text" placeholder="XS, S, M, L, XL" />
          <label class="lbl">Low-stock threshold</label>
          <input v-model.number="typeForm.lowStockThreshold" class="input" type="number" min="0" />
        </template>
        <label class="lbl">Lifecycle item key (optional auto-complete)</label>
        <select v-model="typeForm.lifecycleItemKey" class="input">
          <option value="">— None —</option>
          <option v-for="k in lifecycleKeys" :key="k.value" :value="k.value">{{ k.label }}</option>
        </select>
        <div class="gi-modal-actions">
          <button type="button" class="btn btn-secondary" @click="showTypeModal = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="saveType">Save</button>
        </div>
        <p v-if="modalError" class="gi-error">{{ modalError }}</p>
      </div>
    </div>

    <!-- Adjust modal -->
    <div v-if="showAdjustModal" class="gi-modal-backdrop" @click.self="showAdjustModal = false">
      <div class="gi-modal">
        <h3>Adjust stock — {{ adjustTarget?.typeName }} ({{ adjustTarget?.sizeLabel }})</h3>
        <label class="lbl">New quantity on hand</label>
        <input v-model.number="adjustQty" class="input" type="number" min="0" />
        <label class="lbl">Reason</label>
        <input v-model="adjustReason" class="input" type="text" placeholder="Received shipment, count correction…" />
        <div class="gi-modal-actions">
          <button type="button" class="btn btn-secondary" @click="showAdjustModal = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="saveAdjust">Save</button>
        </div>
        <p v-if="modalError" class="gi-error">{{ modalError }}</p>
      </div>
    </div>

    <!-- Asset modal -->
    <div v-if="showAssetModal" class="gi-modal-backdrop" @click.self="showAssetModal = false">
      <div class="gi-modal">
        <h3>Add unique asset</h3>
        <label class="lbl">Gear type</label>
        <select v-model.number="assetForm.gearItemTypeId" class="input">
          <option :value="0">Select…</option>
          <option v-for="t in uniqueTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <label class="lbl">Asset code</label>
        <input v-model="assetForm.assetCode" class="input" type="text" placeholder="CART-4" />
        <label class="lbl">Notes</label>
        <input v-model="assetForm.notes" class="input" type="text" />
        <div class="gi-modal-actions">
          <button type="button" class="btn btn-secondary" @click="showAssetModal = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="saveAsset">Save</button>
        </div>
        <p v-if="modalError" class="gi-error">{{ modalError }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);
const agencyName = computed(() => agencyStore.currentAgency?.name || 'this organization');

const tabs = [
  { id: 'catalog', label: 'Catalog' },
  { id: 'stock', label: 'Stock' },
  { id: 'assets', label: 'Assets' },
  { id: 'movements', label: 'Movements' },
];
const panel = ref('catalog');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const modalError = ref('');
const summary = ref({
  activeTypes: 0,
  lowStockCount: 0,
  assetsAvailable: 0,
  assetsIssued: 0,
  activeAssignments: 0,
});
const types = ref([]);
const stock = ref([]);
const assets = ref([]);
const movements = ref([]);

const lifecycleKeys = [
  { value: 'company_card_issued', label: 'Company Card Issued' },
  { value: 'company_computer_issued', label: 'Company Computer Issued' },
  { value: 'company_phone_issued', label: 'Phone Extension Assigned' },
  { value: 'company_vehicle_assigned', label: 'Company Vehicle Assigned' },
  { value: 'keys_badge_issued', label: 'Keys/Badge Issued' },
];

const uniqueTypes = computed(() => types.value.filter((t) => t.trackingMode === 'UNIQUE_ASSET'));

const showTypeModal = ref(false);
const editingType = ref(null);
const typeForm = ref({
  name: '',
  category: 'general',
  trackingMode: 'SIZED_STOCK',
  sizeOptionsText: 'XS, S, M, L, XL',
  lowStockThreshold: 2,
  lifecycleItemKey: '',
});

const showAdjustModal = ref(false);
const adjustTarget = ref(null);
const adjustQty = ref(0);
const adjustReason = ref('');

const showAssetModal = ref(false);
const assetForm = ref({ gearItemTypeId: 0, assetCode: '', notes: '' });

const base = () => `/gear-inventory/${agencyId.value}`;

async function loadAll() {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const [sumRes, typesRes, stockRes, assetsRes, movRes] = await Promise.all([
      api.get(`${base()}/summary`),
      api.get(`${base()}/types`),
      api.get(`${base()}/stock`),
      api.get(`${base()}/assets`),
      api.get(`${base()}/movements`, { params: { limit: 80 } }),
    ]);
    summary.value = sumRes.data || summary.value;
    types.value = Array.isArray(typesRes.data) ? typesRes.data : [];
    stock.value = Array.isArray(stockRes.data) ? stockRes.data : [];
    assets.value = Array.isArray(assetsRes.data) ? assetsRes.data : [];
    movements.value = Array.isArray(movRes.data) ? movRes.data : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to load inventory';
  } finally {
    loading.value = false;
  }
}

function openTypeForm(t = null) {
  editingType.value = t;
  modalError.value = '';
  typeForm.value = {
    name: t?.name || '',
    category: t?.category || 'general',
    trackingMode: t?.trackingMode || 'SIZED_STOCK',
    sizeOptionsText: (t?.sizeOptions || ['XS', 'S', 'M', 'L', 'XL']).join(', '),
    lowStockThreshold: t?.lowStockThreshold ?? 2,
    lifecycleItemKey: t?.lifecycleItemKey || '',
  };
  showTypeModal.value = true;
}

async function saveType() {
  saving.value = true;
  modalError.value = '';
  try {
    const payload = {
      name: typeForm.value.name,
      category: typeForm.value.category,
      trackingMode: typeForm.value.trackingMode,
      sizeOptions: typeForm.value.sizeOptionsText.split(',').map((s) => s.trim()).filter(Boolean),
      lowStockThreshold: typeForm.value.lowStockThreshold,
      lifecycleItemKey: typeForm.value.lifecycleItemKey || null,
    };
    if (editingType.value?.id) {
      await api.patch(`${base()}/types/${editingType.value.id}`, payload);
    } else {
      await api.post(`${base()}/types`, payload);
    }
    showTypeModal.value = false;
    await loadAll();
  } catch (e) {
    modalError.value = e?.response?.data?.error?.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

function openAdjust(s) {
  adjustTarget.value = s;
  adjustQty.value = s.quantityOnHand;
  adjustReason.value = '';
  modalError.value = '';
  showAdjustModal.value = true;
}

async function saveAdjust() {
  saving.value = true;
  modalError.value = '';
  try {
    await api.post(`${base()}/stock/adjust`, {
      gearItemTypeId: adjustTarget.value.gearItemTypeId,
      sizeLabel: adjustTarget.value.sizeLabel,
      quantityOnHand: adjustQty.value,
      reason: adjustReason.value || 'Stock adjustment',
    });
    showAdjustModal.value = false;
    await loadAll();
  } catch (e) {
    modalError.value = e?.response?.data?.error?.message || 'Adjust failed';
  } finally {
    saving.value = false;
  }
}

function openAssetForm() {
  assetForm.value = {
    gearItemTypeId: uniqueTypes.value[0]?.id || 0,
    assetCode: '',
    notes: '',
  };
  modalError.value = '';
  showAssetModal.value = true;
}

async function saveAsset() {
  saving.value = true;
  modalError.value = '';
  try {
    await api.post(`${base()}/assets`, assetForm.value);
    showAssetModal.value = false;
    await loadAll();
  } catch (e) {
    modalError.value = e?.response?.data?.error?.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function retireAsset(a) {
  if (!confirm(`Retire ${a.assetCode}?`)) return;
  try {
    await api.patch(`${base()}/assets/${a.id}`, { status: 'RETIRED' });
    await loadAll();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Retire failed';
  }
}

function fmtWhen(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return String(d);
  }
}

onMounted(loadAll);
watch(agencyId, () => { void loadAll(); });
</script>

<style scoped>
.gi-page { max-width: 1100px; margin: 0 auto; padding: 24px 20px 48px; }
.gi-header { margin-bottom: 20px; }
.gi-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary, #111827);
}
.gi-sub { margin: 6px 0 0; color: var(--text-secondary, #6b7280); font-size: 0.95rem; }
.gi-empty, .gi-empty-row { padding: 24px; color: #6b7280; text-align: center; }
.gi-error { color: #b91c1c; margin: 8px 0; font-size: 0.9rem; }

.gi-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.gi-stat {
  background: linear-gradient(180deg, #f8fafc, #f1f5f9);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
}
.gi-stat--warn { background: #fff7ed; border-color: #fed7aa; }
.gi-stat-value { font-size: 1.6rem; font-weight: 800; color: #0f172a; }
.gi-stat-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin-top: 2px; }

.gi-tabs { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
.gi-tab {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #4b5563;
  cursor: pointer;
}
.gi-tab.on { background: #0f766e; border-color: #0f766e; color: #fff; }

.gi-panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 16px 18px 20px;
}
.gi-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.gi-panel-head h2 { margin: 0; font-size: 1.05rem; font-weight: 800; }

.gi-table { display: flex; flex-direction: column; }
.gi-thead, .gi-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 1.2fr 70px;
  gap: 8px;
  padding: 8px 4px;
  align-items: center;
  font-size: 0.88rem;
}
.gi-thead-assets, .gi-row-assets { grid-template-columns: 1fr 1.2fr 0.9fr 1.2fr 70px; }
.gi-thead-mov, .gi-row-mov { grid-template-columns: 0.9fr 0.7fr 1.4fr 0.5fr 1fr 1.2fr; }
.gi-thead {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  border-bottom: 1px solid #e5e7eb;
}
.gi-row { border-bottom: 1px solid #f3f4f6; }
.gi-strong { font-weight: 700; color: #111827; }
.gi-actions { text-align: right; }
.gi-link {
  border: none;
  background: none;
  color: #0f766e;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
}
.muted { color: #9ca3af; }

.gi-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}
.st-AVAILABLE { background: #dcfce7; color: #166534; }
.st-ISSUED { background: #ffedd5; color: #9a3412; }
.st-RETIRED { background: #f3f4f6; color: #6b7280; }

.gi-stock-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.gi-stock-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: #fafafa;
}
.gi-stock-card.low { border-color: #fdba74; background: #fff7ed; }
.gi-stock-name { font-weight: 700; font-size: 0.9rem; }
.gi-stock-size { font-size: 0.75rem; color: #6b7280; margin-top: 2px; }
.gi-stock-qty { font-size: 1.6rem; font-weight: 800; margin: 8px 0 2px; }
.gi-stock-meta { font-size: 0.72rem; color: #64748b; margin-bottom: 8px; }

.gi-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
  padding: 16px;
}
.gi-modal {
  background: #fff;
  border-radius: 14px;
  padding: 20px;
  width: min(440px, 100%);
  box-shadow: 0 20px 50px rgba(0,0,0,0.2);
}
.gi-modal h3 { margin: 0 0 12px; font-size: 1.1rem; }
.gi-modal .lbl { display: block; margin-top: 10px; font-size: 12px; font-weight: 700; color: #4b5563; }
.gi-modal .input { width: 100%; margin-top: 4px; }
.gi-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }

@media (max-width: 800px) {
  .gi-summary { grid-template-columns: repeat(2, 1fr); }
  .gi-thead, .gi-row { grid-template-columns: 1fr 1fr; }
  .gi-thead-mov, .gi-row-mov { grid-template-columns: 1fr 1fr; }
}
</style>
