<template>
  <div class="pkg-admin container">
    <div class="page-header">
      <div>
        <h1>Session packages</h1>
        <p class="subtitle">
          Build your catalog (e.g. 10 packages). When sending a post-discovery packet, offer only a subset to that client.
          Each package has its own session count, missed-session policy, and payment settings.
        </p>
      </div>
      <button type="button" class="btn btn-primary" @click="startCreate">+ New package</button>
    </div>

    <div v-if="loading" class="card">Loading…</div>
    <div v-else-if="error" class="card err">{{ error }}</div>

    <div v-else class="list">
      <div v-for="pkg in packages" :key="pkg.id" class="card pkg-card" :class="{ inactive: !pkg.is_active }">
        <div class="pkg-head">
          <div>
            <h3>{{ pkg.name }}</h3>
            <p class="meta">{{ pkg.session_count }} sessions · {{ formatMoney(pkg.price_cents) }}</p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" @click="edit(pkg)">Edit</button>
        </div>
        <p v-if="pkg.description" class="desc">{{ pkg.description }}</p>
        <div class="chips">
          <span>Pay default: {{ pkg.payment_mode_default }}</span>
          <span>Missed: {{ pkg.missed_session_policy?.type || 'forfeit' }}</span>
          <span v-if="!pkg.is_active">Inactive</span>
        </div>
      </div>
      <p v-if="!packages.length" class="muted">No packages yet. Create your first session package.</p>
    </div>

    <div v-if="formOpen" class="modal-backdrop" @click.self="formOpen = false">
      <div class="modal-card">
        <h3>{{ editingId ? 'Edit package' : 'New package' }}</h3>

        <label>Name<input v-model="form.name" type="text" /></label>
        <label>Description<textarea v-model="form.description" rows="2" /></label>
        <div class="row2">
          <label># of sessions<input v-model.number="form.sessionCount" type="number" min="1" /></label>
          <label>List price ($)<input v-model.number="form.priceDollars" type="number" min="0" step="0.01" /></label>
        </div>

        <h4>Payment settings</h4>
        <label>Default payment mode
          <select v-model="form.paymentModeDefault">
            <option value="PAY_IN_FULL">Pay in full</option>
            <option value="INSTALLMENTS">Installments</option>
            <option value="PER_SESSION">Pay per session</option>
          </select>
        </label>
        <div class="toggles">
          <label><input v-model="form.allowFull" type="checkbox" /> Allow pay in full</label>
          <label><input v-model="form.allowInstallments" type="checkbox" /> Allow installments</label>
          <label><input v-model="form.allowPerSession" type="checkbox" /> Allow per session</label>
        </div>
        <div class="row2">
          <label>Pay-in-full total ($)<input v-model.number="form.payInFullDollars" type="number" min="0" step="0.01" placeholder="optional discount total" /></label>
          <label>Pay-in-full discount ($)<input v-model.number="form.payInFullDiscountDollars" type="number" min="0" step="0.01" /></label>
        </div>
        <div class="row2">
          <label>Installment chunks<input v-model.number="form.installmentChunks" type="number" min="2" max="24" /></label>
          <label>Days between chunks<input v-model.number="form.installmentIntervalDays" type="number" min="1" /></label>
        </div>
        <label>Per-session price ($)<input v-model.number="form.perSessionDollars" type="number" min="0" step="0.01" /></label>

        <h4>Missed-session policy</h4>
        <label>Policy type
          <select v-model="form.missedType">
            <option value="forfeit">Forfeit 1 session credit</option>
            <option value="free_rebook">Free rebooking(s)</option>
            <option value="fee">Charge a fee</option>
            <option value="custom">Custom (note only for now)</option>
          </select>
        </label>
        <div class="row2">
          <label>Free rebooks included<input v-model.number="form.freeRebooks" type="number" min="0" /></label>
          <label>Missed fee ($)<input v-model.number="form.missedFeeDollars" type="number" min="0" step="0.01" /></label>
        </div>
        <label>Policy note<textarea v-model="form.missedNote" rows="2" /></label>

        <label class="toggle"><input v-model="form.isActive" type="checkbox" /> Active in catalog</label>

        <p v-if="saveError" class="err">{{ saveError }}</p>
        <div class="actions">
          <button type="button" class="btn btn-secondary" @click="formOpen = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Save package' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();
const agencyId = () => Number(agencyStore.currentAgency?.id || agencyStore.currentAgency?.value?.id || 0);

const loading = ref(true);
const error = ref('');
const packages = ref([]);
const formOpen = ref(false);
const editingId = ref(null);
const saving = ref(false);
const saveError = ref('');

const blankForm = () => ({
  name: '',
  description: '',
  sessionCount: 4,
  priceDollars: 0,
  paymentModeDefault: 'PAY_IN_FULL',
  allowFull: true,
  allowInstallments: true,
  allowPerSession: true,
  payInFullDollars: null,
  payInFullDiscountDollars: null,
  installmentChunks: 4,
  installmentIntervalDays: 30,
  perSessionDollars: null,
  missedType: 'forfeit',
  freeRebooks: 0,
  missedFeeDollars: 0,
  missedNote: '',
  isActive: true
});
const form = ref(blankForm());

function formatMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(Number(cents || 0) % 100 === 0 ? 0 : 2)}`;
}
function dollarsToCents(v) {
  if (v == null || v === '') return null;
  return Math.round(Number(v) * 100);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/practitioner-packages/packages', {
      params: { agencyId: agencyId(), includeInactive: 1 }
    });
    packages.value = res.data?.packages || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load packages';
  } finally {
    loading.value = false;
  }
}

function startCreate() {
  editingId.value = null;
  form.value = blankForm();
  formOpen.value = true;
  saveError.value = '';
}

function edit(pkg) {
  editingId.value = pkg.id;
  const modes = pkg.allowed_payment_modes || [];
  form.value = {
    name: pkg.name,
    description: pkg.description || '',
    sessionCount: pkg.session_count,
    priceDollars: (pkg.price_cents || 0) / 100,
    paymentModeDefault: pkg.payment_mode_default || 'PAY_IN_FULL',
    allowFull: modes.includes('PAY_IN_FULL'),
    allowInstallments: modes.includes('INSTALLMENTS'),
    allowPerSession: modes.includes('PER_SESSION'),
    payInFullDollars: pkg.pay_in_full_price_cents == null ? null : pkg.pay_in_full_price_cents / 100,
    payInFullDiscountDollars:
      pkg.pay_in_full_discount_cents == null ? null : pkg.pay_in_full_discount_cents / 100,
    installmentChunks: pkg.installment_plan?.chunks || 4,
    installmentIntervalDays: pkg.installment_plan?.intervalDays || 30,
    perSessionDollars: pkg.per_session_price_cents == null ? null : pkg.per_session_price_cents / 100,
    missedType: pkg.missed_session_policy?.type || 'forfeit',
    freeRebooks: pkg.missed_session_policy?.freeRebooks || 0,
    missedFeeDollars: (pkg.missed_session_policy?.feeCents || 0) / 100,
    missedNote: pkg.missed_session_policy?.note || '',
    isActive: !!pkg.is_active
  };
  formOpen.value = true;
  saveError.value = '';
}

async function save() {
  saving.value = true;
  saveError.value = '';
  try {
    const allowedPaymentModes = [];
    if (form.value.allowFull) allowedPaymentModes.push('PAY_IN_FULL');
    if (form.value.allowInstallments) allowedPaymentModes.push('INSTALLMENTS');
    if (form.value.allowPerSession) allowedPaymentModes.push('PER_SESSION');
    const payload = {
      agencyId: agencyId(),
      name: form.value.name,
      description: form.value.description,
      sessionCount: form.value.sessionCount,
      priceCents: dollarsToCents(form.value.priceDollars) || 0,
      paymentModeDefault: form.value.paymentModeDefault,
      payInFullPriceCents: dollarsToCents(form.value.payInFullDollars),
      payInFullDiscountCents: dollarsToCents(form.value.payInFullDiscountDollars),
      installmentPlan: form.value.allowInstallments
        ? { chunks: form.value.installmentChunks, intervalDays: form.value.installmentIntervalDays }
        : null,
      perSessionPriceCents: dollarsToCents(form.value.perSessionDollars),
      allowedPaymentModes,
      missedSessionPolicy: {
        type: form.value.missedType,
        freeRebooks: form.value.freeRebooks,
        feeCents: dollarsToCents(form.value.missedFeeDollars) || 0,
        note: form.value.missedNote
      },
      isActive: form.value.isActive
    };
    if (editingId.value) {
      await api.put(`/practitioner-packages/packages/${editingId.value}`, payload);
    } else {
      await api.post('/practitioner-packages/packages', payload);
    }
    formOpen.value = false;
    await load();
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || e.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.pkg-admin { padding: 1.5rem; max-width: 900px; display: grid; gap: 1rem; }
.page-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
.page-header h1 { margin: 0 0 0.25rem; font-size: 1.45rem; }
.subtitle { margin: 0; color: #64748b; font-size: 0.88rem; max-width: 40rem; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 1rem; }
.list { display: grid; gap: 0.75rem; }
.pkg-card.inactive { opacity: 0.6; }
.pkg-head { display: flex; justify-content: space-between; gap: 0.75rem; align-items: flex-start; }
.pkg-head h3 { margin: 0; }
.meta { margin: 0.2rem 0 0; color: #64748b; font-size: 0.85rem; }
.desc { color: #475569; font-size: 0.88rem; }
.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.chips span { font-size: 0.72rem; background: #f1f5f9; border-radius: 999px; padding: 0.2rem 0.55rem; color: #334155; }
.muted { color: #94a3b8; }
.err { color: #b91c1c; }
.btn { border: none; border-radius: 8px; padding: 0.45rem 0.85rem; font-weight: 600; cursor: pointer; }
.btn-primary { background: #1b4332; color: #fff; }
.btn-secondary { background: #fff; border: 1px solid #d1d5db; color: #334155; }
.btn-sm { font-size: 0.8rem; padding: 0.3rem 0.6rem; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: grid; place-items: center; z-index: 80; padding: 1rem; }
.modal-card { width: min(560px, 100%); max-height: 90vh; overflow: auto; background: #fff; border-radius: 14px; padding: 1.1rem; display: grid; gap: 0.55rem; }
.modal-card h3, .modal-card h4 { margin: 0.35rem 0 0; }
.modal-card label { display: grid; gap: 0.25rem; font-size: 0.8rem; font-weight: 700; color: #475569; }
.modal-card input, .modal-card textarea, .modal-card select { border: 1px solid #d1d5db; border-radius: 8px; padding: 0.4rem 0.55rem; font: inherit; font-weight: 500; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.55rem; }
.toggles { display: grid; gap: 0.25rem; }
.toggles label, .toggle { display: flex !important; flex-direction: row !important; align-items: center; gap: 0.4rem; font-weight: 600 !important; }
.actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.35rem; }
@media (max-width: 640px) { .row2 { grid-template-columns: 1fr; } }
</style>
