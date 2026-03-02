<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal budget-submit-modal">
      <div class="modal-header">
        <h2>Submit Budget Expenses</h2>
        <button type="button" class="btn-close" @click="$emit('close')" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <p class="muted" style="margin-bottom: 16px;">Add receipts or manual entries. Department, account, category, business purpose, and place are required.</p>

        <div v-for="(row, idx) in rows" :key="row.id" class="expense-row">
          <div class="row-header">
            <span class="row-num">Expense {{ idx + 1 }}</span>
            <button v-if="rows.length > 1" type="button" class="btn btn-danger btn-sm" @click="removeRow(idx)">Remove</button>
          </div>
          <div class="row-fields">
            <div class="field full-width">
              <label>Expense type</label>
              <select v-model="row.expenseType">
                <option value="receipt">Receipt</option>
                <option value="mileage">Mileage</option>
              </select>
            </div>
            <template v-if="row.expenseType === 'receipt'">
              <div class="field">
                <label>Receipt</label>
                <div class="receipt-actions">
                  <button type="button" class="btn btn-secondary btn-sm" @click="triggerFileInput(row)">{{ row.receiptFile ? 'Replace' : 'Add receipt' }}</button>
                  <span v-if="row.ocrLoading" class="muted">Extracting…</span>
                  <span v-else-if="row.receiptFile" class="muted">{{ row.receiptFile.name }}</span>
                </div>
              </div>
              <div class="field">
                <label>Vendor</label>
                <input v-model="row.vendor" type="text" placeholder="Vendor name" />
              </div>
              <div class="field">
                <label>Date</label>
                <input v-model="row.expenseDate" type="date" />
              </div>
              <div class="field">
                <label>Amount ($)</label>
                <input v-model.number="row.amount" type="number" min="0" step="0.01" />
              </div>
            </template>
            <template v-else>
              <div class="field full-width">
                <label>Start address</label>
                <input v-model="row.mileageOrigin" type="text" placeholder="e.g. 123 Main St, City" />
              </div>
              <div class="field full-width" v-for="(dest, di) in row.mileageDestinations" :key="di">
                <label>Destination {{ di + 1 }}</label>
                <div class="dest-row">
                  <input v-model="row.mileageDestinations[di]" type="text" placeholder="Address" />
                  <button type="button" class="btn btn-danger btn-sm" @click="removeMileageDest(row, di)">Remove</button>
                </div>
              </div>
              <div class="field full-width">
                <button type="button" class="btn btn-secondary btn-sm" @click="addMileageDest(row)">Add destination</button>
              </div>
              <div class="field">
                <label>Round trip?</label>
                <label class="checkbox-label"><input v-model="row.mileageRoundTrip" type="checkbox" /> Yes</label>
              </div>
              <div class="field">
                <label>Miles</label>
                <input v-model="row.mileageMiles" type="text" readonly placeholder="Click Calculate" />
              </div>
              <div class="field">
                <label>Amount ($)</label>
                <input v-model.number="row.amount" type="number" min="0" step="0.01" placeholder="Click Calculate" />
              </div>
              <div class="field full-width">
                <button type="button" class="btn btn-primary btn-sm" :disabled="row.mileageLoading || !row.mileageOrigin || !row.mileageDestinations[0]" @click="calculateMileage(row)">
                  {{ row.mileageLoading ? 'Calculating…' : 'Calculate' }}
                </button>
                <span v-if="row.mileageError" class="muted" style="margin-left: 8px;">{{ row.mileageError }}</span>
              </div>
              <div class="field">
                <label>Date</label>
                <input v-model="row.expenseDate" type="date" />
              </div>
            </template>
            <div class="field full-width">
              <label>Department</label>
              <select v-model="row.departmentId" @change="onDepartmentChange(row)">
                <option value="">Select…</option>
                <option v-for="d in departments" :key="d.id" :value="String(d.id)">{{ d.name }}</option>
              </select>
            </div>
            <div class="field full-width">
              <label>Account</label>
              <select v-model="row.accountId">
                <option value="">Select department first</option>
                <option v-for="a in accountsForDepartment(row.departmentId)" :key="a.id" :value="String(a.id)">{{ a.account_number }}: {{ a.label }}</option>
              </select>
            </div>
            <div class="field full-width">
              <label>Expense Category</label>
              <select v-model="row.expenseCategoryId">
                <option value="">Select…</option>
                <option v-for="c in expenseCategories" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
              </select>
            </div>
            <div class="field full-width">
              <label>Business Purpose</label>
              <select v-model="row.businessPurposeId">
                <option value="">— None —</option>
                <option v-for="p in businessPurposes" :key="p.id" :value="String(p.id)">{{ p.name }}</option>
              </select>
            </div>
            <div class="field full-width">
              <label>Place (required)</label>
              <input v-model="row.place" type="text" placeholder="e.g. Office, Client site" />
            </div>
            <div class="field full-width">
              <label>Notes</label>
              <input v-model="row.notes" type="text" placeholder="Optional" />
            </div>
          </div>
        </div>

        <button type="button" class="btn btn-secondary" @click="addRow" style="margin-top: 12px;">Add another expense</button>

        <div v-if="submitError" class="error-box" style="margin-top: 16px;">{{ submitError }}</div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="submitting || !canSubmit" @click="submit">
          {{ submitting ? 'Submitting…' : 'Submit' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  show: { type: Boolean, default: true }
});

const emit = defineEmits(['close', 'submitted']);

const departments = ref([]);
const accountsByDept = ref({});
const expenseCategories = ref([]);
const businessPurposes = ref([]);

const rows = ref([createEmptyRow()]);
let rowIdCounter = 0;

function createEmptyRow() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: ++rowIdCounter,
    expenseType: 'receipt',
    vendor: '',
    expenseDate: today,
    amount: null,
    departmentId: '',
    accountId: '',
    expenseCategoryId: '',
    businessPurposeId: '',
    place: '',
    notes: '',
    receiptFile: null,
    receiptBase64: null,
    ocrLoading: false,
    mileageOrigin: '',
    mileageDestinations: [''],
    mileageRoundTrip: false,
    mileageMiles: null,
    mileageRate: null,
    mileageLegs: null,
    mileageLoading: false,
    mileageError: ''
  };
}

const submitError = ref('');
const submitting = ref(false);

const accountsForDepartment = (deptId) => {
  if (!deptId) return [];
  return accountsByDept.value[deptId] || [];
};

const canSubmit = computed(() => {
  return rows.value.every((r) => {
    const amt = Number(r.amount);
    return (
      r.departmentId &&
      r.accountId &&
      r.expenseCategoryId &&
      r.place &&
      Number.isFinite(amt) &&
      amt >= 0
    );
  });
});

async function loadData() {
  if (!props.agencyId) return;
  try {
    const [deptRes, catRes, bpRes] = await Promise.all([
      api.get(`/agencies/${props.agencyId}/departments`),
      api.get(`/budget/agencies/${props.agencyId}/expense-categories`),
      api.get(`/budget/agencies/${props.agencyId}/business-purposes`)
    ]);
    departments.value = deptRes.data || [];
    expenseCategories.value = catRes.data || [];
    businessPurposes.value = bpRes.data || [];
    const accMap = {};
    for (const d of departments.value) {
      const { data } = await api.get(`/budget/departments/${d.id}/accounts`);
      accMap[d.id] = data || [];
    }
    accountsByDept.value = accMap;
  } catch (e) {
    console.error('Failed to load budget data:', e);
  }
}

watch(() => props.agencyId, loadData, { immediate: true });
watch(() => props.show, (v) => {
  if (v) loadData();
});

function addRow() {
  rows.value.push(createEmptyRow());
}

function removeRow(idx) {
  rows.value.splice(idx, 1);
}

function onDepartmentChange(row) {
  row.accountId = '';
}

function addMileageDest(row) {
  row.mileageDestinations.push('');
}

function removeMileageDest(row, idx) {
  row.mileageDestinations.splice(idx, 1);
}

async function calculateMileage(row) {
  const origin = String(row.mileageOrigin || '').trim();
  const dests = (row.mileageDestinations || []).map((d) => String(d || '').trim()).filter(Boolean);
  if (!origin || !dests.length) return;
  row.mileageLoading = true;
  row.mileageError = '';
  try {
    const params = new URLSearchParams({
      agencyId: props.agencyId,
      origin,
      roundTrip: row.mileageRoundTrip ? 'true' : 'false'
    });
    dests.forEach((d) => params.append('destinations', d));
    const { data } = await api.get(`/budget/mileage/calculate?${params}`);
    row.mileageMiles = data.miles;
    row.amount = data.amount;
    row.mileageRate = data.ratePerMile;
    row.mileageLegs = data.legs || null;
  } catch (e) {
    row.mileageError = e.response?.data?.error?.message || e.message || 'Failed';
  } finally {
    row.mileageLoading = false;
  }
}

function triggerFileInput(row) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,application/pdf';
  input.onchange = (e) => onFileSelect(e, row);
  input.click();
}

async function onFileSelect(ev, row) {
  const file = ev.target?.files?.[0];
  if (!file) return;
  row.receiptFile = file;
  row.ocrLoading = true;
  try {
    const formData = new FormData();
    formData.append('receipt', file);
    formData.append('agencyId', props.agencyId);
    const { data } = await api.post('/budget/expenses/ocr', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    if (data?.vendor) row.vendor = data.vendor;
    if (data?.date) row.expenseDate = data.date;
    if (data?.amount != null) row.amount = data.amount;
  } catch (e) {
    console.error('OCR failed:', e);
  } finally {
    row.ocrLoading = false;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const b64 = reader.result?.split(',')?.[1];
    if (b64) row.receiptBase64 = b64;
  };
  reader.readAsDataURL(file);
}

async function submit() {
  if (!canSubmit.value || !props.agencyId) return;
  submitting.value = true;
  submitError.value = '';
  try {
    const expenses = rows.value.map((r) => {
      const base = {
        departmentId: parseInt(r.departmentId, 10),
        accountId: parseInt(r.accountId, 10),
        expenseCategoryId: parseInt(r.expenseCategoryId, 10),
        businessPurposeId: r.businessPurposeId ? parseInt(r.businessPurposeId, 10) : null,
        place: r.place,
        amount: Number(r.amount) || 0,
        expenseDate: r.expenseDate,
        vendor: r.vendor || null,
        notes: r.notes || null
      };
      if (r.expenseType === 'receipt' && r.receiptBase64 && r.receiptFile) {
        base.receiptFile = { base64: r.receiptBase64, filename: r.receiptFile.name, mimeType: r.receiptFile.type };
      }
      if (r.expenseType === 'mileage' && r.mileageLegs?.length) {
        base.mileageLegs = r.mileageLegs;
        base.mileageMiles = Number(r.mileageMiles);
        base.mileageRate = Number(r.mileageRate);
      }
      return base;
    });
    await api.post(`/budget/agencies/${props.agencyId}/expenses`, { expenses });
    emit('submitted');
    emit('close');
  } catch (e) {
    submitError.value = e.response?.data?.error?.message || e.message || 'Failed to submit';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.budget-submit-modal {
  background: var(--bg-card, #fff);
  border-radius: 8px;
  max-width: 720px;
  width: 95%;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #ddd);
}
.modal-header h2 { margin: 0; font-size: 1.25rem; }
.btn-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; opacity: 0.7; }
.btn-close:hover { opacity: 1; }
.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color, #ddd);
}
.expense-row {
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
.row-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.row-num { font-weight: 600; }
.row-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.field.full-width { grid-column: 1 / -1; }
.field label { display: block; font-size: 0.85rem; margin-bottom: 4px; color: var(--text-muted, #666); }
.field input, .field select { width: 100%; padding: 8px; }
.hidden { display: none; }
.checkbox-label { display: flex; align-items: center; gap: 8px; }
.dest-row { display: flex; gap: 8px; align-items: center; }
.dest-row input { flex: 1; }
</style>
