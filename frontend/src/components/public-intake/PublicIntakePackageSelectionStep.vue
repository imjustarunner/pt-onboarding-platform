<template>
  <div class="pi-pkg">
    <p class="pi-pkg-lead">
      {{ tx('Choose the package that best fits your needs. You can review insurance and payment details on the next step.') }}
    </p>

    <div v-if="loading" class="pi-pkg-loading">{{ tx('Loading packages…') }}</div>
    <div v-else-if="error" class="pi-pkg-error">{{ error }}</div>
    <div v-else-if="!packages.length" class="pi-pkg-empty">
      {{ tx('No public packages are listed for this enrollment right now. Continue to insurance and payment.') }}
    </div>

    <div v-else class="pi-pkg-grid">
      <button
        v-for="pkg in packages"
        :key="pkg.id"
        type="button"
        class="pi-pkg-card"
        :class="{ 'pi-pkg-card--selected': Number(selectedId) === Number(pkg.id) }"
        @click="selectPackage(pkg)"
      >
        <div class="pi-pkg-card-top">
          <strong>{{ pkg.name }}</strong>
          <span class="pi-pkg-price">{{ formatPrice(pkg.priceCents) }}</span>
        </div>
        <p v-if="pkg.description" class="pi-pkg-desc">{{ pkg.description }}</p>
        <div class="pi-pkg-meta">
          <span v-if="pkg.sessionCount">{{ pkg.sessionCount }} {{ pkg.sessionCount === 1 ? tx('session') : tx('sessions') }}</span>
          <span v-if="pkg.paymentMode">{{ formatPaymentMode(pkg.paymentMode) }}</span>
        </div>
      </button>
    </div>

    <p v-if="validationError" class="pi-pkg-error">{{ validationError }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  publicKey: { type: String, required: true },
  translations: { type: Object, default: () => ({}) },
  requireSelection: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue', 'packages-loaded', 'empty-catalog']);

function tx(key) {
  const t = props.translations || {};
  return t[key] || key;
}

const loading = ref(false);
const error = ref('');
const packages = ref([]);
const selectedId = ref(props.modelValue?.selectedPackageId || null);
const validationError = ref('');

const selectedPackage = computed(() =>
  packages.value.find((p) => Number(p.id) === Number(selectedId.value)) || null
);

function formatPrice(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function formatPaymentMode(mode) {
  const m = String(mode || '').toUpperCase();
  if (m === 'PAY_IN_FULL') return tx('Pay in full');
  if (m === 'MANUAL' || m === 'OFFLINE') return tx('Pay offline / staff');
  if (m === 'FREE') return tx('Free');
  return mode;
}

function emitSelection(pkg) {
  emit('update:modelValue', {
    ...(props.modelValue || {}),
    selectedPackageId: pkg ? Number(pkg.id) : null,
    selectedPackage: pkg
      ? {
          id: pkg.id,
          name: pkg.name,
          description: pkg.description,
          sessionCount: pkg.sessionCount,
          priceCents: pkg.priceCents,
          paymentMode: pkg.paymentMode,
          businessType: pkg.businessType
        }
      : null
  });
}

function selectPackage(pkg) {
  selectedId.value = pkg.id;
  validationError.value = '';
  emitSelection(pkg);
}

async function loadPackages() {
  if (!props.publicKey) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/public-intake/${props.publicKey}/packages`);
    packages.value = res.data?.packages || [];
    emit('packages-loaded', {
      packages: packages.value,
      paymentOnly: !!res.data?.paymentOnly,
      businessType: res.data?.businessType || null
    });
    if (!packages.value.length) {
      emit('empty-catalog');
      emitSelection(null);
    } else if (selectedId.value) {
      const match = packages.value.find((p) => Number(p.id) === Number(selectedId.value));
      if (match) emitSelection(match);
      else {
        selectedId.value = null;
        emitSelection(null);
      }
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || tx('Failed to load packages');
    packages.value = [];
    emit('empty-catalog');
  } finally {
    loading.value = false;
  }
}

function validate() {
  validationError.value = '';
  if (!props.requireSelection) return true;
  if (!packages.value.length) return true;
  if (!selectedId.value) {
    validationError.value = tx('Please select a package to continue.');
    return false;
  }
  return true;
}

watch(
  () => props.modelValue?.selectedPackageId,
  (v) => {
    if (v != null && Number(v) !== Number(selectedId.value)) selectedId.value = v;
  }
);

onMounted(loadPackages);

defineExpose({ validate, selectedPackage, packages, reload: loadPackages });
</script>

<style scoped>
.pi-pkg { display: grid; gap: 14px; }
.pi-pkg-lead { margin: 0; color: var(--text-secondary, #64748b); font-size: 0.95rem; line-height: 1.45; }
.pi-pkg-loading, .pi-pkg-empty { color: var(--text-secondary, #64748b); font-size: 0.9rem; }
.pi-pkg-error { color: #b91c1c; font-size: 0.88rem; margin: 0; }
.pi-pkg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.pi-pkg-card {
  text-align: left;
  border: 2px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: #fff;
  padding: 14px 16px;
  cursor: pointer;
  display: grid;
  gap: 8px;
  transition: border-color 0.12s, box-shadow 0.12s, background 0.12s;
}
.pi-pkg-card:hover { border-color: #94a3b8; }
.pi-pkg-card--selected {
  border-color: var(--primary, #2563eb);
  background: #eff6ff;
  box-shadow: 0 0 0 1px var(--primary, #2563eb);
}
.pi-pkg-card-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.pi-pkg-price { font-weight: 800; color: var(--primary, #1d4ed8); white-space: nowrap; }
.pi-pkg-desc { margin: 0; font-size: 0.85rem; color: #475569; line-height: 1.4; }
.pi-pkg-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
</style>
