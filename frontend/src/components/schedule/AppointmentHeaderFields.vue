<template>
  <div class="ahf" data-testid="appointment-header-fields">
    <div class="ahf-card">
      <div class="ahf-top">
        <div class="ahf-when-block">
          <span class="ahf-label">When</span>
          <div class="ahf-when-row">
            <input
              class="ahf-input ahf-input--date"
              type="date"
              :value="dateYmd"
              :disabled="disabled"
              @change="emit('update:dateYmd', String($event.target.value || ''))"
            />
            <div class="ahf-time-group">
              <input
                class="ahf-input ahf-input--time"
                type="time"
                :value="startTime"
                :disabled="disabled"
                @change="emit('update:startTime', String($event.target.value || ''))"
              />
              <div v-if="!disabled" class="ahf-nudge" aria-label="Adjust start by 15 minutes">
                <button type="button" class="ahf-nudge-btn" title="Start +15 min (keeps duration)" @click="nudgeStart(15)">+15</button>
                <button type="button" class="ahf-nudge-btn" title="Start −15 min (keeps duration)" @click="nudgeStart(-15)">−15</button>
              </div>
            </div>
            <span class="ahf-sep" aria-hidden="true">–</span>
            <div class="ahf-time-group">
              <input
                class="ahf-input ahf-input--time"
                type="time"
                :value="endTime"
                :disabled="disabled"
                @change="emit('update:endTime', String($event.target.value || ''))"
              />
              <div v-if="!disabled" class="ahf-nudge" aria-label="Adjust end by 15 minutes">
                <button type="button" class="ahf-nudge-btn" title="End +15 min" @click="nudgeEnd(15)">+15</button>
                <button type="button" class="ahf-nudge-btn" title="End −15 min" @click="nudgeEnd(-15)">−15</button>
              </div>
            </div>
            <span v-if="timezoneLabel" class="ahf-tz">{{ timezoneLabel }}</span>
          </div>
        </div>

        <div class="ahf-side-fields">
          <div class="ahf-field ahf-field--tenant">
            <span class="ahf-label">Tenant</span>
            <div class="ahf-tenant-row">
              <img
                v-if="tenantIconUrl"
                class="ahf-tenant-logo"
                :src="tenantIconUrl"
                alt=""
              />
              <select
                v-if="tenantOptions.length > 1"
                class="ahf-input"
                :value="agencyId"
                :disabled="disabled || !canEditTenant"
                @change="emit('update:agencyId', Number($event.target.value || 0))"
              >
                <option v-for="opt in tenantOptions" :key="`ahf-t-${opt.id}`" :value="Number(opt.id)">
                  {{ opt.label }}
                </option>
              </select>
              <span v-else class="ahf-value">{{ tenantLabel || '—' }}</span>
            </div>
          </div>
          <div class="ahf-field">
            <span class="ahf-label">{{ providerLabel }}</span>
            <slot name="provider">
              <span class="ahf-value">{{ providerName || '—' }}</span>
            </slot>
          </div>
        </div>
      </div>

      <div class="ahf-details">
        <div class="ahf-field">
          <span class="ahf-label">Type</span>
          <select
            v-if="typeOptions.length"
            class="ahf-input"
            :value="appointmentType"
            :disabled="disabled || !canEditType"
            @change="emit('update:appointmentType', String($event.target.value || ''))"
          >
            <option v-for="opt in typeOptions" :key="`ahf-type-${opt.value}`" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <span v-else class="ahf-value">{{ appointmentTypeLabel || appointmentType || '—' }}</span>
        </div>

        <div v-if="showService" class="ahf-field ahf-field--grow">
          <span class="ahf-label">Service</span>
          <select
            class="ahf-input"
            :value="tenantServiceId"
            :disabled="disabled || servicesLoading || !serviceOptions.length"
            @change="emit('update:tenantServiceId', Number($event.target.value || 0))"
          >
            <option :value="0">{{ serviceOptions.length ? 'Select service…' : 'No services for this type' }}</option>
            <option
              v-for="svc in serviceOptions"
              :key="`ahf-svc-${svc.id}`"
              :value="Number(svc.id)"
            >
              {{ svc.label || svc.name }}
            </option>
          </select>
        </div>

        <div
          v-if="showParticipant"
          class="ahf-field"
          :class="{ 'ahf-field--participant-open': participantTrayOpen }"
        >
          <span class="ahf-label">{{ participantLabel }}</span>
          <slot name="participant">
            <span class="ahf-value">{{ participantSummary || '—' }}</span>
          </slot>
        </div>

        <div v-if="showGroupClientsButton" class="ahf-field ahf-field--action">
          <span class="ahf-label">Group</span>
          <button
            type="button"
            class="ahf-action-btn"
            :disabled="disabled"
            @click="emit('scroll-to-group-clients')"
          >
            Add additional clients for a group
          </button>
        </div>

        <div class="ahf-field">
          <span class="ahf-label">Status</span>
          <select
            v-if="statusOptions.length"
            class="ahf-input"
            :value="status"
            :disabled="disabled || !canEditStatus"
            @change="emit('update:status', String($event.target.value || ''))"
          >
            <option v-for="opt in statusOptions" :key="`ahf-st-${opt.value}`" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <span v-else class="ahf-value">{{ status || '—' }}</span>
        </div>

        <div v-if="showOccurrenceCount" class="ahf-field">
          <span class="ahf-label">Booked</span>
          <span class="ahf-value">{{ occurrenceCountLabel }}</span>
        </div>

        <div v-if="showLocation" class="ahf-field ahf-field--grow">
          <span class="ahf-label">Location</span>
          <select
            v-if="locationOptions.length"
            class="ahf-input"
            :value="serviceLocationId"
            :disabled="disabled || !canEditLocation"
            @change="emit('update:serviceLocationId', Number($event.target.value || 0))"
          >
            <option :value="0">Select location…</option>
            <option
              v-for="loc in locationOptions"
              :key="`ahf-loc-${loc.id}`"
              :value="Number(loc.id)"
            >
              {{ loc.label }}
            </option>
          </select>
          <input
            v-else
            class="ahf-input"
            type="text"
            :value="locationAddress"
            :disabled="disabled || !canEditLocation"
            placeholder="Address"
            @change="emit('update:locationAddress', String($event.target.value || ''))"
          />
        </div>

        <div v-if="showRoom" class="ahf-field">
          <span class="ahf-label">Room</span>
          <select
            v-if="roomOptions.length"
            class="ahf-input"
            :value="roomId"
            :disabled="disabled || !canEditRoom"
            @change="emit('update:roomId', Number($event.target.value || 0))"
          >
            <option :value="0">— None —</option>
            <option v-for="r in roomOptions" :key="`ahf-room-${r.id}`" :value="Number(r.id)">
              {{ r.label }}
            </option>
          </select>
          <span v-else class="ahf-value">{{ roomLabel || '—' }}</span>
        </div>

        <div v-if="showBookedUntil" class="ahf-field">
          <span class="ahf-label">Booked until</span>
          <input
            v-if="canEditBookedUntil"
            class="ahf-input"
            type="date"
            :value="bookedUntil"
            :disabled="disabled"
            @change="emit('update:bookedUntil', String($event.target.value || ''))"
          />
          <span v-else class="ahf-value">{{ bookedUntilLabel || bookedUntil || '—' }}</span>
        </div>
      </div>

      <p v-if="modalityPosWarning" class="ahf-soft-warn" role="status">
        {{ modalityPosWarning }}
      </p>
    </div>

    <div v-if="showParticipant && participantTrayOpen && $slots['participant-tray']" class="ahf-participant-tray">
      <slot name="participant-tray" />
    </div>

    <div
      v-if="showOfficeRequestCta || officeRequestActive"
      class="ahf-office"
      :class="{ 'ahf-office--active': officeRequestActive }"
      data-testid="appointment-office-request"
    >
      <template v-if="!officeRequestActive">
        <div class="ahf-office-copy">
          <strong>No office room assigned</strong>
          <span class="muted">Request a room for this appointment or series.</span>
        </div>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="disabled"
          @click="emit('request-office')"
        >
          Request room
        </button>
      </template>
      <template v-else>
        <div class="ahf-office-head">
          <div class="ahf-office-copy">
            <strong>Office request</strong>
            <span class="muted">Pick a location, then a room open for every occurrence in this series (conflicts are hidden).</span>
          </div>
          <button
            type="button"
            class="ahf-link-btn"
            :disabled="disabled"
            @click="emit('cancel-office-request')"
          >
            Remove
          </button>
        </div>
        <div class="ahf-office-fields">
          <div class="ahf-field">
            <span class="ahf-label">Office / location</span>
            <select
              class="ahf-input"
              :value="officeLocationId"
              :disabled="disabled"
              @change="emit('update:officeLocationId', Number($event.target.value || 0))"
            >
              <option :value="0">Any available / admin assigns</option>
              <option
                v-for="loc in officeLocations"
                :key="`ahf-ol-${loc.id}`"
                :value="Number(loc.id)"
              >
                {{ loc.name || loc.label || `Office #${loc.id}` }}
              </option>
            </select>
          </div>
          <div class="ahf-field ahf-field--rooms">
            <span class="ahf-label">Open rooms for this series</span>
            <div v-if="preferredRoomOptions.length" class="ahf-room-list">
              <button
                type="button"
                class="ahf-room-chip"
                :class="{ on: !Number(preferredRoomId) }"
                :disabled="disabled"
                @click="emit('update:preferredRoomId', 0)"
              >
                Any open room
              </button>
              <div
                v-for="r in preferredRoomOptions"
                :key="`ahf-pr-${r.id || r.roomId}`"
                class="ahf-room-row"
                :class="{ on: Number(preferredRoomId) === Number(r.id || r.roomId), off: r.requestable === false }"
              >
                <button
                  type="button"
                  class="ahf-room-chip"
                  :disabled="disabled || r.requestable === false"
                  @click="emit('update:preferredRoomId', Number(r.id || r.roomId))"
                >
                  <span v-if="roomNumberOf(r)" class="ahf-room-num">#{{ roomNumberOf(r) }}</span>
                  <span>{{ roomNameOf(r) }}</span>
                  <span v-if="r.stateLabel" class="ahf-room-state">{{ r.stateLabel }}</span>
                </button>
                <button
                  v-if="roomPhotoOf(r)"
                  type="button"
                  class="ahf-room-photo-btn"
                  title="Quick view room photo"
                  @click="previewRoomPhoto(r)"
                >
                  <img :src="roomPhotoOf(r)" alt="" class="ahf-room-thumb" />
                </button>
              </div>
            </div>
            <select
              v-else
              class="ahf-input"
              :value="preferredRoomId"
              :disabled="disabled"
              @change="emit('update:preferredRoomId', Number($event.target.value || 0))"
            >
              <option :value="0">Any open room</option>
            </select>
          </div>
        </div>
        <p v-if="preferredRoomsHint" class="ahf-office-hint muted">{{ preferredRoomsHint }}</p>
        <div v-if="roomPhotoPreviewUrl" class="ahf-photo-lightbox" @click="roomPhotoPreviewUrl = ''">
          <img :src="roomPhotoPreviewUrl" alt="Room photo" @click.stop />
          <button type="button" class="ahf-photo-close" @click="roomPhotoPreviewUrl = ''">Close</button>
        </div>
        <p v-else-if="!officeLocations.length" class="ahf-office-hint muted">
          {{ officeLocationsLoading ? 'Loading offices…' : 'No office locations found for this tenant.' }}
        </p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  dateYmd: { type: String, default: '' },
  startTime: { type: String, default: '' },
  endTime: { type: String, default: '' },
  timezoneLabel: { type: String, default: '' },
  agencyId: { type: Number, default: 0 },
  tenantOptions: { type: Array, default: () => [] },
  tenantLabel: { type: String, default: '' },
  canEditTenant: { type: Boolean, default: true },
  providerLabel: { type: String, default: 'Provider' },
  providerName: { type: String, default: '' },
  appointmentType: { type: String, default: '' },
  appointmentTypeLabel: { type: String, default: '' },
  typeOptions: { type: Array, default: () => [] },
  canEditType: { type: Boolean, default: false },
  showParticipant: { type: Boolean, default: true },
  participantLabel: { type: String, default: 'Participant' },
  participantSummary: { type: String, default: '' },
  /** When true, render participant-tray immediately under the strip */
  participantTrayOpen: { type: Boolean, default: false },
  status: { type: String, default: 'confirmed' },
  statusOptions: { type: Array, default: () => [] },
  canEditStatus: { type: Boolean, default: true },
  showOccurrenceCount: { type: Boolean, default: false },
  occurrenceCountLabel: { type: String, default: '1 time' },
  showLocation: { type: Boolean, default: true },
  locationAddress: { type: String, default: '' },
  locationOptions: { type: Array, default: () => [] },
  serviceLocationId: { type: Number, default: 0 },
  canEditLocation: { type: Boolean, default: true },
  showRoom: { type: Boolean, default: true },
  roomId: { type: Number, default: 0 },
  roomLabel: { type: String, default: '' },
  roomOptions: { type: Array, default: () => [] },
  canEditRoom: { type: Boolean, default: false },
  showBookedUntil: { type: Boolean, default: false },
  bookedUntil: { type: String, default: '' },
  bookedUntilLabel: { type: String, default: '' },
  canEditBookedUntil: { type: Boolean, default: true },
  showOfficeRequestCta: { type: Boolean, default: false },
  officeRequestActive: { type: Boolean, default: false },
  officeLocations: { type: Array, default: () => [] },
  officeLocationsLoading: { type: Boolean, default: false },
  officeLocationId: { type: Number, default: 0 },
  preferredRoomId: { type: Number, default: 0 },
  preferredRoomOptions: { type: Array, default: () => [] },
  preferredRoomsHint: { type: String, default: '' },
  tenantIconUrl: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  /** Tenant booking suite service — shown after Type (practice category) is set. */
  showService: { type: Boolean, default: false },
  tenantServiceId: { type: Number, default: 0 },
  serviceOptions: { type: Array, default: () => [] },
  servicesLoading: { type: Boolean, default: false },
  showGroupClientsButton: { type: Boolean, default: false },
  /** Soft warning (e.g. in-person + telehealth POS) — does not block save. */
  modalityPosWarning: { type: String, default: '' }
});

const emit = defineEmits([
  'update:dateYmd',
  'update:startTime',
  'update:endTime',
  'update:agencyId',
  'update:appointmentType',
  'update:status',
  'update:locationAddress',
  'update:serviceLocationId',
  'update:roomId',
  'update:bookedUntil',
  'update:officeLocationId',
  'update:preferredRoomId',
  'update:tenantServiceId',
  'request-office',
  'cancel-office-request',
  'scroll-to-group-clients'
]);

const roomPhotoPreviewUrl = ref('');

function roomNumberOf(r) {
  const n = r?.roomNumber ?? r?.room_number;
  return n != null && String(n).trim() !== '' ? String(n).trim() : '';
}
function roomNameOf(r) {
  const num = roomNumberOf(r);
  const raw = String(r?.label || r?.name || '').trim();
  if (num && raw.startsWith(`#${num}`)) return raw.replace(`#${num}`, '').trim() || `Room ${num}`;
  return raw || (num ? `Room ${num}` : `Room #${r?.id || r?.roomId || ''}`);
}
function roomPhotoOf(r) {
  return String(r?.photoUrl || r?.photo_url || '').trim();
}
function previewRoomPhoto(r) {
  const url = roomPhotoOf(r);
  if (url) roomPhotoPreviewUrl.value = url;
}
function roomOptionLabel(r) {
  const base = String(r?.label || r?.name || `Room #${r?.id || r?.roomId || ''}`).trim();
  const state = String(r?.stateLabel || '').trim();
  if (!state) return base;
  if (r?.requestable === false) return `${base} — ${state} (unavailable)`;
  return `${base} — ${state}`;
}

const pad2 = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, '0');

/** Nudge start by ±15 min; parent preserves duration via update:startTime. */
function nudgeStart(deltaMin) {
  const raw = String(props.startTime || '').trim();
  const [hhRaw, mmRaw] = raw.split(':');
  let total = (Number(hhRaw) || 0) * 60 + (Number(mmRaw) || 0) + Number(deltaMin || 0);
  total = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  const next = `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
  emit('update:startTime', next);
}

/** Nudge end by ±15 min only — never moves start (extends/shortens duration). */
function nudgeEnd(deltaMin) {
  const startRaw = String(props.startTime || '').trim();
  const endRaw = String(props.endTime || '').trim();
  const [sh, sm] = startRaw.split(':').map((n) => Number(n));
  const [eh, em] = endRaw.split(':').map((n) => Number(n));
  const startMins = (Number.isFinite(sh) ? sh : 0) * 60 + (Number.isFinite(sm) ? sm : 0);
  let endMins = (Number.isFinite(eh) ? eh : 0) * 60 + (Number.isFinite(em) ? em : 0) + Number(deltaMin || 0);
  const minEnd = startMins + 15;
  if (endMins < minEnd) endMins = minEnd;
  if (endMins >= 24 * 60) endMins = (24 * 60) - 15;
  const next = `${pad2(Math.floor(endMins / 60))}:${pad2(endMins % 60)}`;
  emit('update:endTime', next);
}
</script>

<style scoped>
.ahf {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ahf-card {
  border: 1px solid #d7e3f0;
  border-radius: 12px;
  background: #eef4fa;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
.ahf-top {
  display: flex;
  flex-wrap: nowrap;
  gap: 14px 20px;
  align-items: flex-end;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #dbe5f0;
  background: #e8f0f8;
}
.ahf-when-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}
.ahf-when-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px 8px;
}
.ahf-side-fields {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px 14px;
  align-items: flex-end;
  flex: 0 1 auto;
  min-width: 0;
}
.ahf-tenant-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ahf-tenant-logo {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  object-fit: contain;
  background: #fff;
  border: 1px solid #e2e8f0;
  flex: 0 0 auto;
}
.ahf-details {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 14px;
  padding: 14px 16px 16px;
  background: #eef4fa;
}
.ahf-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1 1 120px;
  max-width: 220px;
}
.ahf-field--action {
  flex: 1 1 200px;
  max-width: 280px;
}
.ahf-action-btn {
  appearance: none;
  width: 100%;
  min-height: 34px;
  border: 1px dashed #94a3b8;
  border-radius: 8px;
  background: #fff;
  color: #1e3a5f;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  text-align: left;
  padding: 6px 10px;
  cursor: pointer;
}
.ahf-action-btn:hover:not(:disabled) {
  border-style: solid;
  border-color: #64748b;
  background: #f8fafc;
}
.ahf-action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ahf-soft-warn {
  margin: 0;
  padding: 8px 16px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #92400e;
  background: #fffbeb;
  border-top: 1px solid #fde68a;
}
.ahf-field--grow {
  flex: 1 1 180px;
  max-width: none;
}
.ahf-field--participant-open {
  background: #eff6ff;
  border-radius: 8px;
  padding: 4px 6px;
  margin: -4px -6px;
}
.ahf-side-fields .ahf-field {
  flex: 1 1 140px;
  max-width: 200px;
}
.ahf-time-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.ahf-nudge {
  display: inline-flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1;
}
.ahf-nudge-btn {
  appearance: none;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  border-radius: 4px;
  padding: 0 4px;
  min-width: 28px;
  height: 14px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 12px;
  cursor: pointer;
}
.ahf-nudge-btn:hover {
  background: #e2e8f0;
  border-color: #94a3b8;
}
.ahf-nudge-btn:active {
  background: #cbd5e1;
}
.ahf-sep {
  color: #94a3b8;
  font-weight: 600;
}
.ahf-tz {
  font-size: 0.72rem;
  color: #64748b;
  white-space: nowrap;
  margin-left: 2px;
}
@media (max-width: 820px) {
  .ahf-top,
  .ahf-when-row,
  .ahf-side-fields {
    flex-wrap: wrap;
  }
}
.ahf-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.ahf-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a !important;
  -webkit-text-fill-color: #0f172a !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-height: 34px;
  display: flex;
  align-items: center;
}
.ahf-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 8px;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  background: #fff !important;
  color: #0f172a !important;
  -webkit-text-fill-color: #0f172a !important;
  color-scheme: light;
  min-height: 34px;
}
.ahf-input--date {
  width: auto;
  min-width: 138px;
  max-width: 160px;
}
.ahf-input--time {
  width: auto;
  min-width: 96px;
  max-width: 118px;
}
.ahf-participant-tray {
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  background: #f8fafc;
  padding: 10px;
}
.ahf-office {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  background: #fff;
}
.ahf-office--active {
  flex-direction: column;
  align-items: stretch;
  border-style: solid;
  border-color: #bfdbfe;
  background: #f8fbff;
}
.ahf-office-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.ahf-office-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ahf-office-copy strong {
  font-size: 0.88rem;
  color: #0f172a;
}
.ahf-office-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
}
.ahf-office-fields .ahf-field {
  flex: 1 1 200px;
  max-width: none;
}
.ahf-office-hint {
  margin: 0;
  font-size: 0.8rem;
}
.ahf-field--rooms { flex-basis: 100%; }
.ahf-room-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow: auto;
}
.ahf-room-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ahf-room-chip {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  text-align: left;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 8px;
  padding: 7px 10px;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  color: #0f172a;
  cursor: pointer;
}
.ahf-room-chip.on,
.ahf-room-row.on .ahf-room-chip {
  border-color: #4f46e5;
  background: #eef2ff;
  color: #3730a3;
}
.ahf-room-row.off { opacity: 0.45; }
.ahf-room-num {
  font-weight: 800;
  color: #4338ca;
}
.ahf-room-state {
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
}
.ahf-room-photo-btn {
  appearance: none;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  padding: 0;
  width: 40px;
  height: 40px;
  overflow: hidden;
  cursor: pointer;
  flex: 0 0 auto;
}
.ahf-room-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ahf-photo-lightbox {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: rgba(15, 23, 42, 0.72);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
}
.ahf-photo-lightbox img {
  max-width: min(920px, 100%);
  max-height: min(80vh, 100%);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  background: #fff;
}
.ahf-photo-close {
  appearance: none;
  border: none;
  background: #fff;
  color: #0f172a;
  font: inherit;
  font-weight: 700;
  border-radius: 999px;
  padding: 8px 16px;
  cursor: pointer;
}
.ahf-link-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: #334155;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
  padding: 2px 4px;
  white-space: nowrap;
}
.ahf-link-btn:hover {
  color: #0f172a;
}
.muted {
  margin: 0;
  color: #64748b;
  font-size: 0.8rem;
}
@media (max-width: 720px) {
  .ahf-field,
  .ahf-side-fields .ahf-field {
    max-width: none;
    flex-basis: calc(50% - 8px);
  }
  .ahf-field--grow {
    flex-basis: 100%;
  }
  .ahf-office {
    flex-wrap: wrap;
  }
}
</style>
