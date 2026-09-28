<template>
  <div class="vwh">
    <div class="vwh-head">
      <h3 style="margin:0;">Virtual Working Hours</h3>
      <div class="muted">Virtual openings for new or current clients. One-time openings are for an intake or meeting only. Appointments, school commitments and calendar conflicts remove unavailable times.</div>
    </div>

    <div v-if="loading" class="muted" style="margin-top:10px;">Loading…</div>
    <div v-else>
      <div v-if="error" class="error" style="margin-top:10px;">{{ error }}</div>

      <div class="vwh-table" style="margin-top:12px;">
        <div v-for="(r, idx) in rows" :key="idx" class="vwh-row">
          <label>Day<select class="select" v-model="r.dayOfWeek" :disabled="!!r.id">
            <option v-for="d in dayOptions" :key="d" :value="d">{{ d }}</option>
          </select></label>
          <label>First date<input class="input" type="date" v-model="r.startDate" :disabled="!!r.id" @change="syncDay(r)" /></label>
          <label>Last date (optional)<input class="input" type="date" v-model="r.endDate" :disabled="!!r.id" /></label>
          <label>Start<input class="input" type="time" v-model="r.startTime" :disabled="!!r.id" /></label>
          <label>End<input class="input" type="time" v-model="r.endTime" :disabled="!!r.id" /></label>
          <label class="check-inline"><input type="checkbox" v-model="r.sessionEnabled"/> Current clients</label>
          <label class="check-inline">
            <input type="checkbox" v-model="r.intakeEnabled" />
            <span>New clients</span>
          </label>
<fieldset><legend>Care types</legend><label v-for="type in careOptions" :key="type"><input type="checkbox" v-model="r.careTypes" :value="type"/> {{type}}</label></fieldset>
          <label>Repeats<select class="select" v-model="r.frequency" :disabled="!!r.id">
            <option value="ONCE">Once — intake or meeting</option>
            <option value="WEEKLY">Weekly</option>
            <option value="BIWEEKLY">Every 2 weeks</option>
            <option value="EVERY_3_WEEKS">Every 3 weeks</option>
            <option value="EVERY_4_WEEKS">Every 4 weeks</option>

          </select></label>
          <label v-if="r.frequency==='ONCE'">Purpose<select class="select" v-model="r.purpose"><option value="INTAKE">Single intake session</option><option value="MEETING">One-time meeting</option></select></label>
          <button v-if="r.id" type="button" class="btn btn-secondary btn-sm" @click="publicationEdit={row:{...r,kind:'weekly',agencyId},action:'move'}">Move occurrence / series</button>
          <button type="button" class="btn btn-secondary btn-sm" @click="removeRow(idx)" :disabled="saving || !loaded">Remove</button>
        </div>

        <div v-if="rows.length === 0" class="muted" style="margin-top:8px;">
          No virtual working hours yet.
        </div>
      </div>

      <div class="row-inline" style="margin-top:12px;">
        <button type="button" class="btn btn-secondary" @click="addRow" :disabled="saving || !loaded">Add time range</button>
        <button type="button" class="btn btn-primary" @click="save" :disabled="saving || !loaded">Save</button>
      </div>

      <p v-if="notice" role="status">{{notice}}</p>
      <div class="muted" style="margin-top:10px;">
        Use Move occurrence / series to change existing dates or times. Audience and care-type changes apply to the displayed availability window. Rows are always virtual availability. Turn on "New clients" to display openings publicly. Current-client-only openings stay private for rescheduling. Every 4 weeks repeats after 28 days, on the same weekday.
      </div>
    </div>
    <AvailabilityPublicationEdit v-if="publicationEdit" :row="publicationEdit.row" :action="publicationEdit.action" :provider-id="providerId||selfProviderId" @close="publicationEdit=null" @saved="publicationEdit=null;load();emit('updated')"/>
  </div>
</template>

<script setup>
import AvailabilityPublicationEdit from './AvailabilityPublicationEdit.vue';
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, required: true },
  providerId: {type:Number,default:null}
});

const emit=defineEmits(['updated']);
const publicationEdit=ref(null);
const endpoint=computed(()=>`/availability/${props.providerId?'providers/'+props.providerId:'me'}/virtual-working-hours`);
const loading = ref(false);
const notice=ref('');
const loaded=ref(false),selfProviderId=ref(null);
let generation=0;
const saving = ref(false);
const error = ref('');
const rows = ref([]);

const careOptions=['INDIVIDUAL','COUPLES','FAMILY'];
const dayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const syncDay = r => { if(r.startDate) r.dayOfWeek=dayOptions[(new Date(r.startDate+'T12:00:00Z').getUTCDay()+6)%7]; };
const addRow = () => {
  rows.value.push({ dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:00', intakeEnabled: true, sessionEnabled: false, frequency: 'WEEKLY', startDate:'', endDate:'', purpose:'INTAKE', careTypes:[...careOptions],excludedDates:[] });
};
const removeRow = (idx) => {
  const row=rows.value[idx];if(row.id){publicationEdit.value={row:{...row,kind:'weekly',agencyId:props.agencyId},action:'delete'};return;}
  rows.value.splice(idx, 1);
};

const load = async () => {
  const g=++generation;loaded.value=false;rows.value=[];notice.value='';
  if (!props.agencyId) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(endpoint.value, { params: { agencyId: props.agencyId } });
    if(g!==generation)return;
    rows.value = (resp.data?.rows || []).map((r) => ({
      id:r.id, excludedDates:r.excludedDates||[], careTypes:r.careTypes||[...careOptions],
      dayOfWeek: r.dayOfWeek || 'Monday',
      startTime: r.startTime || '09:00',
      endTime: r.endTime || '10:00',
      intakeEnabled: r.availableForIntake ?? ['INTAKE', 'BOTH'].includes(String(r.sessionType || '').toUpperCase()),
      sessionEnabled: r.availableForSession ?? ['REGULAR','BOTH'].includes(String(r.sessionType || '').toUpperCase()),
      startDate:r.startDate||'', endDate:r.endDate||'', purpose:r.purpose==='MEETING'?'MEETING':'INTAKE',
      frequency: r.frequency || 'WEEKLY'
    }));
    selfProviderId.value=resp.data?.providerId||null;
    loaded.value=true;
  } catch (e) {
    if(g===generation)error.value = e.response?.data?.error?.message || 'Failed to load virtual working hours';
  } finally {
    if(g===generation)loading.value = false;
  }
};

const save = async () => {
  if(!loaded.value||loading.value)return;
  try {
    saving.value = true;
    error.value = '';
    if(rows.value.some(r=>!['WEEKLY','EITHER'].includes(r.frequency)&&!r.startDate))throw new Error('Choose the first date for one-time or alternating-week availability.');
    if(rows.value.some(r=>!r.startTime||!r.endTime||r.endTime<=r.startTime))throw new Error('Each window needs an end time later than its start time.');
    if(rows.value.some(r=>!r.careTypes.length))throw new Error('Choose at least one care type for each opening.');
    if(rows.value.some(r=>!r.intakeEnabled&&!r.sessionEnabled))throw new Error('Choose new clients, current clients, or both for each window.');
    await api.put(endpoint.value, {
      agencyId: props.agencyId,
      rows: rows.value.map((r) => ({
        excludedDates:r.excludedDates, careTypes:r.careTypes,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        // Preserve the explicitly selected new/current client audiences.
        availableForIntake:r.intakeEnabled,
        availableForSession:r.sessionEnabled,
        sessionType:r.intakeEnabled?(r.sessionEnabled?'BOTH':'INTAKE'):'REGULAR',
        frequency: r.frequency, startDate:r.startDate||null,endDate:r.endDate||null,purpose:r.purpose
      }))
    });
    await load();
    notice.value='Availability saved.';
    emit('updated');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save virtual working hours';
  } finally {
    saving.value = false;
  }
};

watch(() => [props.agencyId,props.providerId], load,{immediate:true});
</script>

<style scoped>
.muted { color: var(--text-secondary); }
.error { color: #b00020; }
.vwh-table { display: flex; flex-direction: column; gap: 8px; }
.vwh-row { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; align-items: center; }
@media (max-width: 900px) { .vwh-row { grid-template-columns: 1fr; } }
.vwh-row>label{display:grid;gap:6px}.vwh-row{padding:12px;border:1px solid #d0dfd8;border-radius:10px}.vwh-row>label.check-inline{display:flex}.vwh-row-head { font-weight: 900; color: var(--text-secondary); }
.select, .input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text-primary); }
.row-inline { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.check-inline { display: inline-flex; align-items: center; gap: 8px; color: var(--text-secondary); font-weight: 600; }
.pill.yes { display: inline-flex; justify-content: center; align-items: center; height: 36px; border-radius: 10px; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.32); color: #047857; font-weight: 800; }
</style>

