<template>
  <div class="csb" data-testid="clinical-session-body">
    <div class="csb-row">
      <label class="csb-label">Modality</label>
      <div class="csb-toggles">
        <button
          type="button"
          class="csb-chip"
          :class="{ on: modality === 'TELEHEALTH' }"
          :disabled="disabled"
          @click="emit('update:modality', 'TELEHEALTH')"
        >
          Virtual
        </button>
        <button
          type="button"
          class="csb-chip"
          :class="{ on: modality === 'IN_PERSON' }"
          :disabled="disabled"
          @click="emit('update:modality', 'IN_PERSON')"
        >
          In-person
        </button>
      </div>
    </div>

    <div
      id="csb-additional-clients"
      class="csb-group"
      data-testid="csb-additional-clients"
    >
      <div class="csb-group-head">
        <div>
          <label class="csb-label">Add additional clients for a group</label>
          <p class="csb-hint muted">
            Primary client is in the header. Add more here for a group session
            (notes list them as “Group Participants”).
          </p>
        </div>
        <button
          type="button"
          class="csb-expand-btn"
          :disabled="disabled"
          @click="expanded = !expanded"
        >
          {{ expanded ? 'Condense' : 'Expand' }}
        </button>
      </div>

      <div v-if="!expanded" class="csb-group-preview">
        <span v-if="extraClientCount">{{ extraClientCount }} additional client{{ extraClientCount === 1 ? '' : 's' }} selected</span>
        <span v-else class="muted">None selected — expand to add</span>
        <button
          type="button"
          class="csb-link"
          :disabled="disabled"
          @click="expanded = true"
        >
          Add clients
        </button>
      </div>

      <div v-else class="csb-group-body">
        <div class="csb-client-list">
          <label
            v-for="c in additionalClientOptions"
            :key="`csb-client-${c.id}`"
            class="csb-check"
          >
            <input
              type="checkbox"
              :checked="selectedClientIdSet.has(Number(c.id))"
              :disabled="disabled || clientsLoading"
              @change="toggleClient(Number(c.id))"
            />
            <span>{{ c.displayName || c.fullName || `Client #${c.id}` }}</span>
          </label>
          <p v-if="clientsLoading" class="csb-hint muted">Loading clients…</p>
          <p v-else-if="!additionalClientOptions.length" class="csb-hint muted">
            No other clients for this tenant.
          </p>
        </div>
        <p v-if="selectedClientIds.length > 1" class="csb-hint">
          Group session · {{ selectedClientIds.length }} clients total
        </p>
      </div>
    </div>

    <div v-if="selectedClientIds.length > 1" class="csb-row">
      <label class="csb-label">Co-provider (optional)</label>
      <select
        class="csb-input"
        :value="coProviderUserId"
        :disabled="disabled || coProvidersLoading"
        @change="emit('update:coProviderUserId', Number($event.target.value || 0))"
      >
        <option :value="0">None — primary provider only</option>
        <option
          v-for="p in coProviderOptions"
          :key="`csb-coprov-${p.id}`"
          :value="Number(p.id)"
        >
          {{ p.label }}
        </option>
      </select>
      <p class="csb-hint muted">
        Co-providers get access to the clients and notes for this group, and are added as note participants by default.
      </p>
    </div>

    <div v-if="showMedicalBillingCodes" class="csb-billing">
      <div class="csb-row">
        <label class="csb-label">Primary service code <span class="req">*</span></label>
        <select
          class="csb-input"
          :value="primaryServiceCode"
          :disabled="disabled || !primaryCodeOptions.length"
          @change="emit('update:primaryServiceCode', String($event.target.value || ''))"
        >
          <option value="">Select primary code…</option>
          <option v-for="opt in primaryCodeOptions" :key="`pri-${opt.code}`" :value="opt.code">
            {{ opt.label || opt.code }}
          </option>
        </select>
      </div>
      <div class="csb-row">
        <label class="csb-label">Add-on service codes</label>
        <div class="csb-addon-list">
          <label
            v-for="opt in addonCodeOptions"
            :key="`addon-${opt.code}`"
            class="csb-check"
          >
            <input
              type="checkbox"
              :checked="addonCodeSet.has(opt.code)"
              :disabled="disabled"
              @change="toggleAddon(opt.code)"
            />
            <span>{{ opt.label || opt.code }}</span>
          </label>
          <p v-if="!addonCodeOptions.length" class="csb-hint muted">
            No add-on codes configured for this tenant (e.g. 99051, 90875).
          </p>
        </div>
      </div>
    </div>

    <div v-if="showClinicalTools" class="csb-tools">
      <button type="button" class="btn btn-secondary btn-sm" :disabled="!clinicalNoteId && !clinicalSessionId" @click="emit('open-note')">
        Open clinical note
      </button>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="!claimId && !clinicalSessionId" @click="emit('open-claim')">
        {{ claimId ? 'View billing claim' : 'Billing / claim' }}
      </button>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        :disabled="disabled"
        @click="emit('open-quick-note')"
      >
        Quick note / dictate
      </button>
    </div>

    <div v-if="packageEntitlements.length" class="csb-row">
      <label class="csb-label">Package</label>
      <select
        class="csb-input"
        :value="packageEntitlementId"
        :disabled="disabled"
        @change="emit('update:packageEntitlementId', Number($event.target.value || 0))"
      >
        <option :value="0">Self-pay / no package</option>
        <option v-for="e in packageEntitlements" :key="e.id" :value="Number(e.id)">
          {{ e.packageName || `Package #${e.packageId}` }} — {{ e.sessionsRemaining }} left
        </option>
      </select>
    </div>

    <label class="csb-label">Notes</label>
    <textarea
      class="csb-input"
      rows="2"
      :value="notes"
      :disabled="disabled"
      placeholder="Optional scheduling notes…"
      @input="emit('update:notes', $event.target.value)"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { isAddonServiceCode } from '../../config/practiceCategories.js';

const props = defineProps({
  modality: { type: String, default: 'TELEHEALTH' },
  practiceCategory: { type: String, default: '' },
  tenantServiceId: { type: Number, default: 0 },
  services: { type: Array, default: () => [] },
  loadingServices: { type: Boolean, default: false },
  clientOptions: { type: Array, default: () => [] },
  selectedClientIds: { type: Array, default: () => [] },
  primaryClientId: { type: Number, default: 0 },
  clientsLoading: { type: Boolean, default: false },
  coProviderUserId: { type: Number, default: 0 },
  coProviderOptions: { type: Array, default: () => [] },
  coProvidersLoading: { type: Boolean, default: false },
  primaryServiceCode: { type: String, default: '' },
  addonServiceCodes: { type: Array, default: () => [] },
  serviceCodeOptions: { type: Array, default: () => [] },
  clinicalSessionId: { type: [Number, String], default: 0 },
  clinicalNoteId: { type: [Number, String], default: 0 },
  claimId: { type: [Number, String], default: 0 },
  notes: { type: String, default: '' },
  packageEntitlementId: { type: Number, default: 0 },
  packageEntitlements: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  /** When true, expand the additional-clients panel (e.g. after scroll-to button). */
  forceExpandClients: { type: Boolean, default: false }
});

const emit = defineEmits([
  'update:modality',
  'update:tenantServiceId',
  'update:notes',
  'update:packageEntitlementId',
  'update:selectedClientIds',
  'update:coProviderUserId',
  'update:primaryServiceCode',
  'update:addonServiceCodes',
  'open-note',
  'open-claim',
  'open-quick-note'
]);

const expanded = ref(false);

watch(
  () => props.forceExpandClients,
  (v) => {
    if (v) expanded.value = true;
  }
);

const selectedClientIdSet = computed(
  () => new Set((props.selectedClientIds || []).map((n) => Number(n)).filter((n) => n > 0))
);
const addonCodeSet = computed(
  () => new Set((props.addonServiceCodes || []).map((c) => String(c || '').toUpperCase()).filter(Boolean))
);

const primaryId = computed(() => Number(props.primaryClientId || 0)
  || Number((props.selectedClientIds || [])[0] || 0));

const additionalClientOptions = computed(() =>
  (props.clientOptions || []).filter((c) => Number(c.id) !== primaryId.value)
);

const extraClientCount = computed(() =>
  (props.selectedClientIds || []).filter((id) => Number(id) > 0 && Number(id) !== primaryId.value).length
);

const selectedService = computed(
  () => (props.services || []).find((s) => Number(s.id) === Number(props.tenantServiceId)) || null
);
const showClinicalTools = computed(() => {
  const bt = String(selectedService.value?.businessType || selectedService.value?.business_type || '').toLowerCase();
  if (!bt) return props.practiceCategory === 'mental_health';
  return bt === 'mental_health' || bt === 'healthcare';
});
const showMedicalBillingCodes = computed(() => {
  if (String(props.practiceCategory || '') !== 'mental_health') return false;
  return (props.serviceCodeOptions || []).length > 0 || showClinicalTools.value;
});

const primaryCodeOptions = computed(() =>
  (props.serviceCodeOptions || []).filter((row) => !isAddonServiceCode(row.code, row))
);
const addonCodeOptions = computed(() =>
  (props.serviceCodeOptions || []).filter((row) => isAddonServiceCode(row.code, row))
);

function toggleClient(id) {
  const n = Number(id || 0);
  if (!n) return;
  const next = new Set(selectedClientIdSet.value);
  // Keep primary client always selected when toggling extras.
  if (primaryId.value > 0) next.add(primaryId.value);
  if (next.has(n) && n !== primaryId.value) next.delete(n);
  else next.add(n);
  emit('update:selectedClientIds', Array.from(next.values()));
}

function toggleAddon(code) {
  const c = String(code || '').toUpperCase();
  if (!c) return;
  const next = new Set(addonCodeSet.value);
  if (next.has(c)) next.delete(c);
  else next.add(c);
  emit('update:addonServiceCodes', Array.from(next.values()));
}
</script>

<style scoped>
.csb { display: flex; flex-direction: column; gap: 12px; }
.csb-row { display: flex; flex-direction: column; gap: 6px; }
.csb-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.csb-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-size: 0.9rem;
  background: #fff;
  color: #0f172a;
  -webkit-text-fill-color: #0f172a;
}
.csb-toggles { display: flex; gap: 8px; }
.csb-chip {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.csb-chip.on {
  background: #0f172a;
  border-color: #0f172a;
  color: #fff;
}
.csb-tools { display: flex; flex-wrap: wrap; gap: 8px; }
.csb-hint { margin: 0; font-size: 0.78rem; }
.csb-group {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  background: #f8fafc;
}
.csb-group-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.csb-expand-btn {
  flex: 0 0 auto;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #334155;
  cursor: pointer;
}
.csb-group-preview {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.82rem;
  color: #475569;
}
.csb-link {
  border: none;
  background: none;
  color: #1d4ed8;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.csb-group-body { margin-top: 8px; }
.csb-client-list,
.csb-addon-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 140px;
  overflow: auto;
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.csb-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  cursor: pointer;
}
.csb-billing {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.req { color: #b91c1c; }
.muted { color: #64748b; }
</style>
