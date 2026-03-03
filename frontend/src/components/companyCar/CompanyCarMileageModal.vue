<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal company-car-mileage-modal" style="width: min(560px, 100%);">
      <div class="modal-header">
        <h2>Company Car Mileage</h2>
        <button type="button" class="btn-close" @click="$emit('close')" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <div v-if="error" class="warn-box" style="margin-bottom: 12px;">{{ error }}</div>

        <div class="field">
          <label>Company car <span class="required">*</span></label>
          <select v-model="form.companyCarId" :disabled="loading">
            <option :value="null" disabled>Select a car…</option>
            <option v-for="c in cars" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <div v-if="manageAccess" class="field">
          <label>Driver</label>
          <select v-model="form.userId">
            <option v-for="u in agencyUsers" :key="u.id" :value="u.id">
              {{ u.first_name }} {{ u.last_name }}
            </option>
          </select>
        </div>

        <div class="field-row" style="grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="field">
            <label>Date <span class="required">*</span></label>
            <input v-model="form.driveDate" type="date" />
          </div>
        </div>

        <div class="field" style="margin-top: 12px;">
          <label>Start location</label>
          <select v-model="form.startLocationId" class="full-width">
            <option :value="null" disabled>Select start (office or owner home)…</option>
            <option v-for="loc in startLocations" :key="loc.id" :value="loc.id">
              {{ loc.name }}{{ loc.addressLine ? ` — ${loc.addressLine}` : '' }}
            </option>
          </select>
          <div class="hint" style="margin-top: 4px;">Start is always office or owner home — never a school.</div>
        </div>

        <div class="field" style="margin-top: 12px;">
          <label>Destinations</label>
          <div v-for="(dest, di) in form.destinations" :key="di" class="dest-row" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: flex-start;">
            <div style="flex: 1; min-width: 0;">
              <AddressSearchSelect
                :options="destinationOptions"
                :model-value="getDestinationValue(dest)"
                placeholder="Type to search schools or places…"
                @update:model-value="(v) => setDestination(di, v)"
              />
            </div>
            <button type="button" class="btn btn-danger btn-sm" @click="removeDestination(di)">Remove</button>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" @click="addDestination">Add destination</button>
          <div class="hint" style="margin-top: 4px;">Select agency schools or type a custom address. Letters match as you type.</div>
        </div>

        <div class="field-row" style="margin-top: 12px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <label class="control" style="display: flex; gap: 8px; align-items: center;">
            <input v-model="form.roundTrip" type="checkbox" />
            <span>Round trip</span>
          </label>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="mileageCalculating || !canCalculateMileage"
            @click="calculateMileageFromAddresses"
          >
            {{ mileageCalculating ? 'Calculating…' : 'Calculate miles' }}
          </button>
          <span v-if="mileageError" class="muted">{{ mileageError }}</span>
        </div>
        <div v-if="calculatedMiles !== null" class="hint" style="margin-top: 4px;">
          Calculated miles: <strong>{{ calculatedMiles.toFixed(1) }}</strong>
        </div>

        <div class="field-row" style="margin-top: 12px; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="field">
            <label>Starting odometer (miles)</label>
            <input v-model.number="form.startOdometerMiles" type="number" min="0" step="0.1" placeholder="Optional" />
          </div>
          <div class="field">
            <label>Ending odometer (miles)</label>
            <input v-model.number="form.endOdometerMiles" type="number" min="0" step="0.1" placeholder="Optional" />
          </div>
        </div>
        <div v-if="computedMilesFromOdometer !== null" class="hint" style="margin-top: 4px;">
          Miles from odometer: <strong>{{ computedMilesFromOdometer.toFixed(1) }}</strong>
        </div>

        <div class="field" style="margin-top: 12px;">
          <label>Reason for travel <span class="required">*</span></label>
          <input v-model="form.reasonForTravel" type="text" placeholder="Business purpose" />
        </div>

        <div class="field" style="margin-top: 12px;">
          <label>Notes</label>
          <textarea v-model="form.notes" rows="2" placeholder="Optional"></textarea>
        </div>

        <div class="actions" style="margin-top: 16px; justify-content: flex-end;">
          <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="submitting || !canSubmit"
            @click="submit"
          >
            {{ submitting ? 'Submitting…' : 'Submit' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import AddressSearchSelect from './AddressSearchSelect.vue';

const props = defineProps({
  agencyId: { type: Number, required: true },
  manageAccess: { type: Boolean, default: false },
  show: { type: Boolean, default: true }
});

const emit = defineEmits(['close', 'submitted']);

const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const cars = ref([]);
const startLocations = ref([]);
const destinationOptions = ref([]);
const agencyUsers = ref([]);

const form = ref({
  companyCarId: null,
  userId: null,
  driveDate: '',
  startLocationId: null,
  roundTrip: false,
  startOdometerMiles: null,
  endOdometerMiles: null,
  destinations: [null],
  reasonForTravel: '',
  notes: ''
});

const startAddressForCalculate = computed(() => {
  const id = form.value.startLocationId;
  if (!id) return '';
  const loc = startLocations.value.find((l) => l.id === id);
  return loc?.addressLine || '';
});

function getDestinationValue(dest) {
  if (!dest) return null;
  if (typeof dest === 'object' && dest?.id) return dest;
  return { id: `custom-${dest}`, name: dest, addressLine: dest, searchText: dest.toLowerCase() };
}

function setDestination(idx, val) {
  form.value.destinations[idx] = val || null;
}

const mileageCalculating = ref(false);
const mileageError = ref('');
const calculatedMiles = ref(null);

const destinationAddresses = computed(() => {
  return (form.value.destinations || [])
    .map((d) => {
      if (!d) return '';
      if (typeof d === 'object') return d.addressLine || d.name || '';
      return String(d).trim();
    })
    .filter(Boolean);
});

const canCalculateMileage = computed(() => {
  const origin = startAddressForCalculate.value?.trim() || '';
  const dests = destinationAddresses.value;
  return !!origin && dests.length > 0;
});

const computedMilesFromOdometer = computed(() => {
  const start = form.value.startOdometerMiles;
  const end = form.value.endOdometerMiles;
  if (start != null && end != null && !Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
    return end - start;
  }
  return null;
});

const effectiveMiles = computed(() => {
  if (calculatedMiles.value !== null && Number.isFinite(calculatedMiles.value)) {
    return calculatedMiles.value;
  }
  return computedMilesFromOdometer.value;
});

const canSubmit = computed(() => {
  const hasMiles = effectiveMiles.value !== null && effectiveMiles.value >= 0;
  return (
    form.value.companyCarId &&
    form.value.driveDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.value.driveDate) &&
    form.value.reasonForTravel?.trim() &&
    hasMiles
  );
});

async function calculateMileageFromAddresses() {
  if (!canCalculateMileage.value) return;
  mileageError.value = '';
  mileageCalculating.value = true;
  try {
    const params = new URLSearchParams({
      agencyId: props.agencyId,
      origin: startAddressForCalculate.value.trim(),
      roundTrip: form.value.roundTrip ? 'true' : 'false'
    });
    destinationAddresses.value.forEach((d) => params.append('destinations', d));
    const { data } = await api.get(`/company-car/mileage/calculate?${params}`);
    calculatedMiles.value = data.miles;
  } catch (e) {
    mileageError.value = e.response?.data?.error?.message || e.message || 'Failed';
    calculatedMiles.value = null;
  } finally {
    mileageCalculating.value = false;
  }
}

function addDestination() {
  form.value.destinations.push(null);
}

function removeDestination(idx) {
  form.value.destinations.splice(idx, 1);
  if (form.value.destinations.length === 0) form.value.destinations.push(null);
}

async function loadCars() {
  try {
    const res = await api.get('/company-car/company-cars', { params: { agencyId: props.agencyId } });
    cars.value = res.data?.cars || [];
    if (cars.value.length === 1 && !form.value.companyCarId) {
      form.value.companyCarId = cars.value[0].id;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load cars';
  }
}

async function loadStartLocations() {
  try {
    const res = await api.get('/company-car/start-locations', { params: { agencyId: props.agencyId } });
    startLocations.value = res.data?.startLocations || [];
    if (startLocations.value.length === 1 && !form.value.startLocationId) {
      form.value.startLocationId = startLocations.value[0].id;
    }
  } catch {
    startLocations.value = [];
  }
}

async function loadDestinationOptions() {
  try {
    const res = await api.get('/company-car/destination-options', { params: { agencyId: props.agencyId } });
    destinationOptions.value = res.data?.destinations || [];
  } catch {
    destinationOptions.value = [];
  }
}

async function loadAgencyUsers() {
  if (!props.manageAccess) return;
  try {
    const res = await api.get('/company-car/agency-users', { params: { agencyId: props.agencyId } });
    agencyUsers.value = res.data?.users || [];
    if (agencyUsers.value.length && !form.value.userId) {
      form.value.userId = agencyUsers.value[0].id;
    }
  } catch {
    agencyUsers.value = [];
  }
}

async function submit() {
  if (!canSubmit.value) return;
  error.value = '';
  submitting.value = true;
  try {
    const destinations = (form.value.destinations || [])
      .map((d) => {
        if (!d) return null;
        if (typeof d === 'object') return d.name || d.addressLine || '';
        return String(d).trim();
      })
      .filter(Boolean);

    const miles = effectiveMiles.value;
    await api.post('/company-car/company-car-trips', {
      agencyId: props.agencyId,
      companyCarId: form.value.companyCarId,
      userId: props.manageAccess ? form.value.userId : undefined,
      driveDate: form.value.driveDate,
      startOdometerMiles: form.value.startOdometerMiles ?? 0,
      endOdometerMiles: form.value.endOdometerMiles ?? 0,
      miles: miles != null ? miles : undefined,
      destinations,
      reasonForTravel: form.value.reasonForTravel.trim(),
      notes: form.value.notes?.trim() || null
    });
    emit('submitted');
    emit('close');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit';
  } finally {
    submitting.value = false;
  }
}

function resetForm() {
  const today = new Date().toISOString().slice(0, 10);
  form.value = {
    companyCarId: cars.value.length === 1 ? cars.value[0].id : null,
    userId: agencyUsers.value.length ? agencyUsers.value[0].id : null,
    driveDate: today,
    startLocationId: startLocations.value.length === 1 ? startLocations.value[0].id : null,
    roundTrip: false,
    startOdometerMiles: null,
    endOdometerMiles: null,
    destinations: [null],
    reasonForTravel: '',
    notes: ''
  };
  calculatedMiles.value = null;
  mileageError.value = '';
}

watch(
  () => [props.agencyId, props.show],
  async () => {
    if (!props.agencyId || !props.show) return;
    loading.value = true;
    error.value = '';
    await Promise.all([loadCars(), loadStartLocations(), loadDestinationOptions(), loadAgencyUsers()]);
    resetForm();
    loading.value = false;
  },
  { immediate: true }
);
</script>

<style scoped>
.required { color: var(--danger, #dc3545); }
.dest-row input { min-width: 0; }
</style>
