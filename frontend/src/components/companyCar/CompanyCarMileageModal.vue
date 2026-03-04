<template>
  <Teleport to="body">
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal company-car-mileage-modal" style="width: min(560px, 100%);">
      <div class="modal-header">
        <h2>{{ editTrip ? 'Edit trip' : 'Company Car Mileage' }}</h2>
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
          <AddressSearchSelect
            :options="startLocationOptions"
            :model-value="getStartLocationValue(form.startLocation)"
            placeholder="Select start (office or owner home)…"
            :limit="50"
            @update:model-value="form.startLocation = $event"
          />
          <div class="hint" style="margin-top: 4px;">Start is always office or owner home — never a school. Type to add a custom address.</div>
        </div>

        <div class="field" style="margin-top: 12px;">
          <label>Starting odometer (miles) <span class="required">*</span></label>
          <input
            v-model.number="form.startOdometerMiles"
            type="number"
            min="0"
            step="0.1"
            :placeholder="editTrip ? 'Required' : 'From last trip'"
            :readonly="!editTrip"
          />
          <div class="hint" style="margin-top: 4px;">
            {{ editTrip ? 'Starting mileage for this trip.' : "Auto-filled from the previous trip's ending mileage for this car." }}
          </div>
        </div>

        <div class="field" style="margin-top: 12px;">
          <label>Destinations</label>
          <div v-for="(dest, di) in form.destinations" :key="di" class="dest-row" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: flex-start;">
            <div style="flex: 1; min-width: 0;">
              <AddressSearchSelect
                :options="destinationOptions"
                :model-value="getDestinationValue(dest)"
                placeholder="Type to search schools or places…"
                :limit="0"
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

        <div class="field" style="margin-top: 12px;">
          <label>Ending odometer (miles) <span class="required">*</span></label>
          <div v-if="computedEndOdometer !== null" class="odometer-display">
            {{ computedEndOdometer.toFixed(1) }}
          </div>
          <div v-else class="hint">Click "Calculate miles" above to compute based on start location and destinations.</div>
          <div v-if="computedEndOdometer !== null" class="hint" style="margin-top: 4px;">
            Calculated from start odometer + trip miles.
          </div>
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
            {{ submitting ? (editTrip ? 'Saving…' : 'Submitting…') : (editTrip ? 'Save changes' : 'Submit') }}
          </button>
        </div>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import AddressSearchSelect from './AddressSearchSelect.vue';

const authStore = useAuthStore();

const props = defineProps({
  agencyId: { type: Number, required: true },
  manageAccess: { type: Boolean, default: false },
  show: { type: Boolean, default: true },
  editTrip: { type: Object, default: null }
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
  startLocation: null,
  roundTrip: false,
  startOdometerMiles: null,
  endOdometerMiles: null,
  destinations: [null],
  reasonForTravel: '',
  notes: ''
});

const startLocationOptions = computed(() =>
  (startLocations.value || []).map((l) => ({
    ...l,
    searchText: `${l.name || ''} ${l.addressLine || ''}`.toLowerCase()
  }))
);

function getStartLocationValue(loc) {
  if (!loc) return null;
  if (typeof loc === 'object' && loc?.id) return loc;
  return { id: `custom-${loc}`, name: loc, addressLine: loc, searchText: String(loc).toLowerCase() };
}

const startAddressForCalculate = computed(() => {
  const loc = form.value.startLocation;
  if (!loc) return '';
  if (typeof loc === 'object') return loc.addressLine || loc.name || '';
  return String(loc).trim();
});

function getDestinationValue(dest) {
  if (!dest) return null;
  if (typeof dest === 'object' && dest?.id) return dest;
  return { id: `custom-${dest}`, name: dest, addressLine: dest, searchText: dest.toLowerCase() };
}

function setDestination(idx, val) {
  form.value.destinations[idx] = val || null;
  const dr = val?.defaultReason;
  if (dr && !form.value.reasonForTravel?.trim()) {
    form.value.reasonForTravel = dr;
  }
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

const computedEndOdometer = computed(() => {
  const start = Number(form.value.startOdometerMiles);
  const miles = calculatedMiles.value;
  if (Number.isFinite(start) && start >= 0 && miles != null && Number.isFinite(miles) && miles >= 0) {
    return start + miles;
  }
  return null;
});

const effectiveMiles = computed(() => calculatedMiles.value);

const canSubmit = computed(() => {
  const startOdom = Number(form.value.startOdometerMiles);
  const hasValidStart = Number.isFinite(startOdom) && startOdom >= 0;
  const hasCalculatedMiles = calculatedMiles.value != null && Number.isFinite(calculatedMiles.value) && calculatedMiles.value >= 0;
  return (
    form.value.companyCarId &&
    form.value.driveDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.value.driveDate) &&
    form.value.reasonForTravel?.trim() &&
    hasValidStart &&
    hasCalculatedMiles
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
    const params = { agencyId: props.agencyId };
    const driverId = props.manageAccess ? form.value.userId : authStore.user?.id;
    if (driverId) params.driverId = driverId;
    const res = await api.get('/company-car/start-locations', { params });
    startLocations.value = res.data?.startLocations || [];
    if (startLocations.value.length === 1 && !form.value.startLocation) {
      form.value.startLocation = startLocations.value[0];
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

async function loadLatestEndOdometer() {
  const carId = form.value.companyCarId;
  if (!carId || props.editTrip) return;
  try {
    const res = await api.get('/company-car/latest-trip-end-odometer', {
      params: { agencyId: props.agencyId, companyCarId: carId }
    });
    const end = res.data?.endOdometerMiles;
    if (end != null && Number.isFinite(end)) {
      form.value.startOdometerMiles = end;
    }
  } catch {
    // ignore
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
    const endOdom = computedEndOdometer.value;
    const payload = {
      agencyId: props.agencyId,
      companyCarId: form.value.companyCarId,
      userId: props.manageAccess ? form.value.userId : undefined,
      driveDate: form.value.driveDate,
      startOdometerMiles: form.value.startOdometerMiles ?? 0,
      endOdometerMiles: endOdom != null ? endOdom : form.value.endOdometerMiles ?? 0,
      miles: miles != null ? miles : undefined,
      destinations,
      reasonForTravel: form.value.reasonForTravel.trim(),
      notes: form.value.notes?.trim() || null
    };

    if (props.editTrip?.id) {
      await api.patch(`/company-car/company-car-trips/${props.editTrip.id}`, payload, {
        params: { agencyId: props.agencyId }
      });
    } else {
      await api.post('/company-car/company-car-trips', payload);
    }
    emit('submitted');
    emit('close');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit';
  } finally {
    submitting.value = false;
  }
}

function resetFormWithTrip(t) {
  if (!t) return;
  const today = new Date().toISOString().slice(0, 10);
  let destinations = [null];
  const destJson = t.destinations_json ?? t.destinationsJson;
  if (destJson) {
    try {
      const arr = typeof destJson === 'string' ? JSON.parse(destJson) : destJson;
      destinations = Array.isArray(arr) && arr.length > 0 ? arr.map((d) => (typeof d === 'string' ? d : d?.name || d?.addressLine || String(d))) : [null];
    } catch {
      // ignore
    }
  }
  const startOdom = t.start_odometer_miles ?? t.startOdometerMiles;
  const miles = t.miles;
  const driveDateRaw = t.drive_date ?? t.driveDate;
  const driveDate = driveDateRaw
    ? (driveDateRaw instanceof Date ? driveDateRaw : new Date(driveDateRaw)).toISOString().slice(0, 10)
    : today;
  form.value = {
    companyCarId: t.company_car_id ?? t.companyCarId ?? (cars.value.length === 1 ? cars.value[0].id : null),
    userId: t.user_id ?? t.userId ?? (agencyUsers.value.length ? agencyUsers.value[0].id : null),
    driveDate,
    startLocation: startLocations.value.length === 1 ? startLocations.value[0] : null,
    roundTrip: false,
    startOdometerMiles: startOdom != null && Number.isFinite(Number(startOdom)) ? Number(startOdom) : null,
    endOdometerMiles: null,
    destinations,
    reasonForTravel: String(t.reason_for_travel ?? t.reasonForTravel ?? '').trim(),
    notes: t.notes != null ? String(t.notes) : ''
  };
  calculatedMiles.value = miles != null && Number.isFinite(Number(miles)) ? Number(miles) : null;
  mileageError.value = '';
}

function resetForm() {
  const today = new Date().toISOString().slice(0, 10);
  const t = props.editTrip;
  if (t) {
    resetFormWithTrip(t);
  } else {
    let destinations = [null];
    form.value = {
      companyCarId: cars.value.length === 1 ? cars.value[0].id : null,
      userId: agencyUsers.value.length ? agencyUsers.value[0].id : null,
      driveDate: today,
      startLocation: startLocations.value.length === 1 ? startLocations.value[0] : null,
      roundTrip: false,
      startOdometerMiles: null,
      endOdometerMiles: null,
      destinations,
      reasonForTravel: '',
      notes: ''
    };
    calculatedMiles.value = null;
    mileageError.value = '';
  }
}

watch(
  () => [props.agencyId, props.show, props.editTrip],
  async () => {
    if (!props.agencyId || !props.show) return;
    loading.value = true;
    error.value = '';
    await Promise.all([loadCars(), loadDestinationOptions(), loadAgencyUsers()]);
    await loadStartLocations();

    if (props.editTrip?.id) {
      resetFormWithTrip(props.editTrip);
      try {
        const res = await api.get(`/company-car/company-car-trips/${props.editTrip.id}`, {
          params: { agencyId: props.agencyId },
          skipGlobalLoading: true
        });
        const t = res.data?.trip;
        if (t) {
          resetFormWithTrip(t);
        }
      } catch (e) {
        error.value = e.response?.data?.error?.message || 'Failed to load trip';
      }
    } else {
      resetForm();
      await loadLatestEndOdometer();
    }
    loading.value = false;
  },
  { immediate: true }
);

watch(() => form.value.userId, () => {
  if (!props.agencyId || !props.show) return;
  loadStartLocations();
});

watch(() => form.value.companyCarId, () => {
  if (!props.agencyId || !props.show || props.editTrip) return;
  loadLatestEndOdometer();
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}
.modal {
  background: var(--bg, #fff);
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  max-height: 90vh;
  overflow-y: auto;
}
.required { color: var(--danger, #dc3545); }
.dest-row input { min-width: 0; }
.odometer-display {
  padding: 8px 12px;
  background: var(--bg-secondary, #f8f9fa);
  border: 1px solid var(--border-color, #e9ecef);
  border-radius: 6px;
  font-weight: 500;
  font-size: 16px;
}
</style>
