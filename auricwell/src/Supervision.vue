<template>
  <section class="stack">
    <header><h1>Supervision</h1><p>Schedule supervision and review completed hours from the existing supervision record.</p></header>
    <p v-if="error" role="alert">{{ error }}</p>
    <article v-if="hours" class="card"><h2>Completed supervision hours</h2><label v-if="context?.canManage">Provider<select v-model="hoursProvider"><option :value="context.userId">My completed hours</option><option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ provider.firstName }} {{ provider.lastName }}</option></select></label><p><strong>{{ Number(hours.totalHours || 0).toFixed(2) }}</strong> total · {{ Number(hours.individualHours || 0).toFixed(2) }} individual · {{ Number(hours.groupHours || 0).toFixed(2) }} group</p><p>Completed hours follow recorded attendance and the existing finalization rules.</p></article>
    <article v-if="context?.canManage" class="card"><h2>Schedule supervision</h2><form @submit.prevent="schedule">
      <label>Supervisee<select v-model="form.superviseeUserId" required><option value="">Choose a provider</option><option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ provider.firstName }} {{ provider.lastName }}</option></select></label>
      <label>Supervisor<select v-model="form.supervisorUserId" required><option :value="context.userId">Me</option><option v-for="facilitator in facilitators.filter(p => p.id !== context.userId)" :key="facilitator.id" :value="facilitator.id">{{ facilitator.firstName }} {{ facilitator.lastName }}</option></select></label>
      <label>Type<select v-model="form.sessionType"><option value="individual">Individual</option><option value="triadic">Triadic</option><option value="group">Group</option></select></label>
      <label v-if="form.sessionType !== 'individual'">Additional supervisees<select v-model="form.additionalAttendeeUserIds" multiple><option v-for="provider in providers.filter(p => p.id !== form.superviseeUserId)" :key="provider.id" :value="provider.id">{{ provider.firstName }} {{ provider.lastName }}</option></select><small>Choose one additional provider for triadic supervision.</small></label>
      <label>Starts ({{ context.timeZone }})<input v-model="form.startAt" type="datetime-local" required /></label><label>Ends ({{ context.timeZone }})<input v-model="form.endAt" type="datetime-local" required /></label>
      <label>Repeat<select v-model="form.recurrenceFrequency"><option value="ONCE">Once</option><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every other week</option><option value="MONTHLY">Monthly</option></select></label><label v-if="form.recurrenceFrequency !== 'ONCE'">Number of sessions<input v-model.number="form.occurrenceCount" type="number" min="2" max="52" /></label>
      <button :disabled="busy">Schedule supervision</button>
    </form></article>
    <article class="card"><h2>My supervision sessions</h2><button @click="load" :disabled="busy">Refresh</button><p v-if="!sessions.length">No supervision sessions scheduled.</p><ul><li v-for="session in sessions" :key="session.id"><strong>{{ new Date(session.startAt).toLocaleString() }}</strong> · {{ session.sessionType }} · {{ session.status }}<p>{{ session.supervisorName }} · {{ session.superviseeName }}</p><button v-if="!['FINALIZED','COMPLETED','CANCELLED','MISSED','RESCHEDULED'].includes(session.status)" :disabled="busy" @click="open(session)">Open supervision room</button></li></ul></article>
  </section>
</template>
<script setup>
import { ref, reactive, watch, onBeforeUnmount } from 'vue';
import { api } from './api.js';
const props = defineProps({ base: { type: String, required: true } });
const context = ref(null), hours = ref(null), providers = ref([]), facilitators = ref([]), sessions = ref([]), hoursProvider = ref(null), error = ref(''), busy = ref(false);
const form = reactive({ superviseeUserId: '', additionalAttendeeUserIds: [], supervisorUserId: '', sessionType: 'individual', startAt: '', endAt: '', recurrenceFrequency: 'ONCE', occurrenceCount: 4 });
let generation = 0, hoursGeneration = 0, active = true;
const endpoint = `${props.base}/supervision`;
async function load() { const current = ++generation; busy.value = true; error.value = ''; try { const ctx = await api(`${endpoint}/context`); const [record, candidates] = await Promise.all([api(`${endpoint}/sessions`), ctx.canManage ? api(`${endpoint}/providers`) : null]); if (!active || current !== generation) return; context.value = ctx; form.supervisorUserId ||= ctx.userId; providers.value = candidates?.providers || []; facilitators.value = candidates?.facilitators || []; sessions.value = record.sessions || []; if (!hoursProvider.value) hoursProvider.value = ctx.userId; else await loadHours(); } catch (e) { if (active && current === generation) error.value = e.message; } finally { if (active && current === generation) busy.value = false; } }
async function loadHours() { const current = ++hoursGeneration; hours.value = null; try { const record = await api(hoursProvider.value === context.value?.userId ? `${endpoint}/hours` : `${endpoint}/providers/${hoursProvider.value}/hours`); if (active && current === hoursGeneration) hours.value = record; } catch (e) { if (active && current === hoursGeneration) error.value = e.message; } }
async function schedule() {
  busy.value = true; error.value = ''; let createdId = null;
  try {
    if (form.sessionType === 'triadic' && form.additionalAttendeeUserIds.length > 1) throw new Error('Triadic supervision includes two supervisees. Choose one additional provider.');
    const created = await api(`${endpoint}/sessions`, { method: 'POST', body: {
      ...form, additionalAttendeeUserIds: form.sessionType === 'individual' ? [] : form.additionalAttendeeUserIds,
      timeZone: context.value.timeZone, recurrenceFrequency: undefined, reminderMinutes: 30, createMeetLink: true
    } });
    createdId = created.session.id;
    if (form.recurrenceFrequency !== 'ONCE') await api(`${endpoint}/sessions/${createdId}`, { method: 'PATCH', body: {
      recurrenceFrequency: form.recurrenceFrequency, recurrencePolicy: 'FINITE', recurrenceOccurrenceCount: form.occurrenceCount,
      changeReason: 'Schedule recurring supervision'
    } });
    await load();
  } catch (e) {
    if (active) {
      if (createdId) { await load(); error.value = `Session #${createdId} was scheduled, but its repeat dates were not saved: ${e.message}`; }
      else error.value = e.message;
    }
  } finally { if (active) busy.value = false; }
}
async function open(session) { busy.value = true; error.value = ''; try { const { url } = await api(`${endpoint}/sessions/${session.id}/open`, { method: 'POST', body: {} }); if (active) window.location.assign(url); } catch (e) { if (active) error.value = e.message; } finally { if (active) busy.value = false; } }
watch(hoursProvider, loadHours); onBeforeUnmount(() => { active = false; generation++; hoursGeneration++; }); load();
</script>
<style scoped>
form{display:grid;gap:12px;max-width:560px}label{display:grid;gap:5px}li{margin:18px 0}input,select,button{padding:10px;font:inherit}[role=alert]{color:#a32121}
</style>
