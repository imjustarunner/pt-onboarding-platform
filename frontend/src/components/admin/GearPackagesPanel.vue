<template>
  <div class="gpp">
    <div class="gpp-toolbar">
      <div>
        <h2 class="gpp-title">Packages</h2>
        <p class="gpp-sub">Build kits (e.g. New Provider Package), set defaults, then issue to staff with size prefs.</p>
      </div>
      <button type="button" class="btn btn-primary" @click="startCreate">+ New Package</button>
    </div>

    <div v-if="error" class="gpp-error">{{ error }}</div>
    <div v-if="loading" class="gpp-muted">Loading packages…</div>

    <div v-else class="gpp-layout">
      <div class="gpp-list">
        <button
          v-for="p in packages"
          :key="p.id"
          type="button"
          class="gpp-card"
          :class="{ on: selectedId === p.id }"
          @click="selectPackage(p.id)"
        >
          <div class="gpp-card-name">
            {{ p.name }}
            <span v-if="p.isDefault" class="gpp-badge">Default</span>
          </div>
          <div class="gpp-card-meta">
            {{ typeLabel(p.packageType) }} · {{ p.itemCount }} items
            <span v-if="p.agencyName"> · {{ p.agencyName }}</span>
            <span v-else> · Shared</span>
          </div>
        </button>
        <div v-if="!packages.length" class="gpp-empty">No packages yet. Create a New Provider Package to get started.</div>
      </div>

      <div v-if="builderOpen" class="gpp-builder">
        <div class="gpp-builder-head">
          <h3>{{ editingId ? 'Edit Package' : 'Create Package' }}</h3>
          <button type="button" class="gpp-x" @click="closeBuilder">×</button>
        </div>

        <div class="gpp-builder-grid">
          <div class="gpp-form">
            <label>Name<input v-model="form.name" type="text" placeholder="New Provider Package" /></label>
            <label>Type
              <select v-model="form.packageType">
                <option value="new_hire">New Hire / Provider</option>
                <option value="provider_start">Provider Start</option>
                <option value="welcome">Welcome</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>Agency (optional)
              <select v-model="form.agencyId">
                <option value="">Shared (all agencies)</option>
                <option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
              </select>
            </label>
            <label>Description<textarea v-model="form.description" rows="2" /></label>
            <label class="gpp-check">
              <input v-model="form.isDefault" type="checkbox" />
              Set as default for this type
            </label>

            <h4 class="gpp-section-label">Package items <span class="gpp-muted">(drag to reorder)</span></h4>
            <draggable
              v-model="form.items"
              handle=".gpp-drag"
              :animation="180"
              tag="div"
              class="gpp-lines"
              group="package-items"
            >
              <div v-for="(line, idx) in form.items" :key="line._key" class="gpp-line">
                <button type="button" class="gpp-drag" title="Drag to reorder">☰</button>
                <div class="gpp-line-body">
                  <div class="gpp-line-name">{{ line.catalogName }}</div>
                  <div class="gpp-line-controls">
                    <label>Qty
                      <input v-model.number="line.defaultQuantity" type="number" min="1" class="gpp-qty" />
                    </label>
                    <label>Size
                      <select v-model="line.sizeMode">
                        <option value="FROM_PREFS">From provider prefs</option>
                        <option value="CHOOSE_AT_ISSUE">Choose at issue</option>
                        <option value="FIXED">Fixed size</option>
                        <option value="NONE">No size</option>
                      </select>
                    </label>
                    <label v-if="line.sizeMode === 'FROM_PREFS'">Pref key
                      <select v-model="line.prefKey">
                        <option value="shirt">shirt</option>
                        <option value="hoodie">hoodie</option>
                        <option value="pants">pants</option>
                        <option value="other">other</option>
                      </select>
                    </label>
                    <label v-if="line.sizeMode === 'FIXED'">Size
                      <input v-model="line.fixedSizeLabel" type="text" placeholder="M" class="gpp-qty" />
                    </label>
                  </div>
                </div>
                <button type="button" class="gpp-remove" @click="form.items.splice(idx, 1)">Remove</button>
              </div>
            </draggable>
            <div v-if="!form.items.length" class="gpp-drop-hint">
              Drag catalog items from the right into this package.
            </div>

            <div class="gpp-actions">
              <button type="button" class="btn btn-secondary" @click="closeBuilder">Cancel</button>
              <button type="button" class="btn btn-primary" :disabled="saving || !form.name.trim()" @click="savePackage">
                {{ saving ? 'Saving…' : 'Save Package' }}
              </button>
            </div>
          </div>

          <div class="gpp-catalog">
            <h4 class="gpp-section-label">Catalog (drag into package)</h4>
            <input v-model="catalogSearch" type="search" class="gpp-search" placeholder="Search catalog…" />
            <draggable
              :list="filteredCatalog"
              :group="{ name: 'package-items', pull: 'clone', put: false }"
              :clone="cloneCatalogItem"
              :sort="false"
              tag="div"
              class="gpp-catalog-list"
            >
              <div
                v-for="item in filteredCatalog"
                :key="item.id"
                class="gpp-catalog-row"
              >
                <span class="gpp-drag" title="Drag into package">☰</span>
                <div class="gpp-thumb" v-if="item.primaryImage?.url">
                  <img :src="item.primaryImage.url" alt="" />
                </div>
                <div class="gpp-thumb gpp-thumb--ph" v-else>{{ initials(item.name) }}</div>
                <div>
                  <div class="gpp-line-name">{{ item.name }}</div>
                  <div class="gpp-muted">{{ labelCat(item.category) }}</div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" @click="addCatalogItem(item)">+</button>
              </div>
            </draggable>
          </div>
        </div>
      </div>

      <div v-else-if="selected" class="gpp-detail">
        <div class="gpp-builder-head">
          <div>
            <h3>{{ selected.name }}</h3>
            <p class="gpp-muted">{{ selected.description || typeLabel(selected.packageType) }}</p>
          </div>
          <div class="gpp-head-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="editSelected">Edit</button>
            <button type="button" class="btn btn-primary btn-sm" @click="openIssue">Issue Package</button>
          </div>
        </div>

        <table class="gpp-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Size mode</th>
              <th>Pref</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(line, i) in selected.items || []" :key="line.id">
              <td>{{ i + 1 }}</td>
              <td>{{ line.catalogName }}</td>
              <td>{{ line.defaultQuantity }}</td>
              <td>{{ sizeModeLabel(line.sizeMode) }}</td>
              <td>{{ line.prefKey || '—' }}</td>
            </tr>
            <tr v-if="!(selected.items || []).length">
              <td colspan="5" class="gpp-muted">No items in this package.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="gpp-detail gpp-detail--empty">
        Select a package or create a new one.
      </div>
    </div>

    <div v-if="issueOpen" class="gpp-modal-backdrop" @click.self="issueOpen = false">
      <div class="gpp-modal">
        <h3>Issue Package — {{ selected?.name }}</h3>
        <div v-if="issueError" class="gpp-error">{{ issueError }}</div>
        <div v-if="issueSuccess" class="gpp-success">{{ issueSuccess }}</div>

        <label>Agency
          <select v-model="issueForm.agencyId" @change="onIssueAgencyChange">
            <option disabled value="">Select agency</option>
            <option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </label>
        <label>Provider / Staff
          <select v-model="issueForm.userId" @change="loadPreview">
            <option disabled value="">Select person</option>
            <option v-for="u in issueUsers" :key="u.id" :value="String(u.id)">{{ u.name }}</option>
          </select>
        </label>

        <div v-if="preview" class="gpp-preview">
          <h4>Sizes &amp; items</h4>
          <p v-if="preview.preferences" class="gpp-muted">
            Prefs:
            shirt {{ preview.preferences.shirt || '—' }},
            hoodie {{ preview.preferences.hoodie || '—' }},
            pants {{ preview.preferences.pants || '—' }}
          </p>
          <div v-for="line in preview.lines" :key="line.packageItemId" class="gpp-preview-line">
            <div class="gpp-line-name">{{ line.catalogName }}</div>
            <div class="gpp-preview-controls" v-if="line.trackingMode === 'SIZED_STOCK' || line.stockMode === 'COUNTED'">
              <label>Size
                <input
                  :value="overrides[line.packageItemId]?.sizeLabel ?? line.sizeLabel ?? ''"
                  type="text"
                  placeholder="Size"
                  @input="setOverride(line.packageItemId, 'sizeLabel', $event.target.value)"
                />
              </label>
              <label v-if="line.isGendered">Gender
                <select
                  :value="overrides[line.packageItemId]?.gender ?? line.gender ?? ''"
                  @change="setOverride(line.packageItemId, 'gender', $event.target.value)"
                >
                  <option value="">—</option>
                  <option value="women">Women's</option>
                  <option value="men">Men's</option>
                </select>
              </label>
              <span class="gpp-ready" :class="{ ok: line.ready || overrides[line.packageItemId]?.sizeLabel }">
                {{ (line.ready || overrides[line.packageItemId]?.sizeLabel) ? 'Ready' : 'Needs size' }}
              </span>
            </div>
            <div v-else class="gpp-muted">Materials / no size</div>
          </div>
        </div>

        <label>Notes<textarea v-model="issueForm.notes" rows="2" /></label>
        <div class="gpp-actions">
          <button type="button" class="btn btn-secondary" @click="issueOpen = false">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="issuing || !issueForm.agencyId || !issueForm.userId"
            @click="submitIssue"
          >
            {{ issuing ? 'Issuing…' : 'Issue Package' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { VueDraggableNext as draggable } from 'vue-draggable-next';
import api from '../../services/api';

const props = defineProps({
  agencies: { type: Array, default: () => [] },
  catalogItems: { type: Array, default: () => [] },
});

const emit = defineEmits(['issued']);

const loading = ref(false);
const saving = ref(false);
const issuing = ref(false);
const error = ref('');
const issueError = ref('');
const issueSuccess = ref('');
const packages = ref([]);
const selectedId = ref(null);
const selected = ref(null);
const builderOpen = ref(false);
const editingId = ref(null);
const catalogSearch = ref('');
const issueOpen = ref(false);
const issueUsers = ref([]);
const preview = ref(null);
const overrides = reactive({});
let keySeq = 1;

const form = reactive({
  name: '',
  packageType: 'new_hire',
  agencyId: '',
  description: '',
  isDefault: true,
  items: [],
});

const issueForm = reactive({
  agencyId: '',
  userId: '',
  notes: '',
});

const filteredCatalog = computed(() => {
  const q = catalogSearch.value.trim().toLowerCase();
  const list = props.catalogItems || [];
  if (!q) return list;
  return list.filter((i) => String(i.name || '').toLowerCase().includes(q));
});

function typeLabel(t) {
  const map = {
    new_hire: 'New Hire',
    provider_start: 'Provider Start',
    welcome: 'Welcome',
    custom: 'Custom',
  };
  return map[t] || t;
}

function sizeModeLabel(m) {
  const map = {
    FROM_PREFS: 'From prefs',
    CHOOSE_AT_ISSUE: 'Choose at issue',
    FIXED: 'Fixed',
    NONE: 'None',
  };
  return map[m] || m;
}

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

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

function cloneCatalogItem(item) {
  return {
    _key: `n${keySeq++}`,
    catalogItemId: item.id,
    catalogName: item.name,
    defaultQuantity: 1,
    sizeMode: item.stockMode === 'COUNTED' && item.trackingMode !== 'UNIQUE_ASSET' ? 'FROM_PREFS' : 'NONE',
    prefKey: 'shirt',
    fixedSizeLabel: '',
    fixedGender: '',
    isRequired: true,
  };
}

function addCatalogItem(item) {
  form.items.push(cloneCatalogItem(item));
}

async function reloadPackages() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/gear-inventory/packages');
    packages.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load packages';
  } finally {
    loading.value = false;
  }
}

async function selectPackage(id) {
  selectedId.value = id;
  builderOpen.value = false;
  try {
    const res = await api.get(`/gear-inventory/packages/${id}`);
    selected.value = res.data;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load package';
  }
}

function startCreate() {
  editingId.value = null;
  selectedId.value = null;
  selected.value = null;
  Object.assign(form, {
    name: 'New Provider Package',
    packageType: 'new_hire',
    agencyId: '',
    description: 'Default kit for new providers — sizes from their preferences.',
    isDefault: true,
    items: [],
  });
  builderOpen.value = true;
}

function editSelected() {
  if (!selected.value) return;
  editingId.value = selected.value.id;
  Object.assign(form, {
    name: selected.value.name,
    packageType: selected.value.packageType,
    agencyId: selected.value.agencyId ? String(selected.value.agencyId) : '',
    description: selected.value.description || '',
    isDefault: !!selected.value.isDefault,
    items: (selected.value.items || []).map((line) => ({
      _key: `e${line.id}`,
      catalogItemId: line.catalogItemId,
      catalogName: line.catalogName,
      defaultQuantity: line.defaultQuantity,
      sizeMode: line.sizeMode,
      prefKey: line.prefKey || 'shirt',
      fixedSizeLabel: line.fixedSizeLabel || '',
      fixedGender: line.fixedGender || '',
      isRequired: line.isRequired,
    })),
  });
  builderOpen.value = true;
}

function closeBuilder() {
  builderOpen.value = false;
  if (selectedId.value) selectPackage(selectedId.value);
}

async function savePackage() {
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      name: form.name.trim(),
      packageType: form.packageType,
      agencyId: form.agencyId || null,
      description: form.description,
      isDefault: form.isDefault,
      items: form.items.map((line, i) => ({
        catalogItemId: line.catalogItemId,
        defaultQuantity: line.defaultQuantity,
        sizeMode: line.sizeMode,
        prefKey: line.prefKey || null,
        fixedSizeLabel: line.fixedSizeLabel || null,
        fixedGender: line.fixedGender || null,
        sortOrder: i,
        isRequired: line.isRequired !== false,
      })),
    };
    let id = editingId.value;
    if (editingId.value) {
      await api.patch(`/gear-inventory/packages/${editingId.value}`, payload);
    } else {
      const res = await api.post('/gear-inventory/packages', payload);
      id = res.data?.id;
    }
    builderOpen.value = false;
    await reloadPackages();
    if (id) await selectPackage(id);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

function openIssue() {
  issueError.value = '';
  issueSuccess.value = '';
  preview.value = null;
  Object.keys(overrides).forEach((k) => delete overrides[k]);
  issueForm.agencyId = selected.value?.agencyId ? String(selected.value.agencyId) : '';
  issueForm.userId = '';
  issueForm.notes = '';
  issueOpen.value = true;
  if (issueForm.agencyId) onIssueAgencyChange();
}

async function onIssueAgencyChange() {
  issueForm.userId = '';
  preview.value = null;
  issueUsers.value = [];
  if (!issueForm.agencyId) return;
  try {
    const res = await api.get(`/gear-inventory/catalog/agencies/${issueForm.agencyId}/users`);
    issueUsers.value = Array.isArray(res.data) ? res.data : [];
  } catch {
    issueUsers.value = [];
  }
}

async function loadPreview() {
  preview.value = null;
  if (!selectedId.value || !issueForm.agencyId || !issueForm.userId) return;
  try {
    const res = await api.post(`/gear-inventory/packages/${selectedId.value}/preview-issue`, {
      agencyId: Number(issueForm.agencyId),
      userId: Number(issueForm.userId),
    });
    preview.value = res.data;
    for (const line of preview.value.lines || []) {
      if (line.sizeLabel || line.gender) {
        overrides[line.packageItemId] = {
          sizeLabel: line.sizeLabel || '',
          gender: line.gender || '',
          quantity: line.quantity || 1,
        };
      }
    }
  } catch (e) {
    issueError.value = e?.response?.data?.error?.message || 'Preview failed';
  }
}

function setOverride(packageItemId, key, value) {
  if (!overrides[packageItemId]) overrides[packageItemId] = {};
  overrides[packageItemId][key] = value;
}

async function submitIssue() {
  issuing.value = true;
  issueError.value = '';
  issueSuccess.value = '';
  try {
    const res = await api.post(`/gear-inventory/packages/${selectedId.value}/issue`, {
      agencyId: Number(issueForm.agencyId),
      userId: Number(issueForm.userId),
      notes: issueForm.notes || null,
      overrides: { ...overrides },
    });
    const data = res.data || {};
    issueSuccess.value = `Issued (${data.status}): ${data.okCount || 0} ok, ${data.failCount || 0} failed. Items appear on the employee's Lifecycle gear panel.`;
    emit('issued', data);
  } catch (e) {
    issueError.value = e?.response?.data?.error?.message || 'Issue failed';
  } finally {
    issuing.value = false;
  }
}

watch(
  () => form.items,
  (items) => {
    // When drag-clone drops, ensure _key and catalogName exist
    for (const line of items || []) {
      if (!line._key) line._key = `d${keySeq++}`;
      if (!line.catalogName && line.name) line.catalogName = line.name;
      if (!line.catalogItemId && line.id && !line.packageId) {
        // cloned raw catalog row
        line.catalogItemId = line.id;
        line.defaultQuantity = line.defaultQuantity || 1;
        line.sizeMode = line.sizeMode || 'FROM_PREFS';
        line.prefKey = line.prefKey || 'shirt';
      }
    }
  },
  { deep: true }
);

onMounted(reloadPackages);

defineExpose({ reloadPackages, startCreate });
</script>

<style scoped>
.gpp { margin-top: 8px; }
.gpp-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}
.gpp-title { margin: 0; font-size: 1.15rem; }
.gpp-sub { margin: 4px 0 0; color: #64748b; font-size: 0.88rem; }
.gpp-error { color: #b91c1c; margin: 8px 0; }
.gpp-success { color: #166534; margin: 8px 0; font-weight: 600; }
.gpp-muted { color: #64748b; font-size: 0.82rem; }
.gpp-empty { padding: 20px; color: #64748b; }

.gpp-layout {
  display: grid;
  grid-template-columns: minmax(200px, 280px) 1fr;
  gap: 14px;
  align-items: start;
}
.gpp-list { display: grid; gap: 8px; }
.gpp-card {
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
}
.gpp-card.on { border-color: #1d4ed8; background: #eff6ff; }
.gpp-card-name { font-weight: 700; display: flex; gap: 6px; align-items: center; }
.gpp-card-meta { font-size: 0.78rem; color: #64748b; margin-top: 4px; }
.gpp-badge {
  font-size: 0.65rem;
  background: #dbeafe;
  color: #1d4ed8;
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 700;
}

.gpp-builder, .gpp-detail {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px;
}
.gpp-detail--empty { color: #64748b; padding: 40px; text-align: center; }
.gpp-builder-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}
.gpp-builder-head h3 { margin: 0; }
.gpp-x {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  cursor: pointer;
  color: #64748b;
}
.gpp-head-actions { display: flex; gap: 6px; }
.gpp-builder-grid {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 14px;
}
.gpp-form, .gpp-catalog { display: grid; gap: 8px; align-content: start; }
.gpp-form label, .gpp-modal label {
  display: grid;
  gap: 4px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #475569;
}
.gpp-form input, .gpp-form select, .gpp-form textarea,
.gpp-modal input, .gpp-modal select, .gpp-modal textarea,
.gpp-search, .gpp-qty {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-weight: 500;
}
.gpp-qty { width: 72px; }
.gpp-check {
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  gap: 8px;
  font-weight: 600 !important;
}
.gpp-section-label { margin: 10px 0 4px; font-size: 0.9rem; }

.gpp-lines, .gpp-catalog-list { display: grid; gap: 8px; min-height: 40px; }
.gpp-line, .gpp-catalog-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px;
  background: #f8fafc;
}
.gpp-drag {
  border: none;
  background: transparent;
  cursor: grab;
  color: #94a3b8;
  padding: 2px 4px;
}
.gpp-line-body { flex: 1; }
.gpp-line-name { font-weight: 700; font-size: 0.9rem; }
.gpp-line-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}
.gpp-line-controls label { font-size: 0.72rem; }
.gpp-remove {
  border: none;
  background: transparent;
  color: #b91c1c;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
}
.gpp-drop-hint {
  border: 2px dashed #cbd5e1;
  border-radius: 10px;
  padding: 20px;
  text-align: center;
  color: #64748b;
  font-size: 0.88rem;
}
.gpp-thumb {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  overflow: hidden;
  background: #e2e8f0;
  flex-shrink: 0;
}
.gpp-thumb img { width: 100%; height: 100%; object-fit: cover; }
.gpp-thumb--ph {
  display: grid;
  place-items: center;
  font-size: 0.65rem;
  font-weight: 800;
  color: #475569;
}
.gpp-catalog-list { max-height: 420px; overflow: auto; }
.gpp-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }

.gpp-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.gpp-table th, .gpp-table td { padding: 8px; border-bottom: 1px solid #f1f5f9; text-align: left; }
.gpp-table th { font-size: 0.7rem; text-transform: uppercase; color: #64748b; }

.gpp-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  z-index: 90;
  padding: 16px;
}
.gpp-modal {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  width: min(560px, 100%);
  max-height: 90vh;
  overflow: auto;
  display: grid;
  gap: 10px;
}
.gpp-modal h3 { margin: 0; }
.gpp-preview {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 8px;
}
.gpp-preview h4 { margin: 0; font-size: 0.9rem; }
.gpp-preview-line {
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 8px;
}
.gpp-preview-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; margin-top: 4px; }
.gpp-ready { font-size: 0.75rem; font-weight: 700; color: #9a3412; }
.gpp-ready.ok { color: #166534; }

.btn {
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  font: inherit;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm { padding: 5px 10px; font-size: 0.82rem; }
.btn-primary { background: #1d4ed8; color: #fff; }
.btn-secondary { background: #fff; border-color: #cbd5e1; color: #0f172a; }

@media (max-width: 1000px) {
  .gpp-layout, .gpp-builder-grid { grid-template-columns: 1fr; }
}
</style>
