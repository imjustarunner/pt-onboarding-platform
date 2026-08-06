<template>
  <div class="osorb" data-testid="open-slot-office-request-body">
    <p class="osorb-help muted">
      Publish this time as an open slot for booking. Leave office unchecked for virtual availability, or attach an office request for the same series.
    </p>

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
  availableForIntake: { type: Boolean, default: true },
  availableForSession: { type: Boolean, default: false },
  attachOfficeRequest: { type: Boolean, default: false },
  requestNotes: { type: String, default: '' },
  durationWarning: { type: String, default: '' },
  acceptingNewClientsHint: { type: String, default: '' },
  practitionerType: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits([
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
