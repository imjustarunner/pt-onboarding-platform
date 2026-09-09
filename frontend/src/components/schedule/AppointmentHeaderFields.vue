<template>
  <div class="ahf" :class="{ 'ahf--book': bookSessionLayout }" data-testid="appointment-header-fields">
    <!-- Agency + Provider strip -->
    <div class="ahf-agency-strip">
      <div class="ahf-field ahf-field--tenant">
        <span class="ahf-label">Provider · Agency</span>
        <div class="ahf-tenant-row">
          <img v-if="tenantIconUrl" class="ahf-tenant-logo" :src="tenantIconUrl" alt="" />
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

    <!-- Section 1: Date & Time (+ Repeats when book layout) -->
    <section class="ahf-section">
      <header class="ahf-section-head">
        <span class="ahf-section-icon" aria-hidden="true">📅</span>
        <h4 class="ahf-section-title">Date &amp; Time</h4>
      </header>
      <div class="ahf-when-row ahf-when-row--section">
        <label class="ahf-date-picker" :class="{ disabled }">
          <span class="ahf-label">Date</span>
          <span class="ahf-date-display">{{ formattedDateLabel }}</span>
          <input
            class="ahf-input ahf-input--date"
            type="date"
            :value="dateYmd"
            :disabled="disabled"
            aria-label="Appointment date"
            @change="emit('update:dateYmd', String($event.target.value || ''))"
          />
        </label>
        <div class="ahf-time-group">
          <span class="ahf-label">Start time</span>
          <div class="ahf-time-inline">
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
        </div>
        <div class="ahf-time-group">
          <span class="ahf-label">End time</span>
          <div class="ahf-time-inline">
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
        </div>
        <div v-if="bookSessionLayout && showInlineRecurrence" class="ahf-field ahf-field--repeats">
          <span class="ahf-label">Repeats</span>
          <select
            class="ahf-input"
            :value="recurrenceFrequency"
            :disabled="disabled"
            @change="emit('update:recurrenceFrequency', String($event.target.value || 'ONCE'))"
          >
            <option v-for="opt in recurrenceFrequencyOptions" :key="`ahf-rf-${opt.value}`" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        <span v-if="timezoneLabel" class="ahf-tz">{{ timezoneLabel }}</span>
      </div>
      <div v-if="bookSessionLayout && showInlineRecurrence && recurrenceFrequency !== 'ONCE'" class="ahf-recurrence-extra">
        <slot name="recurrence-extra" />
      </div>
    </section>

    <!-- Section 2: Session type & location -->
    <section v-if="showModality || showLocation || showOfficeRequestCta || officeRequestActive" class="ahf-section">
      <header class="ahf-section-head">
        <span class="ahf-section-icon" aria-hidden="true">📍</span>
        <h4 class="ahf-section-title">Session type &amp; location</h4>
      </header>
      <div class="ahf-details ahf-details--section">
        <div v-if="showModality" class="ahf-field ahf-field--modality">
          <span class="ahf-label">Session modality</span>
          <div class="ahf-modality">
            <button
              type="button"
              class="ahf-mod-chip"
              :class="{ on: modality === 'TELEHEALTH' }"
              :disabled="disabled"
              @click="emit('update:modality', 'TELEHEALTH')"
            >
              Virtual
            </button>
            <button
              type="button"
              class="ahf-mod-chip"
              :class="{ on: modality === 'IN_PERSON' }"
              :disabled="disabled"
              @click="emit('update:modality', 'IN_PERSON')"
            >
              In-person
            </button>
          </div>
        </div>

        <div v-if="showModality && modality === 'TELEHEALTH'" class="ahf-field ahf-field--grow">
          <span class="ahf-label">Virtual meeting option</span>
          <select
            class="ahf-input"
            :value="videoRoomMode"
            :disabled="disabled"
            @change="emit('update:videoRoomMode', String($event.target.value || 'unique_session'))"
          >
            <option value="unique_session">Unique link for this session</option>
            <option value="my_room">Use my room (personal link)</option>
          </select>
        </div>

        <p
          v-if="showModality && modality === 'TELEHEALTH' && videoRoomMode !== 'my_room'"
          class="ahf-info-banner"
          role="status"
        >
          A virtual meeting link will be available after booking.
        </p>

        <div v-if="showLocation" class="ahf-field ahf-field--grow">
          <span class="ahf-label">{{ modality === 'TELEHEALTH' ? 'Office location / room (optional)' : 'Location' }}</span>
          <select
            v-if="locationOptions.length"
            class="ahf-input"
            :value="serviceLocationId"
            :disabled="disabled || !canEditLocation"
            @change="emit('update:serviceLocationId', Number($event.target.value || 0))"
          >
            <option :value="0">{{ modality === 'TELEHEALTH' ? 'No office location' : 'Select location…' }}</option>
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
            :placeholder="modality === 'IN_PERSON' ? 'Address or place (e.g. park, school)' : 'Optional'"
            @change="emit('update:locationAddress', String($event.target.value || ''))"
          />
          <p v-if="adminCatalogLinks" class="ahf-admin-link-wrap">
            <a class="ahf-admin-link" :href="adminCatalogLinks.locations" target="_blank" rel="noopener">Update locations ↗</a>
          </p>
        </div>

        <div v-if="showRoom && roomOptions.length" class="ahf-field">
          <span class="ahf-label">Room</span>
          <select
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
        </div>

        <div v-if="showOfficeRequestCta || officeRequestActive" class="ahf-field ahf-field--full">
          <div
            class="ahf-office"
            :class="{ 'ahf-office--active': officeRequestActive }"
            data-testid="appointment-office-request"
          >
            <template v-if="!officeRequestActive">
              <div class="ahf-office-copy">
                <strong>No office room assigned</strong>
                <span class="muted">{{ officeRoomHelpText }}</span>
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
                  <span class="muted">{{ officeRoomHelpText }}</span>
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
                        type="button"
                        class="ahf-room-photo-btn"
                        :title="roomPhotoOf(r) ? 'View room photos' : 'Room photos'"
                        @click="openRoomPhotos(r)"
                      >
                        <img v-if="roomPhotoOf(r)" :src="roomPhotoOf(r)" alt="" class="ahf-room-thumb" />
                        <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <circle cx="8.5" cy="10" r="1.5" />
                          <path d="M21 16l-5.5-5.5L9 17" />
                        </svg>
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
                {{ officeLocationsLoading ? 'Loading offices…' : 'No office locations found for this agency.' }}
              </p>
            </template>
          </div>
        </div>
      </div>
      <p v-if="modalityPosWarning" class="ahf-soft-warn" role="status">{{ modalityPosWarning }}</p>
    </section>

    <!-- Section 3: Service & clients -->
    <section
      v-if="showType || showService || showPrimaryServiceCode || showParticipant || showGroupClients || showAddonServiceCodes || showStatus || showOccurrenceCount || showBookedUntil"
      class="ahf-section"
    >
      <header class="ahf-section-head">
        <span class="ahf-section-icon" aria-hidden="true">👥</span>
        <h4 class="ahf-section-title">Service &amp; clients</h4>
      </header>
      <div class="ahf-details ahf-details--section">
        <div v-if="showType && typeOptions.length > 1" class="ahf-field">
          <span class="ahf-label">Type</span>
          <select
            class="ahf-input"
            :value="appointmentType"
            :disabled="disabled || !canEditType"
            @change="emit('update:appointmentType', String($event.target.value || ''))"
          >
            <option v-for="opt in typeOptions" :key="`ahf-type-${opt.value}`" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
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

        <div v-if="showPrimaryServiceCode" class="ahf-field ahf-field--grow">
          <span class="ahf-label">Service code <span class="ahf-req">*</span></span>
          <select
            class="ahf-input"
            :value="primaryServiceCode"
            :disabled="disabled || !primaryServiceCodeOptions.length"
            @change="emit('update:primaryServiceCode', String($event.target.value || ''))"
          >
            <option value="">Select service code…</option>
            <option
              v-for="opt in primaryServiceCodeOptions"
              :key="`ahf-psc-${opt.code}`"
              :value="opt.code"
            >
              {{ formatCodeLabel(opt) }}
            </option>
          </select>
          <p v-if="adminCatalogLinks" class="ahf-admin-link-wrap">
            <a class="ahf-admin-link" :href="adminCatalogLinks.serviceCodes" target="_blank" rel="noopener">Update service codes ↗</a>
          </p>
        </div>

        <div
          v-if="showParticipant"
          class="ahf-field"
          :class="{ 'ahf-field--participant-open': participantTrayOpen }"
        >
          <span class="ahf-label">{{ participantLabel }} <span v-if="bookSessionLayout" class="ahf-req">*</span></span>
          <slot name="participant">
            <span class="ahf-value">{{ participantSummary || '—' }}</span>
          </slot>
        </div>

        <div v-if="showOthersPresent" class="ahf-field ahf-field--grow">
          <span class="ahf-label">Others present (name)</span>
          <input
            class="ahf-input"
            type="text"
            maxlength="500"
            :value="othersPresentNames"
            :disabled="disabled"
            placeholder="Type names of others attending…"
            @input="emit('update:othersPresentNames', String($event.target.value || ''))"
          />
        </div>

        <div v-if="showGroupClientsButton && !showGroupClients" class="ahf-field ahf-field--action">
          <span class="ahf-label">Additional clients</span>
          <button
            type="button"
            class="ahf-action-btn"
            :disabled="disabled"
            @click="emit('scroll-to-group-clients')"
          >
            + Add clients
          </button>
        </div>

        <div v-if="showStatus" class="ahf-field">
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
          <span v-else class="ahf-value">{{ status || 'Scheduled' }}</span>
        </div>

        <div v-if="showOccurrenceCount" class="ahf-field">
          <span class="ahf-label">Booked</span>
          <span class="ahf-value">{{ occurrenceCountLabel }}</span>
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

        <div v-if="showAddonServiceCodes && addonServiceCodeOptions.length" class="ahf-field ahf-field--full">
          <span class="ahf-label">Add-ons</span>
          <div class="ahf-addon-list">
            <label
              v-for="opt in addonServiceCodeOptions"
              :key="`ahf-addon-${opt.code}`"
              class="ahf-check"
            >
              <input
                type="checkbox"
                :checked="addonCodeSet.has(String(opt.code || '').toUpperCase())"
                :disabled="disabled"
                @change="toggleAddon(opt.code)"
              />
              <span>{{ formatCodeLabel(opt) }}</span>
            </label>
          </div>
          <p v-if="adminCatalogLinks" class="ahf-admin-link-wrap">
            <a class="ahf-admin-link" :href="adminCatalogLinks.addons" target="_blank" rel="noopener">Update add-ons ↗</a>
          </p>
        </div>

        <div v-if="showGroupClients" class="ahf-field ahf-field--full" id="ahf-group-clients">
          <div class="ahf-group-head">
            <span class="ahf-label">Additional clients (optional)</span>
            <button
              type="button"
              class="ahf-action-btn"
              :disabled="disabled"
              @click="groupExpanded = !groupExpanded"
            >
              {{ groupExpanded ? 'Hide' : '+ Add clients' }}
            </button>
          </div>
          <p class="ahf-hint">Add additional clients for a group session.</p>
          <div v-if="groupExpanded" class="ahf-group-list">
            <label
              v-for="c in groupClientOptions"
              :key="`ahf-gc-${c.id}`"
              class="ahf-check"
            >
              <input
                type="checkbox"
                :checked="selectedClientIdSet.has(Number(c.id))"
                :disabled="disabled || groupClientsLoading"
                @change="toggleGroupClient(Number(c.id))"
              />
              <span>{{ c.displayName || c.fullName || `Client #${c.id}` }}</span>
            </label>
            <p v-if="groupClientsLoading" class="ahf-hint">Loading clients…</p>
            <p v-else-if="!groupClientOptions.length" class="ahf-hint">No other assigned clients to add.</p>
          </div>
        </div>
      </div>
    </section>

    <div v-if="showParticipant && participantTrayOpen && $slots['participant-tray']" class="ahf-participant-tray">
      <slot name="participant-tray" />
    </div>

    <!-- Section 4: Notifications -->
    <section v-if="showNotifications" class="ahf-section">
      <header class="ahf-section-head">
        <span class="ahf-section-icon" aria-hidden="true">🔔</span>
        <h4 class="ahf-section-title">Notifications</h4>
      </header>
      <div class="ahf-notif-toggles">
        <button
          type="button"
          class="ahf-mod-chip"
          :class="{ on: notificationMode === 'default' }"
          :disabled="disabled"
          @click="emit('update:notificationMode', 'default')"
        >
          Default
        </button>
        <button
          type="button"
          class="ahf-mod-chip"
          :class="{ on: notificationMode === 'customizable' }"
          :disabled="disabled"
          @click="emit('update:notificationMode', 'customizable')"
        >
          Customizable
        </button>
      </div>
      <p v-if="notificationMode === 'default'" class="ahf-info-banner ahf-info-banner--ok" role="status">
        Uses organization default reminders. Clients and providers will be notified per your organization's settings. Client preferences override the default.
      </p>
      <p v-else class="ahf-hint">
        You can add an extra reminder for this session. Client opt-outs and channel preferences still apply. Texting is TBD — email and in-app are standard.
      </p>
    </section>

    <!-- Section 5: Notes -->
    <section v-if="showSchedulingNotes" class="ahf-section">
      <header class="ahf-section-head">
        <span class="ahf-section-icon" aria-hidden="true">📝</span>
        <h4 class="ahf-section-title">Notes</h4>
      </header>
      <div class="ahf-notes-wrap">
        <textarea
          class="ahf-input ahf-notes"
          rows="2"
          maxlength="500"
          :value="schedulingNotes"
          :disabled="disabled"
          placeholder="Optional scheduling notes…"
          @input="emit('update:schedulingNotes', String($event.target.value || '').slice(0, 500))"
        />
        <span class="ahf-notes-count">{{ String(schedulingNotes || '').length }}/500</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

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
  showType: { type: Boolean, default: true },
  showParticipant: { type: Boolean, default: true },
  participantLabel: { type: String, default: 'Participant' },
  participantSummary: { type: String, default: '' },
  /** When true, render participant-tray immediately under the strip */
  participantTrayOpen: { type: Boolean, default: false },
  status: { type: String, default: 'confirmed' },
  statusOptions: { type: Array, default: () => [] },
  canEditStatus: { type: Boolean, default: true },
  showStatus: { type: Boolean, default: true },
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
  modalityPosWarning: { type: String, default: '' },
  showPrimaryServiceCode: { type: Boolean, default: false },
  primaryServiceCode: { type: String, default: '' },
  primaryServiceCodeOptions: { type: Array, default: () => [] },
  showAddonServiceCodes: { type: Boolean, default: false },
  addonServiceCodes: { type: Array, default: () => [] },
  addonServiceCodeOptions: { type: Array, default: () => [] },
  showModality: { type: Boolean, default: false },
  modality: { type: String, default: 'TELEHEALTH' },
  showGroupClients: { type: Boolean, default: false },
  groupClientOptions: { type: Array, default: () => [] },
  selectedClientIds: { type: Array, default: () => [] },
  primaryClientId: { type: Number, default: 0 },
  groupClientsLoading: { type: Boolean, default: false },
  forceExpandGroupClients: { type: Boolean, default: false },
  /** Mockup sectioned Book Session layout */
  bookSessionLayout: { type: Boolean, default: false },
  showInlineRecurrence: { type: Boolean, default: false },
  recurrenceFrequency: { type: String, default: 'ONCE' },
  recurrenceFrequencyOptions: { type: Array, default: () => [{ value: 'ONCE', label: 'Does not repeat' }] },
  videoRoomMode: { type: String, default: 'unique_session' },
  showNotifications: { type: Boolean, default: false },
  notificationMode: { type: String, default: 'default' },
  showSchedulingNotes: { type: Boolean, default: false },
  schedulingNotes: { type: String, default: '' },
  showOthersPresent: { type: Boolean, default: false },
  othersPresentNames: { type: String, default: '' },
  /** { serviceCodes, addons, locations } admin medical-billing URLs */
  adminCatalogLinks: { type: Object, default: null }
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
  'update:primaryServiceCode',
  'update:addonServiceCodes',
  'update:modality',
  'update:selectedClientIds',
  'update:recurrenceFrequency',
  'update:videoRoomMode',
  'update:notificationMode',
  'update:schedulingNotes',
  'update:othersPresentNames',
  'request-office',

  'cancel-office-request',
  'scroll-to-group-clients',
  'open-room-photos'
]);

const groupExpanded = ref(false);

watch(
  () => props.forceExpandGroupClients,
  (v) => {
    if (v) groupExpanded.value = true;
  }
);
watch(
  () => (props.selectedClientIds || []).length,
  (n) => {
    if (n > 1) groupExpanded.value = true;
  }
);

const formattedDateLabel = computed(() => {
  const ymd = String(props.dateYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return 'Pick a date';
  const [y, m, d] = ymd.split('-').map((n) => Number(n));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(dt.getTime())) return ymd;
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
});
const singleTypeLabel = computed(() => {
  if ((props.typeOptions || []).length === 1) return props.typeOptions[0].label;
  return '';
});

const addonCodeSet = computed(
  () => new Set((props.addonServiceCodes || []).map((c) => String(c || '').toUpperCase()).filter(Boolean))
);
const selectedClientIdSet = computed(
  () => new Set((props.selectedClientIds || []).map((n) => Number(n)).filter((n) => n > 0))
);

function formatCodeLabel(opt) {
  const code = String(opt?.code || '').trim().toUpperCase();
  let label = String(opt?.label || '').trim();
  if (!code) return label || '';
  if (!label) return code;
  const upper = label.toUpperCase();
  if (upper === code || upper.startsWith(`${code} `) || upper.startsWith(`${code}—`) || upper.startsWith(`${code} -`)) {
    return label;
  }
  return `${code} — ${label}`;
}

function toggleAddon(code) {
  const c = String(code || '').toUpperCase();
  if (!c) return;
  const next = new Set(addonCodeSet.value);
  if (next.has(c)) next.delete(c);
  else next.add(c);
  emit('update:addonServiceCodes', Array.from(next.values()));
}

function toggleGroupClient(id) {
  const n = Number(id || 0);
  if (!n) return;
  const primary = Number(props.primaryClientId || 0);
  const next = new Set(selectedClientIdSet.value);
  if (primary > 0) next.add(primary);
  if (next.has(n) && n !== primary) next.delete(n);
  else next.add(n);
  emit('update:selectedClientIds', Array.from(next.values()));
}

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
function openRoomPhotos(r) {
  const roomId = Number(r?.id || r?.roomId || 0);
  if (!roomId) return;
  emit('open-room-photos', {
    roomId,
    officeId: Number(props.officeLocationId || 0),
    roomLabel: `${roomNumberOf(r) ? `#${roomNumberOf(r)} ` : ''}${roomNameOf(r)}`.trim(),
    photoUrl: roomPhotoOf(r)
  });
}
function roomOptionLabel(r) {
  const base = String(r?.label || r?.name || `Room #${r?.id || r?.roomId || ''}`).trim();
  const state = String(r?.stateLabel || '').trim();
  if (!state) return base;
  if (r?.requestable === false) return `${base} — ${state} (unavailable)`;
  return `${base} — ${state}`;
}


const officeRoomHelpText = computed(() => {
  if (String(props.modality || '') === 'TELEHEALTH') {
    return 'Use this if you want to work from the office or need a room. This does not change the session modality — the client stays virtual.';
  }
  return 'Request a room for this appointment or series. In-person sessions use the booked room as the session location.';
});

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
.ahf-when-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px 8px;
}
.ahf-date-picker {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 168px;
  cursor: pointer;
}
.ahf-date-picker.disabled { cursor: not-allowed; opacity: 0.65; }
.ahf-date-display {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  font-size: 0.86rem;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
  pointer-events: none;
}
.ahf-date-picker .ahf-input--date {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}
.ahf-when-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1.4 1 280px;
  min-width: 0;
}
.ahf-side-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: flex-end;
  flex: 0.8 1 220px;
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
.ahf-field--full {
  flex: 1 1 100%;
}
.ahf-req { color: #b91c1c; }
.ahf-modality {
  display: flex;
  gap: 6px;
}
.ahf-mod-chip {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.ahf-mod-chip.on {
  background: #0f172a;
  border-color: #0f172a;
  color: #fff;
}
.ahf-addon-list,
.ahf-group-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
.ahf-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.86rem;
  color: #0f172a;
}
.ahf-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ahf-hint {
  margin: 4px 0 0;
  font-size: 0.78rem;
  color: #64748b;
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

.ahf--book { gap: 14px; }
.ahf-agency-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}
.ahf-section {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ahf-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ahf-section-icon { font-size: 14px; line-height: 1; }
.ahf-section-title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.01em;
}
.ahf-when-row--section {
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 12px;
}
.ahf-time-inline {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ahf-details--section {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  padding: 0;
  border: 0;
  background: transparent;
}
.ahf-info-banner {
  flex: 1 1 100%;
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e3a8a;
  font-size: 0.82rem;
  line-height: 1.4;
}
.ahf-info-banner--ok {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #065f46;
}
.ahf-admin-link-wrap { margin: 4px 0 0; }
.ahf-admin-link {
  font-size: 0.72rem;
  font-weight: 700;
  color: #1d4ed8;
  text-decoration: none;
}
.ahf-admin-link:hover { text-decoration: underline; }
.ahf-notif-toggles { display: flex; gap: 8px; flex-wrap: wrap; }
.ahf-notes-wrap { position: relative; }
.ahf-notes { width: 100%; min-height: 64px; resize: vertical; }
.ahf-notes-count {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: 0.7rem;
  color: #94a3b8;
  font-weight: 600;
}
.ahf-field--repeats { min-width: 160px; }
.ahf-recurrence-extra { margin-top: 4px; }
</style>
