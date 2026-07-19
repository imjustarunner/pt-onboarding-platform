<template>
  <div class="osorb" data-testid="open-slot-office-request-body">
    <p class="osorb-help muted">
      Publish this time as an open in-office slot and optionally attach an office request for the same series.
    </p>

    <label class="osorb-check">
      <input
        type="checkbox"
        :checked="openSlotEnabled"
        :disabled="disabled"
        @change="emit('update:openSlotEnabled', !!$event.target.checked)"
      />
      <span>Open slot for booking</span>
    </label>

    <label class="osorb-check">
      <input
        type="checkbox"
        :checked="attachOfficeRequest"
        :disabled="disabled"
        @change="emit('update:attachOfficeRequest', !!$event.target.checked)"
      />
      <span>Also request office for this duration / series</span>
    </label>

    <div v-if="attachOfficeRequest" class="osorb-panel">
      <div class="osorb-row">
        <label class="osorb-label">Office / location</label>
        <select
          class="osorb-input"
          :value="officeLocationId"
          :disabled="disabled"
          @change="emit('update:officeLocationId', Number($event.target.value || 0))"
        >
          <option :value="0">Any available / admin assigns</option>
          <option v-for="loc in officeLocations" :key="loc.id" :value="Number(loc.id)">
            {{ loc.name || loc.label || `Office #${loc.id}` }}
          </option>
        </select>
      </div>
      <div class="osorb-row">
        <label class="osorb-label">Preferred room</label>
        <select
          class="osorb-input"
          :value="preferredRoomId"
          :disabled="disabled"
          @change="emit('update:preferredRoomId', Number($event.target.value || 0))"
        >
          <option :value="0">Any open room</option>
          <option v-for="r in roomOptions" :key="r.id" :value="Number(r.id)">
            {{ r.label || r.name || `Room #${r.id}` }}
          </option>
        </select>
      </div>
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
    </div>
  </div>
</template>

<script setup>
defineProps({
  openSlotEnabled: { type: Boolean, default: true },
  attachOfficeRequest: { type: Boolean, default: false },
  officeLocationId: { type: Number, default: 0 },
  preferredRoomId: { type: Number, default: 0 },
  officeLocations: { type: Array, default: () => [] },
  roomOptions: { type: Array, default: () => [] },
  requestNotes: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits([
  'update:openSlotEnabled',
  'update:attachOfficeRequest',
  'update:officeLocationId',
  'update:preferredRoomId',
  'update:requestNotes'
]);
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
.muted { color: #64748b; }
</style>
