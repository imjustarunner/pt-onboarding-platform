<template>
  <form class="school-availability" @submit.prevent="save">
    <fieldset :disabled="busy || readonly">
      <legend>Availability for in-school services</legend>
      <p>Share the weekdays and hours you can work in schools. Selected days start at 8:00 a.m.–3:00 p.m.; adjust them to fit your availability. Use local school time.</p>
      <p>People Operations will use these preferences to arrange your placement and confirm your school schedule.</p>
      <div class="availability-choice">
        <label><input v-model="available" type="radio" name="school-available" :value="true" required /> I have availability for in-school services</label>
        <label><input v-model="available" type="radio" name="school-available" :value="false" required /> I do not currently have in-school availability</label>
      </div>
      <div v-if="available" class="school-days">
        <div v-for="day in days" :key="day.name" class="school-day" :class="{ selected: day.selected }">
          <label class="day-name"><input v-model="day.selected" type="checkbox" /> {{ day.name }}</label>
          <template v-if="day.selected">
            <label>Start<input v-model="day.startTime" type="time" :aria-label="`${day.name} start time`" required /></label>
            <label>End<input v-model="day.endTime" type="time" :aria-label="`${day.name} end time`" required /></label>
          </template>
          <span v-else class="day-unselected">Not selected</span>
        </div>
      </div>
      <label class="notes">Scheduling notes (optional)<textarea v-model="notes" maxlength="2000" rows="3" placeholder="Share start dates, travel needs, or other scheduling limits." /></label>
      <p v-if="error" role="alert">{{ error }}</p>
      <button v-if="!readonly" type="submit">{{ busy ? 'Saving…' : 'Save school availability' }}</button>
    </fieldset>
  </form>
</template>
<script setup>
import { ref, watch } from 'vue';
const props = defineProps({ step: { type: Object, required: true }, busy: Boolean, readonly: Boolean });
const emit = defineEmits(['save']);
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const available = ref(null), days = ref([]), notes = ref(''), error = ref('');
watch(() => props.step.values, value => {
  available.value = typeof value?.available === 'boolean' ? value.available : null;
  notes.value = value?.notes || '';
  days.value = weekdays.map(name => {
    const saved = value?.blocks?.find(block => block.dayOfWeek === name);
    return { name, selected: !!saved, startTime: saved?.startTime || '08:00', endTime: saved?.endTime || '15:00' };
  });
  error.value = '';
}, { immediate: true });
function save() {
  if (props.busy || props.readonly) return;
  error.value = '';
  if (typeof available.value !== 'boolean') { error.value = 'Choose whether you are available for in-school services.'; return; }
  const blocks = available.value ? days.value.filter(day => day.selected).map(day => ({ dayOfWeek: day.name, startTime: day.startTime, endTime: day.endTime })) : [];
  if (available.value && !blocks.length) { error.value = 'Choose at least one school weekday or select no current availability.'; return; }
  if (blocks.some(day => !day.startTime || !day.endTime || day.endTime <= day.startTime)) { error.value = 'Enter hours with the end after the start for each selected day.'; return; }
  emit('save', { values: { available: available.value, blocks, notes: notes.value }, complete: true });
}
</script>
<style scoped>
.school-availability fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.school-availability legend { font-size: 18px; font-weight: 650; }
.school-availability p { line-height: 1.6; color: #52665e; }
.availability-choice { display: grid; gap: 14px; margin: 22px 0; }
.availability-choice label, .day-name { display: flex; align-items: center; gap: 9px; }
.school-days { display: grid; gap: 10px; margin-bottom: 20px; }
.school-day { display: grid; grid-template-columns: minmax(120px, 1fr) 1fr 1fr; gap: 12px; align-items: center; padding: 14px; border: 1px solid #d7e1dc; border-radius: 10px; }
.school-day.selected { background: #f5f9f7; border-color: #aecbbd; }
.school-day label:not(.day-name), .notes { display: grid; gap: 7px; font-size: 13px; }
.day-name { font-size: 14px; font-weight: 600; }
.day-unselected { grid-column: 2 / -1; font-size: 12px; color: #65756e; }
.school-availability input[type=time], .school-availability textarea { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid #bdcdc4; border-radius: 7px; padding: 10px; font: inherit; background: white; color: #24392f; }
.school-availability input { accent-color: var(--hire-brand, #17624b); }
.school-availability button { margin-top: 20px; padding: 13px 20px; border: 0; border-radius: 8px; background: var(--hire-brand, #17624b); color: white; font: inherit; cursor: pointer; }
.school-availability [role=alert] { color: #a12d34; }
.school-availability :is(input, textarea, button):focus-visible { outline: 3px solid #5b9680; outline-offset: 3px; }
@media (max-width: 560px) { .school-day { grid-template-columns: 1fr 1fr; }.day-name { grid-column: 1 / -1; }.day-unselected { grid-column: 1 / -1; } }
</style>
