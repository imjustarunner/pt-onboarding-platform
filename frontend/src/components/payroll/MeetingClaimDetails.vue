<template>
  <article class="meeting-claim">
    <header class="meeting-claim__hero">
      <div class="meeting-claim__brand"><img src="/assets/fundthred/icon.svg" alt="" /> FundThred <span>Meeting compensation</span></div>
      <div class="meeting-claim__heading"><h2>{{ claim.payload?.meetingType || 'Compensated meeting' }}</h2><span class="meeting-claim__status">{{ humanize(claim.status) }}</span></div>
      <p>{{ employeeName }} <span aria-hidden="true">·</span> {{ dateLabel }}</p>
    </header>
    <div class="meeting-claim__content">
      <div class="meeting-claim__metrics">
        <div><span>Time submitted for review</span><strong>{{ duration }}</strong></div>
        <div><span>Pay category</span><strong>{{ payCategory }}</strong></div>
        <div v-if="claim.applied_amount != null"><span>Applied amount</span><strong>{{ money(claim.applied_amount) }}</strong></div>
      </div>
      <section><h3>Meeting details</h3><p>{{ claim.payload?.summary || 'Meeting attendance' }}</p>
        <dl><div><dt>Platform</dt><dd>{{ humanize(claim.payload?.platform) }}</dd></div><div><dt>Scheduled time</dt><dd>{{ timeLabel(claim.payload?.startTime) }} – {{ timeLabel(claim.payload?.endTime) }}<small v-if="attendance.timeZone">{{ attendance.timeZone }}</small></dd></div><div v-if="periodLabel"><dt>Suggested pay period</dt><dd>{{ periodLabel }}</dd></div><div v-if="targetPeriodLabel"><dt>Target pay period</dt><dd>{{ targetPeriodLabel }}</dd></div></dl>
      </section>
      <section><h3>Who attended</h3><p class="meeting-claim__muted">People with recorded attendance for this meeting.</p>
        <p v-if="loading" role="status">Loading attendance…</p>
        <div v-else-if="error" role="alert"><p>{{ error }}</p><button type="button" @click="loadAttendance">Retry attendance</button></div>
        <ul v-else-if="attendance.attendees?.length" class="meeting-claim__people"><li v-for="person in attendance.attendees" :key="person.userId"><span class="meeting-claim__avatar" aria-hidden="true">{{ initials(person.name) }}</span><span><strong>{{ person.name }}</strong><small>{{ Number(person.userId) === Number(claim.user_id) ? 'Employee on this claim' : person.isHost ? 'Meeting host' : 'Attendee' }}</small></span></li></ul>
        <p v-else>No attendance record is available. An invitation alone does not confirm attendance.</p>
      </section>
      <section class="meeting-claim__source"><h3>How this claim was created</h3><strong>{{ claim.payload?.manualMeetingLogId ? 'Submitted from a manual meeting log' : 'Automatically created from meeting attendance' }}</strong><p>Recorded meeting time was sent to payroll for review. The scheduled start and end times may differ from time attended.</p><p v-if="claim.payload?.compensationNote">{{ claim.payload.compensationNote }}</p><p v-if="claim.payload?.editNote"><strong>Adjustment note:</strong> {{ claim.payload.editNote }}</p><p v-if="claim.rejection_reason"><strong>Payroll note:</strong> {{ claim.rejection_reason }}</p></section>
      <footer>Claim #{{ claim.id }}<span v-if="claim.payload?.scheduleEventId"> · Meeting #{{ claim.payload.scheduleEventId }}</span></footer>
    </div>
  </article>
</template>
<script setup>
import {computed, ref, watch} from 'vue';
import api from '../../services/api';
const props=defineProps({claim:{type:Object,required:true},employeeName:{type:String,default:''},periodLabel:{type:String,default:''},targetPeriodLabel:{type:String,default:''}});
const attendance=ref({}),loading=ref(false),error=ref('');let requestId=0;
const humanize=value=>String(value || 'Not recorded').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,s=>s.toUpperCase());
const initials=name=>String(name||'').split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('');
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value));
const dateLabel=computed(()=>{const d=String(props.claim.claim_date||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(d)?new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Date not recorded';});
const timeLabel=value=>{const match=/^(\d{1,2}):(\d{2})/.exec(String(value||''));if(!match)return 'Not recorded';const hour=Number(match[1]);return `${hour%12||12}:${match[2]} ${hour>=12?'PM':'AM'}`;};
const duration=computed(()=>{const seconds=Math.round(Number(props.claim.payload?.totalMinutes||0)*60);return `${Math.floor(seconds/60)} min${seconds%60?` ${seconds%60} sec`:''}`;});
const payCategory=computed(()=>attendance.value.rateLabel || ({'MEETING':'Support Activity','Admin Time':'Administrative time','Individual Meeting':'Individual meeting','Supervisor meeting':'Supervisor meeting','Unpaid Indirect':'Unpaid indirect time'})[props.claim.payload?.serviceCode]||humanize(props.claim.payload?.serviceCode));
async function loadAttendance(){const id=++requestId;loading.value=true;error.value='';attendance.value={};try{const {data}=await api.get(`/payroll/time-claims/${props.claim.id}/meeting-attendance`,{skipGlobalLoading:true});if(id===requestId)attendance.value=data||{};}catch{if(id===requestId)error.value='Attendance could not be loaded. Please try again.';}finally{if(id===requestId)loading.value=false;}}
watch(()=>props.claim.id,loadAttendance,{immediate:true});
</script>
<style scoped>
.meeting-claim{border:1px solid #d9e5e8;border-radius:18px;max-height:calc(100dvh - 160px);overflow:auto;color:#183445;background:#fff;font:14px/1.55 var(--font-body,system-ui,sans-serif);margin:16px}.meeting-claim__hero{padding:22px 24px;background:linear-gradient(115deg,#e8f6f2,#edf4fc)}.meeting-claim__brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;color:#143e4d}.meeting-claim__brand img{width:28px;height:28px}.meeting-claim__brand span{margin-left:auto;font-size:11px;letter-spacing:.04em;font-weight:600}.meeting-claim__heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:16px}.meeting-claim h2{font-size:24px;line-height:1.2;margin:0;color:#123d47}.meeting-claim__status{border:1px solid #b6d4c9;background:#fff;padding:5px 10px;border-radius:30px;font-size:12px;font-weight:650}.meeting-claim p{margin:8px 0}.meeting-claim__content{padding:22px 24px}.meeting-claim__metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.meeting-claim__metrics>div{padding:14px;border:1px solid #dce6ee;border-radius:12px;background:#f7fafc}.meeting-claim__metrics span,.meeting-claim small{display:block;color:#607481;font-size:12px}.meeting-claim__metrics strong{display:block;font-size:20px;margin-top:5px;color:#164c52}.meeting-claim section{padding-top:20px;margin-top:20px;border-top:1px solid #e2e9ed}.meeting-claim h3{font-size:15px;margin:0 0 6px;color:#193b4c}.meeting-claim dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:16px 0 0}.meeting-claim dt{font-size:12px;color:#607481}.meeting-claim dd{margin:3px 0 0;font-weight:600;overflow-wrap:anywhere}.meeting-claim__muted{font-size:12px;color:#607481}.meeting-claim__people{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;list-style:none;padding:0;margin:14px 0 0}.meeting-claim__people li{display:flex;align-items:center;gap:10px;padding:10px;background:#f7fafb;border-radius:10px;min-width:0}.meeting-claim__avatar{display:grid;place-items:center;flex-shrink:0;width:34px;height:34px;background:#deefea;border-radius:50%;color:#236654;font-weight:700;font-size:12px}.meeting-claim__source{background:#f2f7fa;padding:16px!important;border-radius:12px;border:0!important;font-size:13px}.meeting-claim footer{margin-top:20px;color:#75828c;font-size:11px}.meeting-claim button{padding:8px 14px;border:1px solid #bed4d6;background:#fff;border-radius:8px;color:#164c52;cursor:pointer}.meeting-claim button:focus-visible{outline:2px solid #164c52;outline-offset:2px}@media(max-width:520px){.meeting-claim{margin:10px}.meeting-claim__hero,.meeting-claim__content{padding:16px}.meeting-claim__heading{align-items:flex-start;flex-direction:column}.meeting-claim__brand{flex-wrap:wrap}.meeting-claim__brand span{margin-left:0}.meeting-claim dl{grid-template-columns:1fr}.meeting-claim__people{grid-template-columns:1fr}.meeting-claim h2{font-size:22px}}
</style>
