<template>
  <div class="bulk-panel card">
    <div class="bulk-row">
      <strong>{{ selectedCount }} selected</strong>
      <button type="button" class="btn btn-secondary btn-sm" @click="$emit('clear')">Clear</button>
      <button type="button" class="btn btn-secondary btn-sm" @click="$emit('select-similar')">
        Select similar ±{{ similarTolerance }} mi
      </button>
    </div>

    <div class="bulk-row auto-select">
      <span class="hint">Auto-select:</span>
      <button type="button" class="btn btn-secondary btn-sm" @click="$emit('select-filter', 'no-dest')">
        No destination
      </button>
      <button type="button" class="btn btn-secondary btn-sm" @click="$emit('select-filter', 'no-reason')">
        No reason
      </button>
      <button type="button" class="btn btn-secondary btn-sm" @click="$emit('select-filter', 'no-both')">
        Neither
      </button>
    </div>

    <div class="bulk-fields">
      <div class="field">
        <label>Date (all selected)</label>
        <input v-model="form.driveDate" type="date" />
      </div>
      <div class="field grow">
        <label>Destinations (comma-separated)</label>
        <input v-model="form.destinations" type="text" placeholder="Masters, Windchime, Masters" />
      </div>
      <div class="field grow">
        <label>Reason for travel</label>
        <input v-model="form.reasonForTravel" type="text" placeholder="Client care" />
      </div>
    </div>

    <div class="bulk-row miles-row">
      <div class="field">
        <label>Set all miles to</label>
        <input v-model.number="form.milesSet" type="number" min="0" step="0.1" placeholder="e.g. 14" />
      </div>
      <div class="field">
        <label>Shift miles by</label>
        <input v-model.number="form.milesDelta" type="number" step="0.1" placeholder="e.g. 2 or -2" />
      </div>
      <button type="button" class="btn btn-primary btn-sm" :disabled="applying" @click="apply">
        {{ applying ? 'Applying…' : 'Apply to selected' }}
      </button>
    </div>
    <p class="hint">Mile changes update end odometer and rechain later trips automatically.</p>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, required: true },
  tripIds: { type: Array, default: () => [] },
  similarTolerance: { type: Number, default: 2 }
});

const emit = defineEmits(['applied', 'clear', 'select-similar', 'select-filter']);

const selectedCount = computed(() => props.tripIds?.length || 0);

const applying = ref(false);
const form = ref({
  driveDate: '',
  destinations: '',
  reasonForTravel: '',
  milesSet: null,
  milesDelta: null
});

async function apply() {
  if (!props.tripIds?.length || !props.agencyId) return;
  applying.value = true;
  try {
    const payload = {
      agencyId: props.agencyId,
      tripIds: props.tripIds,
      rechain: true
    };
    if (form.value.driveDate) payload.driveDate = form.value.driveDate;
    if (form.value.destinations?.trim()) payload.destinations = form.value.destinations.trim();
    if (form.value.reasonForTravel?.trim()) payload.reasonForTravel = form.value.reasonForTravel.trim();
    if (form.value.milesSet != null && Number.isFinite(Number(form.value.milesSet))) {
      payload.milesSet = Number(form.value.milesSet);
    } else if (form.value.milesDelta != null && Number.isFinite(Number(form.value.milesDelta))) {
      payload.milesDelta = Number(form.value.milesDelta);
    }

    const hasField = payload.driveDate || payload.destinations || payload.reasonForTravel
      || payload.milesSet != null || payload.milesDelta != null;
    if (!hasField) {
      alert('Enter at least one field to apply (date, destinations, reason, or miles).');
      return;
    }

    await api.post('/company-car/company-car-trips/bulk-edit', payload);
    form.value = { driveDate: '', destinations: '', reasonForTravel: '', milesSet: null, milesDelta: null };
    emit('applied');
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Bulk edit failed');
  } finally {
    applying.value = false;
  }
}
</script>

<style scoped>
.bulk-panel {
  margin-bottom: 12px;
  padding: 12px;
  background: var(--bg-secondary, #f8f9fa);
  border: 1px solid var(--border-color, #e9ecef);
  border-radius: 8px;
}

.bulk-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.auto-select {
  margin-bottom: 12px;
}

.bulk-fields {
  display: grid;
  grid-template-columns: 140px 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
}

.field label {
  display: block;
  font-size: 12px;
  margin-bottom: 4px;
  color: var(--text-muted, #6c757d);
}

.field input {
  width: 100%;
}

.miles-row .field {
  min-width: 120px;
}

.grow {
  min-width: 0;
}

@media (max-width: 900px) {
  .bulk-fields {
    grid-template-columns: 1fr;
  }
}
</style>
