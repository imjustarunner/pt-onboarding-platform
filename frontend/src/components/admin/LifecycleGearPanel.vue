<template>
  <div class="lc-gear">
    <div class="lc-gear-head">
      <div>
        <h4 class="lc-block-title" style="margin-bottom:4px;">Issued gear</h4>
        <p class="lc-hint" style="margin:0;">Inventory source of truth — sizes, carts, and equipment on this person.</p>
      </div>
      <button
        v-if="!viewOnly && agencyId"
        type="button"
        class="btn btn-primary btn-sm"
        @click="openIssue"
      >Issue gear</button>
    </div>

    <div v-if="!agencyId" class="lc-hint">Select an organization to manage issued gear.</div>
    <div v-else-if="bootstrapping" class="lc-hint">Loading issued gear…</div>
    <div v-else-if="error && !hasLoadedOnce" class="lc-save-error">{{ error }}</div>
    <template v-else>
      <p v-if="error" class="lc-save-error">{{ error }}</p>

      <!-- Size preferences -->
      <div class="lc-gear-prefs">
        <div class="lc-gear-prefs-label">Year Update gear status</div>
        <div class="lc-gear-requests">
          <div v-for="item in gearRequestRows" :key="item.key" class="lc-gear-request-row">
            <span class="lc-gear-request-name">{{ item.label }}</span>
            <span class="lc-gear-access-pill" :class="gearPillClass(item.status)">{{ item.statusLabel }}</span>
            <span class="lc-gear-request-detail">{{ item.detail || '—' }}</span>
          </div>
        </div>
        <div class="lc-gear-prefs-label" style="margin-top:12px;">Preferred sizes</div>
        <div class="lc-gear-prefs-row">
          <label class="lc-gear-pref">
            <span>Shirt</span>
            <input
              v-model="prefs.shirt"
              class="lc-gear-pref-input"
              type="text"
              placeholder="M"
              :disabled="viewOnly || prefsSaving"
              @blur="savePrefs"
            />
          </label>
          <label class="lc-gear-pref">
            <span>Hoodie</span>
            <input
              v-model="prefs.hoodie"
              class="lc-gear-pref-input"
              type="text"
              placeholder="L"
              :disabled="viewOnly || prefsSaving"
              @blur="savePrefs"
            />
          </label>
          <label class="lc-gear-pref">
            <span>Pants</span>
            <input
              v-model="prefs.pants"
              class="lc-gear-pref-input"
              type="text"
              placeholder="32"
              :disabled="viewOnly || prefsSaving"
              @blur="savePrefs"
            />
          </label>
          <label class="lc-gear-pref">
            <span>Other</span>
            <input
              v-model="prefs.other"
              class="lc-gear-pref-input"
              type="text"
              placeholder="—"
              :disabled="viewOnly || prefsSaving"
              @blur="savePrefs"
            />
          </label>
        </div>
        <p v-if="prefsSaved" class="lc-save-confirm">Sizes saved.</p>
      </div>

      <div class="lc-gear-table">
        <div class="lc-gear-thead">
          <span>Item</span>
          <span>Size / Asset</span>
          <span>Issued</span>
          <span v-if="!viewOnly"></span>
        </div>
        <div v-for="a in assignments" :key="a.id" class="lc-gear-row">
          <span class="lc-gear-name">{{ a.typeName }}</span>
          <span>{{ a.displayLabel || a.assetCode || a.sizeLabel || '—' }}</span>
          <span>{{ fmtDate(a.issuedAt) || '—' }}</span>
          <span v-if="!viewOnly" class="lc-gear-actions">
            <button type="button" class="lc-gear-return" :disabled="returningId === a.id" @click="returnItem(a)">
              {{ returningId === a.id ? '…' : 'Return' }}
            </button>
          </span>
        </div>
        <div v-if="!assignments.length" class="lc-gear-empty">No gear issued yet.</div>
      </div>
    </template>

    <!-- Issue modal -->
    <div v-if="showIssue" class="lc-gear-modal-backdrop" @click.self="showIssue = false">
      <div class="lc-gear-modal">
        <h3>Issue gear</h3>
        <label class="lc-gear-lbl">Type</label>
        <select v-model.number="issueForm.gearItemTypeId" class="lc-gear-input" @change="onTypeChange">
          <option :value="0">Select…</option>
          <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }} ({{ t.trackingMode === 'UNIQUE_ASSET' ? 'asset' : 'sized' }})</option>
        </select>

        <template v-if="issuable?.trackingMode === 'SIZED_STOCK'">
          <template v-if="issuable.isGendered">
            <label class="lc-gear-lbl">Cut</label>
            <select v-model="issueForm.gender" class="lc-gear-input" @change="onGenderChange">
              <option value="">Select…</option>
              <option v-for="g in issuable.genders || []" :key="g.value" :value="g.value">{{ g.label }}</option>
            </select>
          </template>
          <label class="lc-gear-lbl">Size</label>
          <select v-model="issueForm.sizeLabel" class="lc-gear-input" :disabled="issuable.isGendered && !issueForm.gender">
            <option value="">Select…</option>
            <option v-for="s in filteredIssuableSizes" :key="`${s.gender}-${s.sizeLabel}`" :value="s.sizeLabel">
              {{ s.displayLabel || s.sizeLabel }} ({{ s.quantityOnHand }} on hand)
            </option>
          </select>
        </template>

        <template v-if="issuable?.trackingMode === 'UNIQUE_ASSET'">
          <label class="lc-gear-lbl">Asset</label>
          <select v-model.number="issueForm.uniqueAssetId" class="lc-gear-input">
            <option :value="0">Select…</option>
            <option v-for="a in issuable.assets || []" :key="a.id" :value="a.id">{{ a.assetCode }}</option>
          </select>
        </template>

        <label class="lc-gear-lbl">Notes (optional)</label>
        <input v-model="issueForm.notes" class="lc-gear-input" type="text" />

        <div class="lc-gear-modal-actions">
          <button type="button" class="btn btn-secondary" @click="showIssue = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="issuing" @click="submitIssue">Issue</button>
        </div>
        <p v-if="issueError" class="lc-save-error">{{ issueError }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  userId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  viewOnly: { type: Boolean, default: false },
});

const emit = defineEmits(['changed']);

const quiet = { skipGlobalLoading: true };

const bootstrapping = ref(false);
const hasLoadedOnce = ref(false);
const error = ref('');
const assignments = ref([]);
const types = ref([]);
const prefs = ref({
  shirt: '',
  hoodie: '',
  pants: '',
  other: '',
  gear_items: {},
});
const prefsSnapshot = ref('');
const prefsSaved = ref(false);
const prefsSaving = ref(false);

const showIssue = ref(false);
const issuing = ref(false);
const issueError = ref('');
const issuable = ref(null);
const issueForm = ref({ gearItemTypeId: 0, gender: '', sizeLabel: '', uniqueAssetId: 0, notes: '' });
const returningId = ref(null);

const filteredIssuableSizes = computed(() => {
  const sizes = issuable.value?.sizes || [];
  if (!issuable.value?.isGendered) return sizes;
  const g = String(issueForm.value.gender || '');
  if (!g) return [];
  return sizes.filter((s) => String(s.gender || '') === g);
});

const GEAR_ITEM_ORDER = [
  'school_cart',
  'office_key',
  'itsco_name_tag',
  'office_nametag',
  'itsco_lanyard',
  'business_cards',
  'shirt',
  'canvas_bag',
];

const GEAR_ITEM_LABELS = {
  school_cart: 'School cart',
  office_key: 'Office key',
  itsco_name_tag: 'ITSCO name tag',
  office_nametag: 'Office nametag',
  itsco_lanyard: 'ITSCO lanyard',
  business_cards: 'Business cards',
  shirt: 'ITSCO shirt',
  canvas_bag: 'ITSCO canvas bag',
};

function gearPillClass(status) {
  if (status === 'issued' || status === 'has') return 'lc-gear-access-pill--ok';
  if (status === 'requested') return 'lc-gear-access-pill--need';
  return '';
}

function assignmentMatchesGearKey(assignment, key) {
  const hay = `${assignment?.typeName || ''} ${assignment?.assetCode || ''}`.toLowerCase();
  switch (key) {
    case 'school_cart': return /cart/.test(hay);
    case 'office_key': return /key|badge/.test(hay);
    case 'itsco_name_tag': return /name.?tag|nametag/.test(hay) && !/office/.test(hay);
    case 'office_nametag': return /office/.test(hay) && /name|tag/.test(hay);
    case 'itsco_lanyard': return /lanyard/.test(hay);
    case 'business_cards': return /business/.test(hay) && /card/.test(hay);
    case 'shirt': return /shirt|polo|t-?shirt/.test(hay);
    case 'canvas_bag': return /bag|canvas/.test(hay);
    default: return false;
  }
}

function statusLabel(status) {
  if (status === 'issued') return 'Issued';
  if (status === 'has') return 'Has one';
  if (status === 'requested') return 'Requested';
  return 'Not set';
}

const gearRequestRows = computed(() => {
  const items = prefs.value.gear_items || {};
  return GEAR_ITEM_ORDER.map((key) => {
    const issued = (assignments.value || []).find((a) => assignmentMatchesGearKey(a, key));
    if (issued) {
      return {
        key,
        label: GEAR_ITEM_LABELS[key] || key,
        status: 'issued',
        statusLabel: statusLabel('issued'),
        detail: issued.displayLabel || issued.assetCode || issued.sizeLabel || issued.typeName || '',
      };
    }
    const saved = items[key];
    if (saved?.status && saved.status !== 'unknown') {
      return {
        key,
        label: saved.label || GEAR_ITEM_LABELS[key] || key,
        status: saved.status,
        statusLabel: saved.statusLabel || statusLabel(saved.status),
        detail: saved.detail || '',
      };
    }
    return {
      key,
      label: GEAR_ITEM_LABELS[key] || key,
      status: 'unknown',
      statusLabel: statusLabel('unknown'),
      detail: '',
    };
  }).filter((r) => r.status !== 'unknown');
});

const base = () => `/gear-inventory/${props.agencyId}`;

function prefsKey(p = prefs.value) {
  return JSON.stringify({
    shirt: String(p.shirt || '').trim(),
    hoodie: String(p.hoodie || '').trim(),
    pants: String(p.pants || '').trim(),
    other: String(p.other || '').trim(),
    has_office_key: String(p.has_office_key || '').trim(),
    needs_office_key: Boolean(p.needs_office_key),
    has_shirt: String(p.has_shirt || '').trim(),
    needs_shirt: Boolean(p.needs_shirt),
    shirt_gender: String(p.shirt_gender || '').trim(),
    shirt_secondary: String(p.shirt_secondary || '').trim(),
  });
}

function fmtDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

async function load({ initial = false } = {}) {
  if (!props.agencyId || !props.userId) return;
  if (initial || !hasLoadedOnce.value) bootstrapping.value = true;
  error.value = '';
  try {
    const [aRes, tRes, pRes] = await Promise.all([
      api.get(`${base()}/users/${props.userId}/assignments`, { params: { activeOnly: true }, ...quiet }),
      api.get(`${base()}/types`, quiet),
      api.get(`${base()}/users/${props.userId}/preferences`, quiet),
    ]);
    assignments.value = Array.isArray(aRes.data) ? aRes.data : [];
    types.value = Array.isArray(tRes.data) ? tRes.data : [];
    const p = pRes.data?.preferences || {};
    prefs.value = {
      shirt: p.shirt || '',
      hoodie: p.hoodie || '',
      pants: p.pants || '',
      other: p.other || '',
      gear_items: p.gear_items && typeof p.gear_items === 'object' ? p.gear_items : {},
      has_office_key: p.has_office_key || '',
      needs_office_key: Boolean(p.needs_office_key),
      has_shirt: p.has_shirt || '',
      needs_shirt: Boolean(p.needs_shirt),
      shirt_gender: p.shirt_gender || '',
      shirt_secondary: p.shirt_secondary || '',
    };
    prefsSnapshot.value = prefsKey();
    hasLoadedOnce.value = true;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to load gear';
  } finally {
    bootstrapping.value = false;
  }
}

async function savePrefs() {
  if (props.viewOnly || !props.agencyId || prefsSaving.value) return;
  const next = prefsKey();
  if (next === prefsSnapshot.value) return;
  prefsSaving.value = true;
  try {
    await api.put(
      `${base()}/users/${props.userId}/preferences`,
      { preferences: { ...prefs.value } },
      quiet
    );
    prefsSnapshot.value = next;
    prefsSaved.value = true;
    setTimeout(() => { prefsSaved.value = false; }, 2000);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save sizes';
  } finally {
    prefsSaving.value = false;
  }
}

function openIssue() {
  issueForm.value = { gearItemTypeId: 0, gender: '', sizeLabel: '', uniqueAssetId: 0, notes: '' };
  issuable.value = null;
  issueError.value = '';
  showIssue.value = true;
}

async function onTypeChange() {
  const tid = issueForm.value.gearItemTypeId;
  issuable.value = null;
  issueForm.value.gender = '';
  issueForm.value.sizeLabel = '';
  issueForm.value.uniqueAssetId = 0;
  if (!tid) return;
  try {
    const res = await api.get(`${base()}/types/${tid}/issuable`, quiet);
    issuable.value = res.data;
    if (issuable.value?.trackingMode === 'SIZED_STOCK' && !issuable.value?.isGendered) {
      const preferred = prefs.value.hoodie || prefs.value.shirt || '';
      const match = (issuable.value.sizes || []).find(
        (s) => String(s.sizeLabel).toLowerCase() === String(preferred).toLowerCase()
      );
      if (match) issueForm.value.sizeLabel = match.sizeLabel;
    }
  } catch (e) {
    issueError.value = e?.response?.data?.error?.message || 'Failed to load options';
  }
}

function onGenderChange() {
  issueForm.value.sizeLabel = '';
  const preferred = prefs.value.hoodie || prefs.value.shirt || '';
  const match = filteredIssuableSizes.value.find(
    (s) => String(s.sizeLabel).toLowerCase() === String(preferred).toLowerCase()
  );
  if (match) issueForm.value.sizeLabel = match.sizeLabel;
}

async function submitIssue() {
  issuing.value = true;
  issueError.value = '';
  try {
    const payload = {
      gearItemTypeId: issueForm.value.gearItemTypeId,
      notes: issueForm.value.notes || null,
    };
    if (issuable.value?.trackingMode === 'SIZED_STOCK') {
      payload.sizeLabel = issueForm.value.sizeLabel;
      if (issuable.value.isGendered) payload.gender = issueForm.value.gender;
    } else {
      payload.uniqueAssetId = issueForm.value.uniqueAssetId || null;
    }
    await api.post(`${base()}/users/${props.userId}/issue`, payload, quiet);
    showIssue.value = false;
    await load();
    emit('changed');
  } catch (e) {
    issueError.value = e?.response?.data?.error?.message || 'Issue failed';
  } finally {
    issuing.value = false;
  }
}

async function returnItem(a) {
  if (!confirm(`Return ${a.typeName}${a.assetCode || a.sizeLabel ? ` (${a.assetCode || a.sizeLabel})` : ''}?`)) return;
  returningId.value = a.id;
  try {
    await api.post(`${base()}/assignments/${a.id}/return`, {}, quiet);
    await load();
    emit('changed');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Return failed';
  } finally {
    returningId.value = null;
  }
}

watch(() => [props.agencyId, props.userId], () => { void load({ initial: true }); });
onMounted(() => { void load({ initial: true }); });
</script>

<style scoped>
.lc-gear { margin-bottom: 20px; }
.lc-gear-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.lc-gear-prefs {
  background: #f8faf9;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.lc-gear-prefs-label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.lc-gear-access-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.lc-gear-requests {
  display: grid;
  gap: 6px;
  margin-bottom: 4px;
}
.lc-gear-request-row {
  display: grid;
  grid-template-columns: 1.2fr auto 1fr;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}
.lc-gear-request-name {
  font-weight: 500;
  color: #374151;
}
.lc-gear-request-detail {
  color: #6b7280;
  font-size: 12px;
}
.lc-gear-access-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: #f3f4f6;
  color: #4b5563;
}
.lc-gear-access-pill--ok {
  background: #dcfce7;
  color: #166534;
}
.lc-gear-access-pill--need {
  background: #fef3c7;
  color: #92400e;
}
.lc-gear-access-pill--shirt {
  background: #e0f2fe;
  color: #075985;
}
.lc-gear-prefs-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.lc-gear-pref {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #374151;
}
.lc-gear-pref-input {
  width: 72px;
  padding: 5px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
}
.lc-gear-table {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
}
.lc-gear-thead,
.lc-gear-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 90px 72px;
  gap: 8px;
  padding: 8px 12px;
  align-items: center;
  font-size: 13px;
}
.lc-gear-thead {
  background: #f3f4f6;
  font-weight: 600;
  font-size: 12px;
  color: #6b7280;
}
.lc-gear-row { border-top: 1px solid #f3f4f6; }
.lc-gear-name { font-weight: 500; }
.lc-gear-empty {
  padding: 14px 12px;
  color: #9ca3af;
  font-size: 13px;
}
.lc-gear-return {
  background: none;
  border: none;
  color: #0f766e;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.lc-gear-return:disabled { opacity: 0.5; cursor: default; }
.lc-gear-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
  padding: 16px;
}
.lc-gear-modal {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  width: min(420px, 100%);
  box-shadow: 0 12px 40px rgba(0,0,0,0.18);
}
.lc-gear-modal h3 { margin: 0 0 14px; font-size: 18px; }
.lc-gear-lbl {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  margin: 10px 0 4px;
}
.lc-gear-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}
.lc-gear-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
