<template>
  <div class="aes" data-testid="appointment-editor-shell">
    <header v-if="!hideChrome" class="aes-head">
      <div class="aes-head-copy">
        <h2 class="aes-title">{{ title }}</h2>
        <p v-if="subtitle" class="aes-sub">{{ subtitle }}</p>
      </div>
      <div class="aes-head-actions">
        <slot name="head-actions" />
      </div>
    </header>

    <AppointmentHeaderFields
      v-bind="headerProps"
      :participant-tray-open="participantTrayOpen"
      @update:dateYmd="emit('update:dateYmd', $event)"
      @update:startTime="emit('update:startTime', $event)"
      @update:endTime="emit('update:endTime', $event)"
      @update:agencyId="emit('update:agencyId', $event)"
      @update:appointmentType="emit('update:appointmentType', $event)"
      @update:status="emit('update:status', $event)"
      @update:locationAddress="emit('update:locationAddress', $event)"
      @update:serviceLocationId="emit('update:serviceLocationId', $event)"
      @update:roomId="emit('update:roomId', $event)"
      @update:bookedUntil="emit('update:bookedUntil', $event)"
      @update:officeLocationId="emit('update:officeLocationId', $event)"
      @update:preferredRoomId="emit('update:preferredRoomId', $event)"
      @update:tenantServiceId="emit('update:tenantServiceId', $event)"
      @request-office="emit('request-office')"
      @cancel-office-request="emit('cancel-office-request')"
      @scroll-to-group-clients="emit('scroll-to-group-clients')"
    >
      <template #provider>
        <slot name="provider" />
      </template>
      <template #participant>
        <slot name="participant" />
      </template>
      <template #participant-tray>
        <slot name="participant-tray" />
      </template>
    </AppointmentHeaderFields>

    <VirtualLinkControls
      v-if="showVirtual && !hideVirtualControls"
      :is-virtual="true"
      :link="virtualLink"
      :meet-link="meetLink"
      :platform-link="platformLink"
      :hint="virtualHint"
      :dismissible="virtualDismissible"
      @dismiss="emit('dismiss-virtual')"
    />

    <RecurrenceControls
      v-if="showRecurrence"
      :frequency="recurrenceFrequency"
      :end-mode="recurrenceEndMode"
      :occurrence-count="recurrenceOccurrenceCount"
      :until-date="recurrenceUntilDate"
      :weekdays="recurrenceWeekdays"
      :occurrence-label="recurrenceOccurrenceLabel"
      :disabled="disabled"
      @update:frequency="emit('update:recurrenceFrequency', $event)"
      @update:endMode="emit('update:recurrenceEndMode', $event)"
      @update:occurrenceCount="emit('update:recurrenceOccurrenceCount', $event)"
      @update:untilDate="emit('update:recurrenceUntilDate', $event)"
      @update:weekdays="emit('update:recurrenceWeekdays', $event)"
    />

    <div class="aes-body">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="aes-foot">
      <slot name="footer" />
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import AppointmentHeaderFields from './AppointmentHeaderFields.vue';
import VirtualLinkControls from './VirtualLinkControls.vue';
import RecurrenceControls from './RecurrenceControls.vue';

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  /** When embedded in Schedule modal that already has a title bar */
  hideChrome: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  showVirtual: { type: Boolean, default: false },
  hideVirtualControls: { type: Boolean, default: false },
  virtualLink: { type: String, default: '' },
  meetLink: { type: String, default: '' },
  platformLink: { type: String, default: '' },
  virtualHint: { type: String, default: '' },
  virtualDismissible: { type: Boolean, default: false },
  showRecurrence: { type: Boolean, default: true },
  recurrenceFrequency: { type: String, default: 'ONCE' },
  recurrenceEndMode: { type: String, default: 'count' },
  recurrenceOccurrenceCount: { type: Number, default: 4 },
  recurrenceUntilDate: { type: String, default: '' },
  recurrenceWeekdays: { type: Array, default: () => [] },
  recurrenceOccurrenceLabel: { type: String, default: '' },
  // header field passthrough
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
  showService: { type: Boolean, default: false },
  tenantServiceId: { type: Number, default: 0 },
  serviceOptions: { type: Array, default: () => [] },
  servicesLoading: { type: Boolean, default: false },
  showGroupClientsButton: { type: Boolean, default: false },
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
  'update:recurrenceFrequency',
  'update:recurrenceEndMode',
  'update:recurrenceOccurrenceCount',
  'update:recurrenceUntilDate',
  'update:recurrenceWeekdays',
  'request-office',
  'cancel-office-request',
  'scroll-to-group-clients',
  'dismiss-virtual'
]);

const headerProps = computed(() => ({
  dateYmd: props.dateYmd,
  startTime: props.startTime,
  endTime: props.endTime,
  timezoneLabel: props.timezoneLabel,
  agencyId: props.agencyId,
  tenantOptions: props.tenantOptions,
  tenantLabel: props.tenantLabel,
  canEditTenant: props.canEditTenant,
  providerLabel: props.providerLabel,
  providerName: props.providerName,
  appointmentType: props.appointmentType,
  appointmentTypeLabel: props.appointmentTypeLabel,
  typeOptions: props.typeOptions,
  canEditType: props.canEditType,
  showParticipant: props.showParticipant,
  participantLabel: props.participantLabel,
  participantSummary: props.participantSummary,
  status: props.status,
  statusOptions: props.statusOptions,
  canEditStatus: props.canEditStatus,
  showOccurrenceCount: props.showOccurrenceCount,
  occurrenceCountLabel: props.occurrenceCountLabel,
  showLocation: props.showLocation,
  locationAddress: props.locationAddress,
  locationOptions: props.locationOptions,
  serviceLocationId: props.serviceLocationId,
  canEditLocation: props.canEditLocation,
  showRoom: props.showRoom,
  roomId: props.roomId,
  roomLabel: props.roomLabel,
  roomOptions: props.roomOptions,
  canEditRoom: props.canEditRoom,
  showBookedUntil: props.showBookedUntil,
  bookedUntil: props.bookedUntil,
  bookedUntilLabel: props.bookedUntilLabel,
  canEditBookedUntil: props.canEditBookedUntil,
  showOfficeRequestCta: props.showOfficeRequestCta,
  officeRequestActive: props.officeRequestActive,
  officeLocations: props.officeLocations,
  officeLocationsLoading: props.officeLocationsLoading,
  officeLocationId: props.officeLocationId,
  preferredRoomId: props.preferredRoomId,
  preferredRoomOptions: props.preferredRoomOptions,
  preferredRoomsHint: props.preferredRoomsHint,
  tenantIconUrl: props.tenantIconUrl,
  disabled: props.disabled,
  showService: props.showService,
  tenantServiceId: props.tenantServiceId,
  serviceOptions: props.serviceOptions,
  servicesLoading: props.servicesLoading,
  showGroupClientsButton: props.showGroupClientsButton,
  modalityPosWarning: props.modalityPosWarning
}));
</script>

<style scoped>
.aes {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
}
.aes-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.aes-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}
.aes-sub {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 0.86rem;
}
.aes-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.aes-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #e8eef5;
}
</style>
