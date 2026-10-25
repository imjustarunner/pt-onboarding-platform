<template>
  <Teleport to="body" :disabled="!fullscreenFallback">
  <section ref="root" class="team-calendar" :class="{ 'team-calendar--fullscreen': fullscreenFallback }" aria-label="Team member availability">
    <button v-if="fullscreenActive" type="button" class="team-fullscreen-exit" title="Exit full screen (Escape)" @click="toggleFullscreen">× Exit full screen</button>
    <header>
      <div><h2>{{ name }}’s schedule</h2><p>View only · Meeting, session, or busy times. {{ timezone }}.</p></div>
      <nav aria-label="Team schedule dates">
        <button type="button" title="Show the week containing today" @click="setDate(new Date())">Today</button>
        <button type="button" title="Previous week" aria-label="Previous week" @click="move(-7)">‹</button>
        <label><span class="sr-only">Choose a date</span><input type="date" :value="week" @change="setDate(new Date(`${$event.target.value}T12:00:00`))" /></label>
        <button type="button" title="Next week" aria-label="Next week" @click="move(7)">›</button>
        <button type="button" title="Refresh availability" @click="load">↻ Refresh</button>
        <button type="button" data-tour="my-schedule-fullscreen" :aria-pressed="fullscreenActive" @click="toggleFullscreen">{{ fullscreenActive ? 'Exit full screen' : '⛶ Full screen' }}</button>
      </nav>
    </header>
    <p v-if="loading" role="status">Loading availability…</p>
    <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="load">Try again</button></p>
    <div v-else class="team-calendar__week">
      <section v-for="day in days" :key="day.key" class="team-calendar__day" :class="{ 'is-today': day.key === ymd(new Date()) }">
        <h3>{{ day.label }}</h3>
        <ol v-if="day.blocks.length"><li v-for="(block, index) in day.blocks" :key="index" :class="`activity-${block.activityType}`">
          <strong>{{ peerActivityLabel(block) }}</strong><time>{{ timeRange(block, day.date) }}</time>
        </li></ol>
        <p v-else class="muted">No events shown</p>
      </section>
    </div>
  </section>
  </Teleport>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
import { useScheduleFullscreen } from '../../composables/useScheduleFullscreen.js';
import { peerActivityLabel } from '../../utils/teamScheduleAccess.js';
const props = defineProps({ userId: Number, agencyId: Number, name: String, weekStartYmd: String });
const emit = defineEmits(['update:weekStartYmd']);
const root = ref(null), week = ref(''), blocks = ref([]), loading = ref(false), error = ref('');
const { fullscreenActive, fullscreenFallback, toggleFullscreen } = useScheduleFullscreen(root);
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let request = 0;
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function setDate(date) {
  if (!Number.isFinite(+date)) return;
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  week.value = ymd(date); emit('update:weekStartYmd', week.value);
}
function move(days) { const date = new Date(`${week.value}T12:00:00`); date.setDate(date.getDate() + days); setDate(date); }
function instant(value) { return new Date(String(value || '').replace(' ', 'T')); }
const days = computed(() => Array.from({ length: 7 }, (_, i) => {
  const date = new Date(`${week.value}T00:00:00`); date.setDate(date.getDate() + i);
  const end = new Date(date); end.setDate(end.getDate() + 1);
  return { key: ymd(date), date, label: date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }), blocks: blocks.value.filter(b => +instant(b.startAt) < +end && +instant(b.endAt) > +date).sort((a, b) => +instant(a.startAt) - +instant(b.startAt)) };
}));
function timeRange(block, day) {
  const end = new Date(day); end.setDate(end.getDate() + 1);
  const startTime = new Date(Math.max(+instant(block.startAt), +day));
  const endTime = new Date(Math.min(+instant(block.endAt), +end));
  if (+startTime === +day && +endTime === +end) return 'All day';
  const format = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${format(startTime)} – ${format(endTime)}`;
}
async function load() {
  const run = ++request; blocks.value = []; error.value = '';
  if (!props.userId || !props.agencyId || !week.value) { loading.value = false; return; }
  loading.value = true;
  try {
    const { data } = await api.get(`/users/${props.userId}/schedule-summary`, { params: { agencyId: props.agencyId, weekStart: week.value, detailLevel: 'availability', skipOfficeMaterialize: 'true', includeGoogleBusy: 'true' }, skipGlobalLoading: true });
    if (run === request) blocks.value = Array.isArray(data.busyBlocks) ? data.busyBlocks : [];
  } catch (e) { if (run === request) error.value = e?.response?.data?.error?.message || 'Unable to load this schedule.'; }
  finally { if (run === request) loading.value = false; }
}
watch(() => props.weekStartYmd, value => setDate(value ? new Date(`${value}T12:00:00`) : new Date()), { immediate: true });
watch([() => props.userId, () => props.agencyId, week], load, { immediate: true });
onBeforeUnmount(() => { request++; });
</script>
<style scoped>
.team-fullscreen-exit { position:fixed; bottom:16px; right:16px; z-index:1800; box-shadow:0 3px 16px #0003; }

.team-calendar { min-width:0; padding:12px; border:1px solid var(--border,#cbd5e1); border-radius:14px; background:var(--bg-card,#fff); }
.team-calendar header, nav { display:flex; align-items:center; flex-wrap:wrap; gap:8px; } .team-calendar header { justify-content:space-between; margin-bottom:12px; }
h2 { font-size:18px; margin:0; } header p { font-size:12px; margin:4px 0; color:var(--text-secondary,#64748b); }
button, input { font:inherit; border:1px solid var(--border,#cbd5e1); border-radius:8px; padding:7px 10px; background:var(--bg-card,#fff); color:inherit; } button { cursor:pointer; }
.team-calendar__week { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,145px),1fr)); gap:8px; }
.team-calendar__day { min-width:0; border:1px solid var(--border,#e2e8f0); border-radius:10px; padding:10px; } h3 { font-size:13px; margin:0 0 12px; } .is-today h3 { color:var(--primary,#166534); }
ol { list-style:none; padding:0; margin:0; display:grid; gap:8px; } li { border-left:3px solid #64748b; border-radius:6px; padding:10px 8px; background:#64748b15; } li.activity-session { border-color:#5271dc; background:#5271dc18; } li.activity-meeting { border-color:#8b5cf6; background:#8b5cf618; } li strong, time { display:block; font-size:12px; } time { margin-top:4px; } .muted { font-size:12px; color:var(--text-secondary,#64748b); }
.team-calendar:fullscreen, .team-calendar--fullscreen { box-sizing:border-box; width:100%; height:100dvh; overflow:auto; padding:16px; } .team-calendar--fullscreen { position:fixed; inset:0; z-index:1900; } .sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }
</style>
