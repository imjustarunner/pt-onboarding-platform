<script setup>
import { computed } from 'vue';
const props = defineProps({ date: { type: String, required: true }, weather: { type: Object, default: null } });
const day = computed(() => props.weather?.forecastDays?.find(item => item.date === props.date));
const known = value => typeof value === 'number' && Number.isFinite(value);
const conditions = computed(() => {
  const code = day.value?.weatherCode;
  if (code == null) return { icon: '◌', label: 'Daily forecast' };
  if (code === 0) return { icon: '☀', label: 'Clear skies' };
  if (code <= 3) return { icon: '⛅', label: 'Partly cloudy to overcast' };
  if (code <= 48) return { icon: '☁', label: 'Fog' };
  if ([71,73,75,77,85,86].includes(code)) return { icon: '❄', label: 'Snow' };
  if (code >= 95) return { icon: '⛈', label: 'Thunderstorms' };
  return { icon: '🌧', label: 'Rain or showers' };
});
const snow = computed(() => !known(day.value?.snowfallInches) ? 'Snow total unavailable'
  : day.value.snowfallInches > 0 ? `Snow ${day.value.snowfallInches < 0.1 ? '<0.1' : Number(day.value.snowfallInches.toFixed(1))}″` : 'No snow');
const label = computed(() => props.weather?.location?.label || (props.weather?.location?.source === 'primary_office' ? 'Your main office' : 'Your local area'));
const tooltip = computed(() => {
  const location = `${props.weather?.location?.source === 'primary_office' ? 'Office forecast' : 'Local forecast'}: ${label.value}.`;
  if (!day.value) return `${location} Forecast unavailable for ${props.date}. ${props.weather?.status === 'missing_home_address' ? 'Add your home address or assign a main office to enable local weather.' : 'Forecasts are available up to 16 days ahead.'}`;
  return `${location} ${props.date}: ${conditions.value.label}. ${known(day.value.tempMaxF) ? `High ${Math.round(day.value.tempMaxF)}°F.` : 'High unavailable.'} ${known(day.value.tempMinF) ? `Low ${Math.round(day.value.tempMinF)}°F.` : ''} ${snow.value === 'No snow' ? 'No snow forecast.' : `${snow.value.replace('″',' inches')} forecast.`} ${known(day.value.precipitationProbability) ? `${day.value.precipitationProbability}% chance of precipitation.` : ''}`;
});
</script>
<template>
  <span class="schedule-day-weather" :class="{ 'schedule-day-weather--snow': day?.snowfallInches > 0 }" role="note" tabindex="0" :title="tooltip" :aria-label="tooltip" @click.stop @keydown.stop>
    <template v-if="day"><span aria-hidden="true">{{ conditions.icon }}</span><strong>High {{ known(day.tempMaxF) ? `${Math.round(day.tempMaxF)}°` : '—' }}</strong><span>· {{ snow }}</span></template>
    <span v-else>{{ weather ? 'Forecast unavailable' : 'Weather…' }}</span>
  </span>
</template>
<style scoped>
.schedule-day-weather{display:flex;align-items:center;justify-content:center;gap:4px;font-size:10px;line-height:1.4;color:#526578;font-weight:400;cursor:help;padding:2px 3px;border-radius:5px;white-space:normal}.schedule-day-weather strong{font-size:11px;color:#233d58}.schedule-day-weather--snow{background:#edf5ff;color:#235e99}.schedule-day-weather:focus-visible{outline:2px solid #2974aa;outline-offset:2px}
</style>
