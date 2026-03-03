<template>
  <div class="company-car-trips-view">
    <div class="section-header" style="margin-bottom: 12px;">
      <h3 style="margin: 0;">Company Car Trips</h3>
      <div class="actions" style="gap: 8px;">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="exporting || !trips.length"
          @click="downloadCsv"
        >
          {{ exporting ? 'Exporting…' : 'Download CSV' }}
        </button>
        <button
          v-if="manageAccess"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="importing"
          @click="triggerImportInput"
        >
          {{ importing ? 'Importing…' : 'Import from spreadsheet' }}
        </button>
        <input
          ref="importInputRef"
          type="file"
          accept=".csv,.xlsx"
          style="display: none;"
          @change="onImportFile"
        />
        <button type="button" class="btn btn-primary btn-sm" @click="openLogModal()">
          Log trip
        </button>
      </div>
    </div>

    <div v-if="totalMiles !== null" class="hint" style="margin-bottom: 12px;">
      Total mileage: <strong>{{ totalMiles.toFixed(1) }}</strong> miles
    </div>

    <div v-if="importError" class="warn-box" style="margin-bottom: 12px;">{{ importError }}</div>
    <div v-if="importSuccess" class="success-box" style="margin-bottom: 12px;">{{ importSuccess }}</div>

    <div v-if="manageAccess" class="card company-cars-card" style="margin-bottom: 12px;">
      <h4 style="margin: 0 0 10px 0;">Company cars</h4>
      <p class="hint" style="margin: 0 0 10px 0;">Upload a photo for each car so everyone can identify which vehicle to use.</p>
      <div v-if="cars.length" class="cars-list">
        <div v-for="car in cars" :key="car.id" class="car-row">
          <div class="car-photo-wrap">
            <img
              v-if="car.photoUrl"
              :src="carPhotoUrl(car)"
              :alt="car.name"
              class="car-photo"
            />
            <div v-else class="car-photo-placeholder">No photo</div>
          </div>
          <div class="car-info">
            <strong>{{ car.name }}</strong>
            <div style="margin-top: 4px;">
              <input
                :ref="(el) => setPhotoInputRef(car.id, el)"
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                class="photo-input-hidden"
                @change="(e) => onPhotoUpload(car.id, e)"
              />
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="uploadingPhotoId === car.id"
                @click="triggerPhotoInput(car.id)"
              >
                {{ uploadingPhotoId === car.id ? 'Uploading…' : (car.photoUrl ? 'Change photo' : 'Upload photo') }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="add-car-row" style="display: flex; gap: 8px; margin-top: 10px; align-items: flex-end;">
        <input v-model="newCarName" type="text" placeholder="e.g. Tesla Model 3, Car #1" style="flex: 1;" />
        <button type="button" class="btn btn-primary btn-sm" :disabled="!newCarName?.trim() || creatingCar" @click="createCar">
          {{ creatingCar ? 'Adding…' : 'Add car' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="muted">Loading trips…</div>
    <div v-else-if="!trips.length" class="muted">No trips yet. Log a trip or import from your spreadsheet.</div>
    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Car</th>
            <th>Driver</th>
            <th class="right">Miles</th>
            <th>Destinations</th>
            <th>Reason</th>
            <th class="right"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in trips" :key="t.id">
            <td>{{ t.drive_date }}</td>
            <td>{{ t.company_car_name || '—' }}</td>
            <td>{{ [t.user_first_name, t.user_last_name].filter(Boolean).join(' ') || '—' }}</td>
            <td class="right">{{ Number(t.miles || 0).toFixed(1) }}</td>
            <td>{{ formatDestinations(t.destinations_json) }}</td>
            <td>{{ t.reason_for_travel || '—' }}</td>
            <td class="right">
              <button
                v-if="manageAccess || t.user_id === currentUserId"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="openLogModal(t)"
              >
                Edit
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({
  agencyId: { type: Number, required: true },
  manageAccess: { type: Boolean, default: false },
  currentUserId: { type: Number, default: null }
});

const emit = defineEmits(['open-modal', 'trip-deleted']);

const loading = ref(true);
const trips = ref([]);
const cars = ref([]);
const totalMiles = ref(null);
const importing = ref(false);
const importError = ref('');
const importSuccess = ref('');
const importInputRef = ref(null);
const newCarName = ref('');
const creatingCar = ref(false);
const uploadingPhotoId = ref(null);
const photoInputRefs = ref({});
const exporting = ref(false);

function carPhotoUrl(car) {
  return car?.photoUrl ? toUploadsUrl(car.photoUrl) : null;
}

function setPhotoInputRef(carId, el) {
  if (el) photoInputRefs.value[carId] = el;
}

function triggerPhotoInput(carId) {
  photoInputRefs.value[carId]?.click();
}

async function onPhotoUpload(carId, ev) {
  const file = ev.target?.files?.[0];
  ev.target.value = '';
  if (!file || !props.agencyId) return;

  uploadingPhotoId.value = carId;
  try {
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('agencyId', String(props.agencyId));
    await api.post(`/company-car/company-cars/${carId}/photo`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    await loadCars();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to upload photo');
  } finally {
    uploadingPhotoId.value = null;
  }
}

function formatDestinations(json) {
  if (!json) return '—';
  try {
    const arr = typeof json === 'string' ? JSON.parse(json) : json;
    return Array.isArray(arr) ? arr.join(', ') : '—';
  } catch {
    return '—';
  }
}

function triggerImportInput() {
  importInputRef.value?.click();
}

async function onImportFile(ev) {
  const file = ev.target?.files?.[0];
  ev.target.value = '';
  if (!file || !props.agencyId) return;

  await loadCars();
  if (!cars.value.length) {
    importError.value = 'Add a company car first before importing.';
    return;
  }

  importing.value = true;
  importError.value = '';
  importSuccess.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('agencyId', String(props.agencyId));
    fd.append('companyCarId', String(cars.value[0].id));

    const res = await api.post('/company-car/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    const created = res.data?.created ?? 0;
    const skipped = res.data?.skipped ?? 0;
    const errors = res.data?.errors ?? 0;
    importSuccess.value = `Imported ${created} trip(s). ${skipped} skipped, ${errors} errors.`;
    await loadTrips();
    emit('trip-deleted'); // refresh parent if needed
  } catch (e) {
    importError.value = e.response?.data?.error?.message || 'Import failed';
  } finally {
    importing.value = false;
  }
}

async function loadCars() {
  if (!props.agencyId) return;
  try {
    const res = await api.get('/company-car/company-cars', { params: { agencyId: props.agencyId } });
    cars.value = res.data?.cars || [];
  } catch {
    cars.value = [];
  }
}

async function createCar() {
  const name = newCarName.value?.trim();
  if (!name || !props.agencyId) return;
  creatingCar.value = true;
  try {
    await api.post('/company-car/company-cars', { agencyId: props.agencyId, name });
    newCarName.value = '';
    await loadCars();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to add car');
  } finally {
    creatingCar.value = false;
  }
}

async function loadTrips() {
  if (!props.agencyId) return;
  loading.value = true;
  try {
    await loadCars();
    const res = await api.get('/company-car/company-car-trips', { params: { agencyId: props.agencyId } });
    trips.value = res.data?.trips || [];
    totalMiles.value = res.data?.totalMiles ?? 0;
  } catch {
    trips.value = [];
    totalMiles.value = 0;
  } finally {
    loading.value = false;
  }
}

function openLogModal(trip = null) {
  emit('open-modal', trip);
}

async function downloadCsv() {
  if (!props.agencyId) return;
  exporting.value = true;
  try {
    const params = new URLSearchParams({ agencyId: String(props.agencyId) });
    const res = await api.get(`/company-car/company-car-trips/export.csv?${params}`, {
      responseType: 'blob'
    });
    const blob = new Blob([res.data], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `company-car-trips-${props.agencyId}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to export');
  } finally {
    exporting.value = false;
  }
}

watch(
  () => props.agencyId,
  () => loadTrips(),
  { immediate: true }
);
</script>

<style scoped>
.company-cars-card .cars-list {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 12px;
}

.car-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  border: 1px solid var(--border-color, #e9ecef);
}

.car-photo-wrap {
  width: 64px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-tertiary, #e9ecef);
}

.car-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.car-photo-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text-muted, #6c757d);
}

.car-info {
  flex: 1;
  min-width: 0;
}

.photo-input-hidden {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
</style>
