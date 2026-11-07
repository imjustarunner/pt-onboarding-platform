<script setup>
import { ref } from 'vue';
import api from '../../services/api';
import { closureLabel, schoolRailSummary } from '../../utils/schoolAssignmentRail.js';

const props = defineProps({
  detail: { type: Object, required: true },
  providerId: { type: Number, required: true },
  timeZone: { type: String, default: 'America/Denver' },
  canCancel: { type: Boolean, default: false },
  canRequest: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'request-change', 'adjust-slots', 'changed']);

const reason = ref('');
const busy = ref(false);
const error = ref('');
const notice = ref('');

const hours = () => {
  const start = String(props.detail.startTime || '').slice(0, 5);
  const end = String(props.detail.endTime || '').slice(0, 5);
  return start && end ? `${start}–${end}` : 'Hours not set';
};

async function cancelSchoolDay() {
  if (busy.value || props.detail.schoolClosure) return;
  const why = reason.value.trim();
  if (!why) {
    error.value = 'Say why this school day is canceled.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const { data } = await api.post(`/users/${props.providerId}/school-day-closure`, {
      agencyId: props.detail.agencyId,
      schoolOrgId: props.detail.schoolOrganizationId,
      date: props.detail.dateYmd,
      reason: why,
      timeZone: props.timeZone
    }, { skipGlobalLoading: true });
    notice.value = data.alreadyClosed
      ? 'This school day was already marked closed.'
      : 'This school day is marked No school. Appointments stay on the schedule.';
    emit('changed', data.closure);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not cancel this school day.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="modal-backdrop modal-backdrop--request" @click.self="emit('close')">
    <div class="modal school-rail-panel" role="dialog" aria-modal="true" aria-labelledby="school-rail-title">
      <div class="modal-head">
        <h3 id="school-rail-title">{{ detail.schoolName || 'School' }}</h3>
        <button class="btn btn-secondary" type="button" @click="emit('close')">Close</button>
      </div>
      <p>{{ detail.dayName }} {{ detail.dateYmd }} · {{ hours() }}</p>
      <p>{{ schoolRailSummary(detail) }}</p>
      <p v-if="detail.schoolClosure" class="school-rail-panel__closure">{{ closureLabel(detail.schoolClosure) }}</p>
      <div class="school-rail-panel__actions">
        <button type="button" :disabled="!canRequest" @click="emit('request-change')">Request a change</button>
        <button type="button" :disabled="!canRequest" @click="emit('adjust-slots')">Adjust slots</button>
      </div>
      <form v-if="canCancel && !detail.schoolClosure" @submit.prevent="cancelSchoolDay">
        <label>Why is there no school?
          <textarea v-model="reason" rows="2" maxlength="500" :disabled="busy" placeholder="For example: the building is closed." />
        </label>
        <button type="submit" :disabled="busy">{{ busy ? 'Saving…' : 'Cancel this school day' }}</button>
        <p class="hint">This marks No school for this school only. It does not email families or remove appointments.</p>
      </form>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop { position:fixed; inset:0; z-index:20040; display:grid; place-items:center; padding:20px; background:rgba(15,23,42,.42); }
.school-rail-panel { display:grid; gap:12px; width:min(520px,100%); max-height:90dvh; overflow:auto; box-sizing:border-box; padding:24px; background:#fff; color:#183b32; border:1px solid #dce5df; border-radius:16px; box-shadow:0 24px 80px rgba(15,23,42,.24); }
.modal-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
h3 { margin:0; color:#183b32; } button:disabled { opacity:.5; cursor:default; }
.school-rail-panel p { margin: 0; }
.school-rail-panel__closure { padding: 10px 12px; border-radius: 8px; background: #fff7ed; color: #9a3412; }
.school-rail-panel__actions, form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
label { display: grid; gap: 6px; width: 100%; }
textarea { width: 100%; box-sizing: border-box; font: inherit; padding: 8px; }
button { font: inherit; cursor: pointer; padding: 8px 10px; border-radius: 7px; border: 1px solid #cbd5e1; background: #fff; }
.hint { color: #64748b; font-size: 12px; }
p[role="alert"] { color: #b91c1c; }
</style>
