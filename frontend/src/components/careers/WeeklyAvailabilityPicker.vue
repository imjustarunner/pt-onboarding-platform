<template>
  <fieldset class="availability">
    <legend>General virtual interview availability</legend>
    <p>Select the days and times that usually work for you.</p>
    <label>Time zone
      <select v-model="zone" @change="save">
        <option v-for="tz in zones" :key="tz" :value="tz">{{ tz.replaceAll('_', ' ') }}</option>
      </select>
    </label>
    <p v-if="legacy" class="saved">Previously saved: {{ legacy }}. Selecting a day replaces this availability.</p>
    <div v-for="day in days" :key="day" class="day">
      <label><input type="checkbox" :checked="!!slots[day]" @change="toggle(day, $event.target.checked)" /> {{ day }}</label>
      <template v-if="slots[day]">
        <select v-model="slots[day].start" :aria-label="`${day} start time`" @change="startChanged(day)">
          <option v-for="t in times.slice(0, -1)" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
        <span>to</span>
        <select v-model="slots[day].end" :aria-label="`${day} end time`" @change="save">
          <option v-for="t in times.filter(t => t.value > slots[day].start)" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </template>
    </div>
  </fieldset>
</template>
<script setup>
import { ref, watch } from 'vue';
const props = defineProps({ modelValue: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver';
const zones = [...new Set([localZone, 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC'])];
const zone = ref(localZone);
const slots = ref({});
const legacy = ref('');
const times = Array.from({ length: 48 }, (_, n) => {
  const h = Math.floor(n / 2), m = n % 2 ? '30' : '00';
  return { value: `${String(h).padStart(2, '0')}:${m}`, label: `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}` };
});
watch(() => props.modelValue, value => {
  const parsed = {};
  for (const day of days) {
    const match = value.match(new RegExp(`${day} (\\d{2}:\\d{2})–(\\d{2}:\\d{2})`));
    if (match) parsed[day] = { start: match[1], end: match[2] };
  }
  const savedZone = value.match(/\(([^)]+)\)$/)?.[1];
  if (savedZone && zones.includes(savedZone)) zone.value = savedZone;
  slots.value = parsed;
  legacy.value = value && !Object.keys(parsed).length ? value : '';
}, { immediate: true });
function save() {
  legacy.value = '';
  const ranges = days.filter(day => slots.value[day]).map(day => `${day} ${slots.value[day].start}–${slots.value[day].end}`);
  emit('update:modelValue', ranges.length ? `${ranges.join('; ')} (${zone.value})` : '');
}
function toggle(day, checked) { if (checked) slots.value[day] = { start: '09:00', end: '17:00' }; else delete slots.value[day]; save(); }
function startChanged(day) { const slot = slots.value[day]; if (slot.end <= slot.start) slot.end = times.find(t => t.value > slot.start).value; save(); }
</script>
<style scoped>
.availability { border: 1px solid #dce4e9; border-radius: 12px; padding: 16px; margin: 0; min-width: 0; }
legend { font-weight: 700; padding: 0 4px; } p { color: #526174; font-size: .9rem; margin: 0 0 12px; }
.day { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.day label { min-width: 130px; display: flex; align-items: center; gap: 8px; }
input[type=checkbox] { width: 18px; height: 18px; }
select { padding: 8px; border: 1px solid #cad5df; border-radius: 6px; background: white; color: #172536; }
.saved { margin-top: 12px; }
</style>
