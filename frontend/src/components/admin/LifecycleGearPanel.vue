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
        <div class="lc-gear-prefs-label">Preferred sizes</div>
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
          <span>{{ a.assetCode || a.sizeLabel || '—' }}</span>
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
          <label class="lc-gear-lbl">Size</label>
          <select v-model="issueForm.sizeLabel" class="lc-gear-input">
            <option value="">Select…</option>
            <option v-for="s in issuable.sizes || []" :key="s.sizeLabel" :value="s.sizeLabel">
              {{ s.sizeLabel }} ({{ s.quantityOnHand }} on hand)
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
import { ref, watch, onMounted } from 'vue';
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
const prefs = ref({ shirt: '', hoodie: '', pants: '', other: '' });
const prefsSnapshot = ref('');
const prefsSaved = ref(false);
const prefsSaving = ref(false);

const showIssue = ref(false);
const issuing = ref(false);
const issueError = ref('');
const issuable = ref(null);
const issueForm = ref({ gearItemTypeId: 0, sizeLabel: '', uniqueAssetId: 0, notes: '' });
const returningId = ref(null);

const base = () => `/gear-inventory/${props.agencyId}`;

function prefsKey(p = prefs.value) {
  return JSON.stringify({
    shirt: String(p.shirt || '').trim(),
    hoodie: String(p.hoodie || '').trim(),
    pants: String(p.pants || '').trim(),
    other: String(p.other || '').trim(),
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
  issueForm.value = { gearItemTypeId: 0, sizeLabel: '', uniqueAssetId: 0, notes: '' };
  issuable.value = null;
  issueError.value = '';
  showIssue.value = true;
}

async function onTypeChange() {
  const tid = issueForm.value.gearItemTypeId;
  issuable.value = null;
  issueForm.value.sizeLabel = '';
  issueForm.value.uniqueAssetId = 0;
  if (!tid) return;
  try {
    const res = await api.get(`${base()}/types/${tid}/issuable`, quiet);
    issuable.value = res.data;
    if (issuable.value?.trackingMode === 'SIZED_STOCK') {
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
