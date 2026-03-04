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
        <button type="button" class="btn btn-primary btn-sm" @click="showLogModal = true; editingTrip = null">
          Log trip
        </button>
      </div>
    </div>

    <CompanyCarMileageModal
      v-if="showLogModal && props.agencyId"
      :agency-id="Number(props.agencyId)"
      :manage-access="props.manageAccess"
      :show="showLogModal"
      :edit-trip="editingTrip"
      @close="closeLogModal"
      @submitted="onTripSubmitted"
    />

    <div v-if="totalMiles !== null" class="hint" style="margin-bottom: 12px;">
      Total mileage: <strong>{{ totalMiles.toFixed(1) }}</strong> miles
    </div>

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
    <div v-else class="table-wrap trips-table-wrap">
      <table class="table trips-table">
        <thead>
          <tr>
            <th class="col-date">Date</th>
            <th class="col-car">Car</th>
            <th class="col-driver">Driver</th>
            <th class="col-num right">Start</th>
            <th class="col-num right">End</th>
            <th class="col-num right">Miles</th>
            <th class="col-dest">Destinations</th>
            <th class="col-reason">Reason</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in trips" :key="t.id">
            <td class="col-date">{{ formatDate(t.drive_date) }}</td>
            <td class="col-car">{{ t.company_car_name || '—' }}</td>
            <td class="col-driver">{{ [t.user_first_name, t.user_last_name].filter(Boolean).join(' ') || '—' }}</td>
            <td class="col-num right">{{ formatOdometer(t.start_odometer_miles) }}</td>
            <td class="col-num right">{{ formatOdometer(t.end_odometer_miles) }}</td>
            <td class="col-num right">{{ formatMiles(t) }}</td>
            <td class="col-dest" :title="formatDestinations(t.destinations_json)">
              <span class="cell-truncate">{{ formatDestinations(t.destinations_json) }}</span>
            </td>
            <td class="col-reason" :title="t.reason_for_travel || ''">
              <span class="cell-truncate">{{ t.reason_for_travel || '—' }}</span>
            </td>
            <td class="col-actions">
              <button
                v-if="manageAccess || t.user_id === currentUserId"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="editingTrip = t; showLogModal = true"
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
import CompanyCarMileageModal from './CompanyCarMileageModal.vue';

const props = defineProps({
  agencyId: { type: Number, required: true },
  manageAccess: { type: Boolean, default: false },
  currentUserId: { type: Number, default: null },
});


const loading = ref(true);
const trips = ref([]);
const cars = ref([]);
const totalMiles = ref(null);
const newCarName = ref('');
const showLogModal = ref(false);
const editingTrip = ref(null);
const creatingCar = ref(false);
const uploadingPhotoId = ref(null);
const photoInputRefs = ref({});
const exporting = ref(false);

function carPhotoUrl(car) {
  if (!car?.photoUrl) return null;
  const base = toUploadsUrl(car.photoUrl);
  const t = car.updated_at || car.updatedAt;
  return t ? `${base}?t=${encodeURIComponent(String(t))}` : base;
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
    await api.post(`/company-car/company-cars/${carId}/photo`, fd);
    await loadCars();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to upload photo');
  } finally {
    uploadingPhotoId.value = null;
  }
}

function formatDate(val) {
  if (!val) return '—';
  const s = String(val);
  return s.slice(0, 10) || '—';
}

function formatOdometer(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (!Number.isFinite(n)) return '—';
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}

function formatMiles(t) {
  const miles = Number(t?.miles);
  if (Number.isFinite(miles) && miles > 0) return miles % 1 === 0 ? String(Math.round(miles)) : miles.toFixed(1);
  const start = Number(t?.start_odometer_miles);
  const end = Number(t?.end_odometer_miles);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    const m = end - start;
    return m % 1 === 0 ? String(Math.round(m)) : m.toFixed(1);
  }
  const m = Number(miles || 0);
  return m % 1 === 0 ? String(Math.round(m)) : m.toFixed(1);
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

function onTripSubmitted() {
  showLogModal.value = false;
  editingTrip.value = null;
  loadTrips();
}

function closeLogModal() {
  showLogModal.value = false;
  editingTrip.value = null;
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

.trips-table-wrap {
  overflow-x: auto;
}

.trips-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}

.trips-table .col-date { width: 100px; }
.trips-table .col-car { width: 100px; }
.trips-table .col-driver { width: 110px; }
.trips-table .col-num { width: 72px; }
.trips-table .col-dest { width: 22%; min-width: 140px; }
.trips-table .col-reason { width: 28%; min-width: 180px; }
.trips-table .col-actions { width: 70px; }

.trips-table th,
.trips-table td {
  padding: 8px 10px;
  vertical-align: top;
  border-bottom: 1px solid var(--border-color, #e9ecef);
}

.trips-table .col-num,
.trips-table .col-actions {
  vertical-align: middle;
}

.trips-table th {
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted, #6c757d);
}

.trips-table tbody tr:hover {
  background: var(--bg-secondary, #f8f9fa);
}

.cell-truncate {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.35;
  font-size: 13px;
}

.trips-table .right {
  text-align: right;
}
</style>
