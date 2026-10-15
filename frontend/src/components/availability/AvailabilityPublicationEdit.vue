<template>
  <dialog ref="dialog" class="availability-edit-dialog" :aria-label="title" @cancel.prevent="dismiss" @click.self="dismiss">
    <header>
      <h3>{{ title }}</h3>
      <button type="button" aria-label="Close availability editor" :disabled="busy" @click="dismiss">×</button>
    </header>
    <p v-if="action === 'delete'">Remove this published opening from your availability. Your office reservation, booked appointments, and held client selections stay in place. This does not send appointment cancellation notices.</p>
    <label v-if="row.kind === 'weekly'">Occurrence date <input type="date" v-model="occurrenceDate" :disabled="busy" /></label>
    <p v-else>{{ new Date(row.startAt).toLocaleString(undefined, { timeZone }) }}</p>
    <p v-if="row.kind === 'weekly'">{{ startTime }}–{{ endTime }} · {{ timeZone }}</p>
    <fieldset v-if="recurring" :disabled="busy">
      <legend>Apply this change to</legend>
      <label><input type="radio" v-model="scope" value="single" /> This occurrence only</label>
      <label><input type="radio" v-model="scope" value="future" /> This and all future occurrences</label>
    </fieldset>
    <p v-if="scope === 'future'">{{ action === 'delete' ? 'Openings from the selected date onward will be removed. Past dates stay unchanged.' : 'Past occurrences stay unchanged. Future openings follow the new day and time at the same interval.' }}</p>
    <template v-if="action === 'move'">
      <label>New date <input type="date" v-model="startDate" :disabled="busy" /></label>
      <label>Start <input type="time" v-model="startTime" :disabled="busy" /></label>
      <label>End <input type="time" v-model="endTime" :disabled="busy" /></label>
      <p v-if="row.kind !== 'weekly'">The target times must already have available office reservations. If any are missing, nothing will move.</p>
      <fieldset :disabled="busy">
        <legend>Care types</legend>
        <label v-for="type in ['INDIVIDUAL', 'COUPLES', 'FAMILY']" :key="type"><input type="checkbox" v-model="careTypes" :value="type" /> {{ type }}</label>
      </fieldset>
      <p>Existing appointments and held selections stay protected.</p>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <footer>
      <button type="button" :disabled="busy" @click="dismiss">{{ action === 'delete' ? 'Keep availability' : 'Cancel' }}</button>
      <button type="button" data-testid="save-publication-change" :class="{ destructive: action === 'delete' }" :disabled="busy || !occurrenceDate" @click="save">{{ busy ? 'Saving…' : action === 'delete' ? 'Remove opening' : 'Save change' }}</button>
    </footer>
  </dialog>
</template>
<script setup>
import {computed,ref,onMounted,onBeforeUnmount} from 'vue';
import api from '../../services/api';
import {availabilityOccursOn} from '../../utils/availabilityRecurrence';
const props=defineProps({row:{type:Object,required:true},action:{type:String,required:true},providerId:Number,timeZone:{type:String,default:'America/Denver'}}),emit=defineEmits(['close','saved']);
const dialog=ref(null);
const title=computed(()=>props.action==='delete'?'Remove open availability':'Move opening');
function dismiss(){if(!busy.value)emit('close');}
onMounted(()=>dialog.value.showModal());
onBeforeUnmount(()=>dialog.value?.close());
const local=(date,options)=>new Intl.DateTimeFormat('en-CA',{timeZone:props.timeZone,...options}).format(new Date(date));
const today=local(new Date(),{year:'numeric',month:'2-digit',day:'2-digit'});
function firstDate(){if(props.row.occurrenceDate)return props.row.occurrenceDate;if(props.row.startAt)return local(props.row.startAt,{year:'numeric',month:'2-digit',day:'2-digit'});for(let n=0;n<400;n++){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);const ymd=d.toISOString().slice(0,10);if(d.toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'})===props.row.dayOfWeek&&availabilityOccursOn(props.row,ymd))return ymd;}return props.row.startDate||today;}
const careTypes=ref(props.row.careTypes||['INDIVIDUAL','COUPLES','FAMILY']);
const occurrenceDate=ref(firstDate()),startDate=ref(occurrenceDate.value),scope=ref('single'),busy=ref(false),error=ref('');
const recurring=computed(()=>props.row.frequency!=='ONCE'&&(props.row.kind==='weekly'||props.row.seriesId));
const clock=value=>local(value,{hourCycle:'h23',hour:'2-digit',minute:'2-digit'});
const startTime=ref(props.row.startTime||clock(props.row.startAt)),endTime=ref(props.row.endTime||clock(props.row.endAt));
async function save(){busy.value=true;error.value='';try{const url=`/availability/providers/${props.providerId}/publications/${props.row.kind}/${props.row.id}`,payload={agencyId:props.row.agencyId,scope:recurring.value?scope.value:'single',occurrenceDate:occurrenceDate.value,startDate:startDate.value,startTime:startTime.value,endTime:endTime.value,careTypes:careTypes.value};if(props.action==='delete')await api.delete(url,{params:payload});else await api.patch(url,payload);emit('saved');}catch(e){error.value=e.response?.data?.error?.message||'Could not update the opening.';}finally{busy.value=false;}}
</script>
<style scoped>
.availability-edit-dialog { background: white; color: #173e36; border: 1px solid #cbd5e1; border-radius: 16px; padding: 24px; width: min(500px, calc(100vw - 32px)); max-height: 85dvh; overflow: auto; box-sizing: border-box; box-shadow: 0 10px 40px #0003; }
.availability-edit-dialog::backdrop { background: #102c2877; }
.availability-edit-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.availability-edit-dialog h3 { margin: 0; }
.availability-edit-dialog label { display: flex; gap: 10px; align-items: center; margin: 12px 0; }
.availability-edit-dialog input[type=date], .availability-edit-dialog input[type=time] { padding: 8px; font: inherit; min-width: 0; }
.availability-edit-dialog footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; margin-top: 20px; }
.availability-edit-dialog button { padding: 10px; border-radius: 8px; border: 1px solid #abc; cursor: pointer; font: inherit; background: white; color: inherit; }
.availability-edit-dialog button.destructive { background: #b42318; border-color: #b42318; color: white; }
.availability-edit-dialog button:disabled { opacity: .6; cursor: wait; }
.availability-edit-dialog [role=alert] { color: #a21c28; }
</style>
