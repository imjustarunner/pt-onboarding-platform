<template>
  <div class="vwh">
    <div class="vwh-head">
      <h3 style="margin:0;">Virtual Working Hours</h3>
      <div class="muted">Weekly template. These hours are used to compute virtual availability (after removing EHR/Google/office/school blocks).</div>
    </div>

    <div v-if="loading" class="muted" style="margin-top:10px;">Loading…</div>
    <div v-else>
      <div v-if="error" class="error" style="margin-top:10px;">{{ error }}</div>

      <div class="vwh-table" style="margin-top:12px;">
        <div class="vwh-row vwh-row-head">
          <div>Day</div>
          <div>Start</div>
          <div>End</div>
          <div>Virtual available</div>
          <div>Intake</div>
          <div>Frequency</div>
          <div></div>
        </div>

        <div v-for="(r, idx) in rows" :key="idx" class="vwh-row">
          <select class="select" v-model="r.dayOfWeek">
            <option v-for="d in dayOptions" :key="d" :value="d">{{ d }}</option>
          </select>
          <input class="input" type="time" v-model="r.startTime" />
          <input class="input" type="time" v-model="r.endTime" />
          <div class="pill yes">Yes</div>
          <label class="check-inline">
            <input type="checkbox" v-model="r.intakeEnabled" />
            <span>Include in intake</span>
          </label>
          <select class="select" v-model="r.frequency">
            <option value="WEEKLY">Weekly</option>
            <option value="BIWEEKLY">Biweekly</option>
            <option value="EITHER">Either</option>
          </select>
          <button type="button" class="btn btn-secondary btn-sm" @click="removeRow(idx)" :disabled="saving">Remove</button>
        </div>

        <div v-if="rows.length === 0" class="muted" style="margin-top:8px;">
          No virtual working hours yet.
        </div>
      </div>

      <div class="row-inline" style="margin-top:12px;">
        <button type="button" class="btn btn-secondary" @click="addRow" :disabled="saving">Add time range</button>
        <button type="button" class="btn btn-primary" @click="save" :disabled="saving">Save</button>
      </div>

      <div class="muted" style="margin-top:10px;">
        Rows are always virtual availability. Turn on "Include in intake" for slots that should appear in intake finder.
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, required: true }
});

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const rows = ref([]);

const dayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const addRow = () => {
  rows.value.push({ dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:00', intakeEnabled: false, frequency: 'WEEKLY' });
};
const removeRow = (idx) => {
  rows.value.splice(idx, 1);
};

const load = async () => {
  if (!props.agencyId) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/availability/me/virtual-working-hours', { params: { agencyId: props.agencyId } });
    rows.value = (resp.data?.rows || []).map((r) => ({
      dayOfWeek: r.dayOfWeek || 'Monday',
      startTime: r.startTime || '09:00',
      endTime: r.endTime || '10:00',
      intakeEnabled: ['INTAKE', 'BOTH'].includes(String(r.sessionType || '').toUpperCase()),
      frequency: r.frequency || 'WEEKLY'
    }));
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load virtual working hours';
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  try {
    saving.value = true;
    error.value = '';
    await api.put('/availability/me/virtual-working-hours', {
      agencyId: props.agencyId,
      rows: rows.value.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        // Intake-enabled virtual rows should also remain generally available virtually.
        sessionType: r.intakeEnabled ? 'BOTH' : 'REGULAR',
        frequency: r.frequency
      }))
    });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save virtual working hours';
  } finally {
    saving.value = false;
  }
};

onMounted(load);
watch(() => props.agencyId, load);
</script>

<style scoped>
.muted { color: var(--text-secondary); }
.error { color: #b00020; }
.vwh-table { display: flex; flex-direction: column; gap: 8px; }
.vwh-row { display: grid; grid-template-columns: 1fr 130px 130px 130px 180px 130px auto; gap: 10px; align-items: center; }
@media (max-width: 900px) { .vwh-row { grid-template-columns: 1fr; } }
.vwh-row-head { font-weight: 900; color: var(--text-secondary); }
.select, .input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text-primary); }
.row-inline { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.check-inline { display: inline-flex; align-items: center; gap: 8px; color: var(--text-secondary); font-weight: 600; }
.pill.yes { display: inline-flex; justify-content: center; align-items: center; height: 36px; border-radius: 10px; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.32); color: #047857; font-weight: 800; }
</style>

