<template>
  <div class="osorb" data-testid="open-slot-office-request-body">
    <p class="osorb-help muted">
      Publish availability for this provider. Link an existing office reservation to offer virtual visits, in-person visits, or both at that office.
    </p>

    <fieldset class="osorb-panel"><legend>Care types for this opening</legend><label v-for="type in ['INDIVIDUAL','COUPLES','FAMILY']" :key="type" class="osorb-check"><input type="checkbox" :checked="careTypes.includes(type)" @change="emit('update:careTypes',$event.target.checked?[...careTypes,type]:careTypes.filter(t=>t!==type))"/> {{type}}</label><p class="osorb-help muted">Select all that apply. The provider must also offer the selected service.</p></fieldset>
    <fieldset class="osorb-panel" data-testid="appointment-format">
      <legend>Appointment format</legend>
      <p v-if="canLinkOffice &amp;&amp; frequency!=='ONCE'" class="osorb-help muted">For office-linked recurring openings, we publish matching existing room reservations over the next year. Dates with client appointments are skipped; future unreserved rooms are not published.</p>
    <label v-if="frequency==='ONCE'" class="osorb-check">One-time opening
      <select :value="purpose" @change="emit('update:purpose',$event.target.value)"><option value="INTAKE">Single intake session</option><option value="MEETING">Meeting</option></select>
    </label>
    <p class="osorb-help muted">Recurring new-client openings offer an ongoing appointment. A one-time opening offers only an intake or meeting. Current-client-only openings are for rescheduling and are not shown publicly.</p>
    <label class="osorb-check"><input type="checkbox" :checked="virtualEnabled" :disabled="disabled" @change="emit('update:virtualEnabled', $event.target.checked)" /> Virtual</label>
      <label class="osorb-check"><input type="checkbox" :checked="inPersonEnabled" :disabled="disabled || !canLinkOffice" @change="emit('update:inPersonEnabled', $event.target.checked)" /> In person at the linked office</label>
      <p v-if="!canLinkOffice" class="osorb-help muted">Reserve an office first to publish in-person openings.</p>
    </fieldset>

    <label class="osorb-check">
      <input
        type="checkbox"
        :checked="availableForIntake"
        :disabled="disabled"
        @change="emit('update:availableForIntake', !!$event.target.checked)"
      />
      <span>{{ intakeLabel }}</span>
    </label>
    <label class="osorb-check">
      <input
        type="checkbox"
        :checked="availableForSession"
        :disabled="disabled"
        @change="emit('update:availableForSession', !!$event.target.checked)"
      />
      <span>{{ sessionLabel }}</span>
    </label>
    <p v-if="!availableForIntake && !availableForSession" class="osorb-warn" role="status">
      Select at least one availability option to publish an open slot.
    </p>

    <label class="osorb-check">
      <input
        type="checkbox"
        :checked="attachOfficeRequest"
        :disabled="disabled"
        @change="emit('update:attachOfficeRequest', !!$event.target.checked)"
      />
      <span>Also request office for this duration / series</span>
    </label>

    <p v-if="durationWarning" class="osorb-warn" role="status">
      {{ durationWarning }}
    </p>

    <p
      v-if="acceptingNewClientsHint"
      class="osorb-warn"
      role="status"
    >
      {{ acceptingNewClientsHint }}
    </p>

    <div v-if="attachOfficeRequest" class="osorb-panel">
      <div class="osorb-row">
        <label class="osorb-label">Request notes</label>
        <textarea
          class="osorb-input"
          rows="2"
          :value="requestNotes"
          :disabled="disabled"
          placeholder="Why you need the room…"
          @input="emit('update:requestNotes', $event.target.value)"
        />
      </div>
      <p class="osorb-help muted" style="margin: 0;">
        Choose office and open room in the Office request panel above.
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { openSlotAvailabilityLabels } from '../../utils/openSlotAvailabilityLabels.js';

const props = defineProps({
  careTypes:{type:Array,default:()=>['INDIVIDUAL','COUPLES','FAMILY']},
  frequency:{type:String,default:'WEEKLY'},
  purpose:{type:String,default:'INTAKE'},
  virtualEnabled: { type: Boolean, default: true },
  inPersonEnabled: { type: Boolean, default: false },
  canLinkOffice: { type: Boolean, default: false },
  availableForIntake: { type: Boolean, default: true },
  availableForSession: { type: Boolean, default: false },
  attachOfficeRequest: { type: Boolean, default: false },
  requestNotes: { type: String, default: '' },
  durationWarning: { type: String, default: '' },
  acceptingNewClientsHint: { type: String, default: '' },
  practitionerType: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['update:careTypes',
  'update:purpose',
  'update:virtualEnabled',
  'update:inPersonEnabled',
  'update:availableForIntake',
  'update:availableForSession',
  'update:attachOfficeRequest',
  'update:requestNotes'
]);

const labels = computed(() => openSlotAvailabilityLabels(props.practitionerType));
const intakeLabel = computed(() => labels.value.intake);
const sessionLabel = computed(() => labels.value.session);
</script>

<style scoped>
.osorb { display: flex; flex-direction: column; gap: 12px; }
.osorb-help { margin: 0; font-size: 0.86rem; }
.osorb-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
}
.osorb-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e8eef5;
  border-radius: 12px;
  background: #f8fafc;
}
.osorb-row { display: flex; flex-direction: column; gap: 4px; }
.osorb-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.osorb-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
}
.osorb-warn {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #9a3412;
  font-size: 0.84rem;
}
.muted { color: #64748b; }
</style>
