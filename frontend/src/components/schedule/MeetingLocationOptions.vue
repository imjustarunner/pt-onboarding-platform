<template>
  <div class="meeting-location">
    <label>
      <span>Meeting location</span>
      <select aria-label="Meeting location" :value="location" :disabled="disabled" @change="setLocation($event.target.value)">
        <option value="in_person">In person — no video room</option>
        <option v-if="videoConfigured" value="platform">Platform video — join in this app</option>
        <option value="meet">Google Meet — create a Meet link</option>
        <option value="external">Other virtual — arrange your own link</option>
      </select>
    </label>
    <p>{{ hints[location] }}</p>
    <label v-if="location === 'platform'" class="waiting-room">
      <input type="checkbox" :checked="waitingRoomEnabled" :disabled="disabled" @change="emit('update:waitingRoomEnabled', $event.target.checked)" />
      Waiting room — participants wait for the host to admit them
    </label>
  </div>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({
  isVirtual: Boolean, usePlatformVideo: Boolean, createMeetLink: Boolean,
  videoConfigured: Boolean, waitingRoomEnabled: Boolean, disabled: Boolean
});
const emit = defineEmits(['update:isVirtual', 'update:usePlatformVideo', 'update:createMeetLink', 'update:waitingRoomEnabled']);
const location = computed(() => !props.isVirtual ? 'in_person'
  : props.usePlatformVideo && props.videoConfigured ? 'platform' : props.createMeetLink ? 'meet' : 'external');
const hints = {
  in_person: 'Meet at your agreed location; no video link is created.',
  platform: 'Creates one in-app video room. Open it from your calendar or invitation.',
  meet: 'Creates a Google Meet link through the connected calendar.',
  external: 'No video link is created. Share your chosen service’s link with attendees.'
};
function setLocation(value) {
  emit('update:isVirtual', value !== 'in_person');
  emit('update:usePlatformVideo', value === 'platform');
  emit('update:createMeetLink', value === 'meet');
}
</script>
<style scoped>
.meeting-location { display: grid; gap: 8px; }
label { display: grid; gap: 6px; font-weight: 600; }
select { width: 100%; min-width: 0; padding: 9px; border: 1px solid #cbd5e1; border-radius: 8px; background: white; color: #0f172a; font: inherit; }
p { margin: 0; color: #64748b; font-size: .82rem; }
.waiting-room { display: flex; align-items: center; font-size: .85rem; font-weight: 400; }
</style>
