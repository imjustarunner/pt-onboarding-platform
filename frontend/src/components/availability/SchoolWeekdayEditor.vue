<script setup>
import { nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
import SchoolAvailabilityIcon from './SchoolAvailabilityIcon.vue';
const props = defineProps({ providerId: { type: Number, required: true }, agencyId: { type: Number, required: true }, providerName: { type: String, default: '' } });
const emit = defineEmits(['close', 'saved']);
const context = ref(null), choices = ref({}), loading = ref(false), saving = ref(false), error = ref(''), dialog = ref(null);
let generation = 0;
const previousFocus = typeof document !== 'undefined' ? document.activeElement : null;
async function load() {
  const current = ++generation;
  context.value = null; error.value = ''; loading.value = true;
  try {
    const { data } = await api.get(`/availability/providers/${props.providerId}/school-weekdays`, { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
    if (current !== generation) return;
    context.value = data; choices.value = Object.fromEntries(data.days.map(day => [day.day, day.available]));
    await nextTick();
    if(current===generation && data.eligible) {
      // The server records only the provider's own rendered modal. A manager
      // preview is ignored and an email open never substitutes for this event.
      try {await api.post(`/availability/providers/${props.providerId}/school-weekdays/opened`,{agencyId:props.agencyId},{skipGlobalLoading:true});} catch { /* Saving remains available if view tracking is temporarily offline. */ }
    }
  } catch (e) { if (current === generation) error.value = e.response?.data?.error?.message || 'Could not load school availability.'; }
  finally { if (current === generation) loading.value = false; }
}
async function save() {
  if (saving.value) return;
  saving.value = true; error.value = '';
  try {
    const { data } = await api.put(`/availability/providers/${props.providerId}/school-weekdays`, { agencyId: props.agencyId, days: choices.value }, { skipGlobalLoading: true });
    emit('saved', data); emit('close');
  } catch (e) { error.value = e.response?.data?.error?.message || 'Could not save availability. Your changes have not been saved.'; }
  finally { saving.value = false; }
}
function keydown(event) {
  if (event.key === 'Escape' && !saving.value) emit('close');
  if (event.key !== 'Tab') return;
  const nodes = [...dialog.value.querySelectorAll('button:not(:disabled),[tabindex="0"]')];
  const first = nodes[0], last = nodes.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
watch(() => [props.providerId, props.agencyId], load, { immediate: true });
onMounted(async () => { await nextTick(); dialog.value?.querySelector('button')?.focus(); });
onBeforeUnmount(() => { generation++; previousFocus?.focus?.(); });
</script>
<template>
  <Teleport to="body">
    <div class="school-weekdays-backdrop" @click.self="!saving && emit('close')" @keydown="keydown">
      <section ref="dialog" class="school-weekdays-dialog" role="dialog" aria-modal="true" aria-labelledby="school-weekdays-title">
        <header><div><h2 id="school-weekdays-title"><SchoolAvailabilityIcon /> School availability</h2><p v-if="providerName">{{ providerName }}</p></div><button type="button" :disabled="saving" @click="emit('close')">Close</button></header>
        <p>Choose your usual Monday–Friday availability for school placement. Assigned days stay reserved for the school shown.</p>
        <p v-if="loading" role="status">Loading school days…</p>
        <p v-if="error" role="alert">{{ error }} <button v-if="!context" type="button" @click="load">Try again</button></p>
        <form v-if="context?.eligible" @submit.prevent="save">
          <div class="school-weekdays-grid">
            <fieldset v-for="day in context.days" :key="day.day" :class="day.status === 'assigned' ? 'assigned' : choices[day.day] ? 'available' : 'unavailable'" :disabled="saving || day.status === 'assigned'">
              <legend>{{ day.day }}</legend><SchoolAvailabilityIcon />
              <template v-if="day.status === 'assigned'"><strong v-for="school in day.schools" :key="school.schoolOrganizationId">{{ school.schoolName }}</strong><small>Assigned · reserved</small></template>
              <template v-else><button type="button" :aria-pressed="choices[day.day]" @click="choices[day.day] = true">Available</button><button type="button" :aria-pressed="!choices[day.day]" @click="choices[day.day] = false">Not available</button></template>
            </fieldset>
          </div>
          <p class="school-weekdays-hint">Green: available · Gray: assigned · Red: not available. These choices describe school placement days; confirm hours before scheduling.</p>
          <footer><button class="btn btn-primary" type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save availability' }}</button></footer>
        </form>
        <p v-else-if="context">School-Based Counseling must be included in this provider’s service focuses.</p>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.school-weekdays-backdrop { position:fixed; inset:0; z-index:20050; background:rgba(15,23,42,.42); display:grid; place-items:center; padding:20px; }
.school-weekdays-dialog { background:#fff; color:#183b32; border:1px solid #dce5df; border-radius:18px; box-shadow:0 24px 80px #0f172a40; padding:24px; width:min(820px,100%); max-height:90dvh; overflow:auto; box-sizing:border-box; }
header { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; } h2 { display:flex; align-items:center; gap:8px; font-size:20px; margin:0; } p { line-height:1.5; }
button { font:inherit; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#334155; cursor:pointer; } button:disabled { cursor:default; }
.school-weekdays-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; }
fieldset { display:flex; flex-direction:column; gap:9px; margin:0; padding:12px; border:1px solid #bbdfcd; border-radius:12px; min-width:0; } legend { font-size:13px; font-weight:700; } strong { font-size:13px; overflow-wrap:anywhere; }
.available { background:#f0fdf4; color:#15803d; } .unavailable { background:#fff1f2; color:#b91c1c; border-color:#fecdd3; } .assigned { background:#f1f5f9; color:#64748b; border-color:#cbd5e1; }
button[aria-pressed="true"] { box-shadow:inset 0 0 0 2px #15803d; color:#166534; background:#dcfce7; font-weight:700; }
.unavailable button[aria-pressed="true"] { color:#991b1b; background:#fee2e2; box-shadow:inset 0 0 0 2px #b91c1c; }
.school-weekdays-hint { color:#64748b; font-size:12px; } footer { display:flex; justify-content:flex-end; margin-top:16px; } footer button { background:#176745; color:#fff; }
[role="alert"] { color:#b91c1c; }
@media(max-width:620px) { .school-weekdays-grid { grid-template-columns:1fr; } fieldset { display:grid; grid-template-columns:24px 1fr 1fr; align-items:center; } fieldset.assigned { display:flex; } .school-weekdays-dialog { padding:18px; } }
</style>
