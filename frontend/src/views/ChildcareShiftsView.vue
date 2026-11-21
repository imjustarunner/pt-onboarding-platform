<template>
  <main class="childcare-page">
    <header><div><button type="button" @click="router.push(`/${route.params.organizationSlug || agencyStore.currentAgency?.slug}/dashboard`)">Back to My Dashboard</button><p class="eyebrow">My work</p><h1>Childcare</h1><p>Scheduled children, attendance, and your actual work time.</p></div><div class="actions"><MomentumStickyComposer label="Add a sticky" show-saved /><button type="button" :disabled="loading || busy" @click="load">Refresh</button></div></header>
    <p v-if="error && !selected && !editing" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">Loading childcare shifts…</p>
    <p v-else-if="!context?.enabled || (!context.canWork && !context.canManage && !context.canApprove)" role="status">Childcare is not assigned to your account in this workspace. Ask your scheduler to review your service assignments.</p>
    <template v-else>
      <details v-if="ownRates" class="card rate-summary" :open="ownRates.reviewRequired || undefined"><summary>Your childcare rates</summary><p v-if="ownRates.reviewRequired" class="review">{{ (ownRates.reasons || []).join('; ') }}</p><p>Category {{ ownRates.category || 'not configured' }} · Childcare level {{ ownRates.childcareLevel || 'not configured' }}<span v-if="ownRates.effectiveOn"> · Effective {{ ownRates.effectiveOn }}</span></p><ul><li v-for="band in CHILDCARE_BANDS" :key="band">{{ band }} {{ band === 1 ? 'child' : 'children' }} per caregiver: {{ childcareMoney(ownRates.ratesByBand?.[band]) }}/hour</li></ul></details>
      <button v-if="context.canSchedule || context.canManage" type="button" :disabled="busy" @click="newShift">Schedule childcare</button>
      <form v-if="editing" class="card shift-form" @submit.prevent="saveShift">
        <h2>{{ editId ? 'Edit childcare shift' : 'Schedule childcare' }}</h2>
        <label>Title<input v-model="draft.title" maxlength="160" placeholder="Childcare shift" /></label>
        <label>Time zone<select v-model="draft.timezone" required><optgroup v-for="group in TIMEZONE_GROUPS" :key="group.label" :label="group.label"><option v-for="zone in group.zones" :key="zone.value" :value="zone.value">{{ zone.label }}</option></optgroup></select></label>
        <div class="columns"><label>Starts<input v-model="draft.startLocal" type="datetime-local" required /></label><label>Ends<input v-model="draft.endLocal" type="datetime-local" required /></label></div>
        <label>Planned number of children<input v-model="draft.plannedChildren" type="number" min="0" step="1" required /></label>
        <label>Building / childcare location<select v-model="draft.officeLocationId" @change="draft.roomId = null; draft.locationName = ''"><option :value="null">Choose a building (optional)</option><option v-for="site in locations" :key="site.id" :value="site.id">{{ site.name }}</option></select></label>
        <label v-if="draft.officeLocationId">Room (optional)<select v-model="draft.roomId"><option :value="null">No specific room</option><option v-for="room in locationRooms" :key="room.id" :value="room.id">{{ room.number ? `Room ${room.number} — ` : '' }}{{ room.name }}</option></select></label>
        <p v-if="!draft.officeLocationId && draft.locationName">Retained work location: {{ draft.locationName }}</p><p>Choose the building first; a room is optional. This records the worksite. It does not reserve an office.</p>
        <div v-if="context.canManagePay" class="columns"><label>Approved work-location minimum hourly rate<input v-model="draft.minimumHourlyRate" type="number" min="0.01" step="0.01" inputmode="decimal" /></label><label>Work-location jurisdiction<input v-model="draft.wageFloorJurisdiction" maxlength="200" placeholder="Approved jurisdiction for this location" /></label></div>
        <fieldset v-if="context.canManage"><legend>Caregivers and co-caregivers</legend><label v-for="person in eligibleStaff" :key="person.userId" class="check"><input v-model="draft.providerUserIds" type="checkbox" :value="person.userId" />{{ person.firstName }} {{ person.lastName }}</label><p v-if="!eligibleStaff.length">No active childcare assignments. Review the employee’s service permissions first.</p></fieldset>
        <p v-else>You are scheduling your own childcare shift. An authorized scheduler can add eligible co-caregivers; only staff actually working share the child-count pay band.</p>
        <label>Private operational note (optional)<textarea v-model="draft.note" maxlength="4000" placeholder="Supplies, arrival instructions, or other operational details" /></label>
        <p>Child names are not needed. Planned children are kept separately from actual attendance.</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="actions"><button type="submit" :disabled="busy">{{ busy ? 'Saving…' : 'Save shift' }}</button><button type="button" :disabled="busy" @click="editing = false">Cancel</button></div>
      </form>
      <section v-if="context.canApprove" class="card work-review-queue"><h2>Childcare work awaiting review</h2><p v-if="!reviewQueue.length">No submitted work, attendance or time corrections are awaiting your review.</p><button v-for="shift in reviewQueue" :key="shift.id" type="button" class="shift-choice" @click="openShift(shift.id)"><strong>{{shift.title || 'Childcare shift'}}</strong><span>{{when(shift)}}</span><span>{{reviewSummary(shift)}}</span></button></section>
      <section class="shift-layout">
        <div><h2>Shifts</h2><p v-if="!shifts.length">No childcare shifts are scheduled.</p><button v-for="shift in shifts" :key="shift.id" type="button" class="card shift-choice" :aria-pressed="selected?.id === shift.id" @click="openShift(shift.id)"><strong>{{ shift.title || 'Childcare shift' }}</strong><span>{{ when(shift) }}</span><span>{{ shift.plannedChildren }} children planned · {{ shift.workReviews?.find(r => Number(r.user_id) === myId)?.status === 'submitted' ? 'Work submitted for review' : shift.status }}</span></button></div>
        <article v-if="selected" class="card shift-detail">
          <h2>{{ selected.title || 'Childcare shift' }}</h2><p>{{ when(selected) }}</p><p v-if="selected.locationName">{{ selected.locationName }}</p>
          <p v-if="error && !editing" class="error" role="alert">{{ error }}</p>
          <p><strong>{{ selected.plannedChildren }} children planned</strong><span v-if="selected.actualChildren != null"> · Latest recorded count: {{ selected.actualChildren }}</span></p>
          <p v-if="selected.note" class="operational-note">{{ selected.note }}</p>
          <ul class="caregivers"><li v-for="person in selected.providers || []" :key="person.userId">{{ person.firstName }} {{ person.lastName }} · {{ person.clockedIn ? 'Clocked in' : person.clockedOut ? 'Clocked out' : 'Not clocked in' }}</li></ul>
          <template v-if="selected.status !== 'cancelled' && selected.status !== 'canceled'">
            <fieldset class="child-count-choices" v-if="isAssigned || context.canManage || context.canApprove"><legend>Were the scheduled {{ selected.plannedChildren }} children present?</legend><label class="check"><input v-model="countChoice" type="radio" value="planned" name="childcare-count" />Yes, {{ selected.plannedChildren }} children</label><label class="check"><input v-model="countChoice" type="radio" value="actual" name="childcare-count" />A different number</label><label v-if="countChoice === 'actual'">Actual children present<input v-model="actualCount" type="number" min="0" step="1" /></label><label class="check"><input v-model="countChoice" type="radio" value="later" name="childcare-count" />Attendance needs review; record my time now</label></fieldset>
            <div class="actions"><button v-if="isAssigned && !clockedIn && selected.status!=='completed'" type="button" :disabled="busy" @click="punch('clock-in')">Clock in</button><button v-if="isAssigned && clockedIn" type="button" :disabled="busy" @click="punch('clock-out')">Clock out</button><button v-if="isAssigned || context.canManage || context.canApprove" type="button" :disabled="busy || countChoice === 'later'" @click="saveAttendance">Record attendance change</button><button v-if="canEdit" type="button" :disabled="busy" @click="editShift">Edit schedule</button><button v-if="canEdit" type="button" :disabled="busy" @click="cancelShift">Cancel shift</button></div>
          </template>
          <p v-if="selected.myParticipation?.clockedInAt">Clocked in: {{ instant(selected.myParticipation.clockedInAt, selected.timezone) }}</p><p v-if="selected.myParticipation?.clockedOutAt">Clocked out: {{ instant(selected.myParticipation.clockedOutAt, selected.timezone) }}</p>
          <form v-if="(context.canManage || context.canApprove) && selected.attendanceReviewRequired" class="review" @submit.prevent="resolveAttendance"><h3>Review attendance</h3><label>Reviewed actual child count<input v-model="reviewCount" type="number" min="0" step="1" required /></label><label>Count applied from ({{ selected.timezone }})<input v-model="reviewEffectiveLocal" type="datetime-local" required /></label><label>Review explanation<textarea v-model="reviewNote" required maxlength="2000" placeholder="Explain how the recorded attendance and work intervals were verified." /></label><p>The original observations and punches stay in history. This records a reviewed count for the stated work interval.</p><button type="submit" :disabled="busy">Record attendance review</button></form>
          <section id="childcare-finalize" tabindex="-1" class="work-review"><h3>{{ finalizeShift ? 'Finalize this childcare shift' : 'Recorded work and childcare sign-off' }}</h3>
            <p>Clocking out records time. The employee submits their work, then a separate authorized reviewer signs off. Payroll approval remains separate.</p>
            <template v-if="isAssigned">
              <p>Your submission: {{ownWorkReview?.status || 'Not submitted'}}</p><p v-if="ownWorkReview?.status==='draft'">The recorded work changed. Review and submit the current intervals again.</p>
              <label v-if="!clockedIn" class="check"><input v-model="confirmWork" type="checkbox" />I confirm this is my actual recorded work and attendance.</label>
              <button v-if="!clockedIn && !['submitted','approved'].includes(ownWorkReview?.status)" type="button" :disabled="busy||!confirmWork" @click="perform('submit-work',{confirmed:confirmWork},'Work submitted for childcare review.')">Submit work for review</button>
              <details :open="route.query.focus === 'time-correction'"><summary>Request an actual time correction / record missed time</summary><p>Enter actual work only. Original clock punches remain in history. The correction needs separate review before it affects pay.</p>
                <div v-for="(interval,index) in correctionIntervals" :key="index" class="columns"><label>Actual start ({{selected.timezone}})<input v-model="interval.startLocal" type="datetime-local" step="1" /></label><label>Actual end<input v-model="interval.endLocal" type="datetime-local" step="1" /></label><button v-if="correctionIntervals.length>1" type="button" @click="correctionIntervals.splice(index,1)">Remove interval</button></div>
                <button type="button" :disabled="correctionIntervals.length>=12" @click="correctionIntervals.push({startLocal:'',endLocal:''})">Add work interval</button>
                <label>Children present at the beginning of this work<input v-model="correctionChildren" type="number" min="0" step="1" /></label><label>Why does the recorded time need correction?<textarea v-model="correctionReason" maxlength="2000" /></label><button type="button" :disabled="busy" @click="requestTimeCorrection">Send correction for review</button>
              </details>
            </template>
            <article v-for="correction in selected.timeCorrections||[]" :key="`time-${correction.id}`" class="review"><strong>Time correction #{{correction.id}} · {{caregiverName(correction.user_id)}} · {{correction.status}}</strong><p>{{correction.reason}}</p><p v-for="(interval,i) in parseIntervals(correction.intervals_json)" :key="i">{{instant(interval.startedAt,selected.timezone)}} – {{instant(interval.endedAt,selected.timezone)}}</p><p>{{correction.actual_children}} children reported at the start.</p>
              <template v-if="context.canApprove && correction.status==='pending' && Number(correction.user_id)!==myId"><label>Review explanation<textarea v-model="timeNotes[correction.id]" maxlength="2000" /></label><button type="button" :disabled="busy||!timeNotes[correction.id]?.trim()" @click="reviewTime(correction,'approved')">Approve actual time correction</button><button type="button" :disabled="busy||!timeNotes[correction.id]?.trim()" @click="reviewTime(correction,'rejected')">Return correction</button></template>
            </article>
            <article v-for="review in selected.workReviews||[]" :key="`work-${review.user_id}`" class="review"><strong>{{caregiverName(review.user_id)}} · {{review.status}}</strong><p v-for="(interval,i) in review.intervals" :key="i">{{instant(interval.startedAt,selected.timezone)}} – {{instant(interval.endedAt,selected.timezone)}}</p><p v-if="review.review_note">{{review.review_note}}</p>
              <template v-if="context.canApprove && review.status==='submitted' && Number(review.user_id)!==myId"><label>Review explanation<textarea v-model="workNotes[review.user_id]" maxlength="2000" /></label><label class="check"><input v-model="workConfirmed[review.user_id]" type="checkbox" />I reviewed these actual intervals and the recorded child-count timeline.</label><button type="button" :disabled="busy||!workConfirmed[review.user_id]||!workNotes[review.user_id]?.trim()" @click="reviewWork(review,'approved')">Sign off on childcare work</button><button type="button" :disabled="busy||!workNotes[review.user_id]?.trim()" @click="reviewWork(review,'rejected')">Return work for correction</button></template>
            </article>
            <details v-if="selected.attendanceHistory?.length"><summary>Recorded child-count timeline</summary><p v-for="(observation,i) in selected.attendanceHistory" :key="i">{{instant(observation.effectiveAt,selected.timezone)}} · {{observation.actualChildren}} children<span v-if="observation.reviewRequired"> · observation flagged for review</span></p></details>
          </section>
          <section v-if="pay"><h3>Your childcare pay</h3><p v-if="pay.claimStatus==='deferred'" class="review" role="status">Pay held for review. Pending corrections or work sign-off must be resolved before this work can proceed to payroll review.</p><p v-if="pay.reviewRequired" class="review" role="status">Review required: {{ (pay.reasons || []).join('; ') }}</p><p v-if="pay.correctionReviewRequired">Previously approved: {{ childcareMoney(pay.approvedAmount) }}. Revised estimate awaiting correction review: {{ childcareMoney(pay.estimatedUnapprovedAmount) }}.</p><p>{{ Number(pay.totalMinutes || 0).toFixed(2) }} actual minutes · <strong>Estimated gross pay: {{ childcareMoney(pay.totalAmount) }}</strong></p><p>Each interval uses children divided by caregivers actually clocked in, rounded up. Zero-child required work uses the one-child base. Gross amounts are rounded to cents per interval.</p><div class="table-wrap"><table v-if="pay.segments?.length"><thead><tr><th>Work interval</th><th>Children / caregivers</th><th>Band</th><th>Rate / hour</th><th>Amount</th></tr></thead><tbody><tr v-for="(segment, i) in pay.segments" :key="i"><td>{{ instant(segment.startedAt, selected.timezone) }} – {{ instant(segment.endedAt, selected.timezone) }}</td><td>{{ segment.children }} / {{ segment.caregivers }}</td><td>{{ segment.band }}</td><td>{{ childcareMoney(segment.rate) }}</td><td>{{ childcareMoney(segment.amount) }}</td></tr></tbody></table></div><p>Calculated from recorded attendance, active caregivers, actual time, and your effective approved rates.</p></section>
        </article>
      </section>
    </template>
  </main>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import api from '../services/api';
import { TIMEZONE_GROUPS, zonedDatetimeLocalToIso, isoToZonedDatetimeLocal, formatViewerEventWhen, parseUtcInstant } from '../utils/timezones';
import MomentumStickyComposer from '../components/momentum/MomentumStickyComposer.vue';
import { nextTick } from 'vue';
import { CHILDCARE_BANDS, childcareCountPayload, childcareMoney } from '../utils/childcarePresentation';

const props = defineProps({ agencyId: { type: Number, default: null }, http: { type: Object, default: null }, shiftId: { type: Number, default: null }, userId: { type: Number, default: null } });
const route = useRoute(), router = useRouter(), agencyStore = useAgencyStore(), auth = useAuthStore();
async function focusFinalize(){if(!finalizeShift.value&&route.query.focus!=='finalize')return;await nextTick();const el=document.getElementById('childcare-finalize');el?.scrollIntoView?.({block:'start',behavior:'smooth'});el?.focus?.();}
const http = computed(() => props.http || api);
const agencyId = computed(() => Number(props.agencyId || agencyStore.currentAgency?.id) || null);
const context = ref(null), shifts = ref([]), selected = ref(null), pay = ref(null), eligibleStaff = ref([]);
const ownRates = ref(null), locations = ref([]);
const locationRooms = computed(() => locations.value.find(site => Number(site.id) === Number(draft.value.officeLocationId))?.rooms || []);
const loading = ref(false), busy = ref(false), error = ref(''), notice = ref(''), editing = ref(false), editId = ref(null);
const confirmWork=ref(false),correctionIntervals=ref([{startLocal:'',endLocal:''}]),correctionChildren=ref(''),correctionReason=ref('');
const workNotes=reactive({}),workConfirmed=reactive({}),timeNotes=reactive({});let correctionKey=null,correctionPending=null;
const finalizeShift=ref(false);
const ownWorkReview=computed(()=>selected.value?.workReviews?.find(row=>Number(row.user_id)===myId.value));
const pendingReviewCount=shift=>(shift.workReviews||[]).filter(row=>row.status==='submitted'&&Number(row.user_id)!==myId.value).length+(shift.timeCorrections||[]).filter(row=>row.status==='pending'&&Number(row.user_id)!==myId.value).length+(shift.attendanceReviewRequired?1:0);
const reviewQueue=computed(()=>shifts.value.filter(shift=>pendingReviewCount(shift)>0));
const reviewSummary=shift=>`${pendingReviewCount(shift)} ${pendingReviewCount(shift)===1?'item':'items'} awaiting review`;
const caregiverName=id=>{const person=selected.value?.providers?.find(p=>Number(p.userId)===Number(id));return person?`${person.firstName} ${person.lastName}`:`Employee #${id}`;};
const parseIntervals=value=>typeof value==='string'?JSON.parse(value):value;
const countChoice = ref(''), actualCount = ref(''), draft = ref({});
const reviewCount = ref(''), reviewNote = ref(''), reviewEffectiveLocal = ref('');
let generation = 0, selectionGeneration = 0, actionKey = null, pendingPunch = null;
const myId = computed(() => Number(props.userId || auth.user?.id));
const isAssigned = computed(() => (selected.value?.providers || []).some(p => Number(p.userId) === myId.value));
const clockedIn = computed(() => !!((selected.value?.providers || []).find(p => Number(p.userId) === myId.value)?.clockedIn));
const canEdit = computed(() => context.value?.canManage || (context.value?.canSchedule && isAssigned.value));
const when = shift => formatViewerEventWhen(shift.startsAt, shift.endsAt, shift.timezone);
const instant = (value, timezone) => { const date = parseUtcInstant(value); return date ? date.toLocaleString('en-US', { timeZone: timezone || 'America/Denver', timeZoneName: 'short' }) : '—'; };
const message = e => e.response?.data?.error?.message || e.message || 'This action could not be completed. Try again.';
const unwrap = response => response.data?.data || response.data;

async function load() {
  const token = ++generation, aid = agencyId.value;
  selected.value = null; pay.value = null; context.value = null; shifts.value = []; ownRates.value = null; eligibleStaff.value = []; error.value = ''; editing.value = false;
  if (!aid) { error.value = 'Choose your organization to view childcare shifts.'; return; }
  loading.value = true;
  try {
    const data = unwrap(await http.value.get('/childcare/context', { params: { agencyId: aid } }));
    if (token !== generation) return;
    context.value = data;
    if (!data.enabled || (!data.canWork && !data.canManage && !data.canApprove)) return;
    if (data.canWork && myId.value) {
      const rates = unwrap(await http.value.get(`/childcare/staff/${myId.value}/rates`, { params: { agencyId: aid } }));
      if (token !== generation) return;
      ownRates.value = rates;
    }
    const listed = unwrap(await http.value.get('/childcare/shifts', { params: { agencyId: aid } }));
    if (token !== generation) return;
    shifts.value = listed.shifts || [];
    const sites = unwrap(await http.value.get('/childcare/locations', {params:{agencyId:aid}}));
    if (token !== generation) return;
    locations.value = sites.locations || [];
    if (data.canManage) {
      const people = unwrap(await http.value.get('/childcare/staff', { params: { agencyId: aid } }));
      if (token !== generation) return;
      eligibleStaff.value = (people.staff || []).filter(p => p.grant?.enabled);
    }
    const id = Number(props.shiftId || route.query.shiftId);
    if (id) await openShift(id, token);
  } catch (e) { if (token === generation) error.value = message(e); }
  finally { if (token === generation) loading.value = false; }
}
async function openShift(id, expectedGeneration = generation) {
  const selectionToken = ++selectionGeneration;
  error.value = ''; pay.value = null;
  try {
    const data = unwrap(await http.value.get(`/childcare/shifts/${id}`, { params: { agencyId: agencyId.value } }));
    if (expectedGeneration !== generation || selectionToken !== selectionGeneration) return;
    selected.value = data.shift || data; finalizeShift.value=route.query.focus==='finalize'; confirmWork.value=false;correctionKey=null;correctionPending=null;
    shifts.value = shifts.value.map(shift => Number(shift.id) === Number(id) ? {...shift, ...selected.value} : shift);
    const recordedCount = selected.value.actualChildren;
    countChoice.value = recordedCount == null ? '' : recordedCount === selected.value.plannedChildren ? 'planned' : 'actual';
    actualCount.value = recordedCount ?? '';
    reviewCount.value = selected.value.actualChildren ?? ''; reviewNote.value = ''; reviewEffectiveLocal.value = isoToZonedDatetimeLocal(selected.value.firstClockInAt || selected.value.startsAt, selected.value.timezone); actionKey = null; pendingPunch = null;
    correctionIntervals.value=(ownWorkReview.value?.intervals?.length?ownWorkReview.value.intervals:selected.value.myParticipation?.intervals||[]).map(row=>({startLocal:isoToZonedDatetimeLocal(row.startedAt,selected.value.timezone,{includeSeconds:true}),endLocal:isoToZonedDatetimeLocal(row.endedAt,selected.value.timezone,{includeSeconds:true})}));if(!correctionIntervals.value.length)correctionIntervals.value=[{startLocal:'',endLocal:''}];
    if (!props.http && Number(route.query.shiftId) !== Number(id)) router.replace({ query: { ...route.query, shiftId: String(id) } });
    if (isAssigned.value) {
      const result = unwrap(await http.value.get(`/childcare/shifts/${id}/pay-preview`, { params: { agencyId: agencyId.value } }));
      if (expectedGeneration === generation && selectionToken === selectionGeneration && Number(selected.value?.id) === Number(id)) pay.value = result;
    }
  } catch (e) { if (expectedGeneration === generation && selectionToken === selectionGeneration) error.value = message(e); }
}
function newShift() {
  error.value = '';
  editId.value = null; draft.value = { title: 'Childcare shift', timezone: agencyStore.currentAgency?.timezone || 'America/Denver', startLocal: '', endLocal: '', plannedChildren: '', providerUserIds: context.value.canManage ? [] : [myId.value], note: '', locationName: '', officeLocationId: null, roomId: null, minimumHourlyRate: '', wageFloorJurisdiction: '' }; editing.value = true;
}
function editShift() {
  error.value = '';
  const shift = selected.value; editId.value = shift.id;
  draft.value = { title: shift.title, timezone: shift.timezone, startLocal: isoToZonedDatetimeLocal(shift.startsAt, shift.timezone), endLocal: isoToZonedDatetimeLocal(shift.endsAt, shift.timezone), plannedChildren: shift.plannedChildren, providerUserIds: (shift.providers || []).map(p => p.userId), note: shift.note || '', locationName: shift.locationName || '', officeLocationId: shift.officeLocationId || null, roomId: shift.roomId || null, minimumHourlyRate: shift.minimumHourlyRate ?? '', wageFloorJurisdiction: shift.wageFloorJurisdiction || '' }; editing.value = true;
}
async function saveShift() {
  if (busy.value) return;
  const aid = agencyId.value;
  try {
    const startsAt = zonedDatetimeLocalToIso(draft.value.startLocal, draft.value.timezone), endsAt = zonedDatetimeLocalToIso(draft.value.endLocal, draft.value.timezone);
    if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) throw new Error('Choose a valid start and later end time in the shift time zone.');
    if (String(draft.value.plannedChildren).trim() === '' || !Number.isSafeInteger(Number(draft.value.plannedChildren)) || Number(draft.value.plannedChildren) < 0) throw new Error('Enter the planned number of children.');
    busy.value = true; error.value = '';
    const body = { agencyId: aid, title: draft.value.title, startsAt, endsAt, timezone: draft.value.timezone, plannedChildren: Number(draft.value.plannedChildren), providerUserIds: context.value.canManage ? draft.value.providerUserIds : [myId.value], note: draft.value.note, locationName: draft.value.locationName, officeLocationId: draft.value.officeLocationId, roomId: draft.value.roomId, ...(context.value.canManagePay ? { minimumHourlyRate: draft.value.minimumHourlyRate === '' ? null : Number(draft.value.minimumHourlyRate), wageFloorJurisdiction: draft.value.wageFloorJurisdiction } : {}) };
    const result = unwrap(await (editId.value ? http.value.patch(`/childcare/shifts/${editId.value}`, body, { skipGlobalLoading: true }) : http.value.post('/childcare/shifts', body, { skipGlobalLoading: true })));
    if (aid !== agencyId.value) return;
    editing.value = false; notice.value = 'Childcare shift saved.';
    const id = result.shift?.id || result.id; await load(); if (id) await openShift(id);
  } catch (e) { if (aid === agencyId.value) error.value = message(e); }
  finally { busy.value = false; }
}
async function perform(action, body, success) {
  if (busy.value || !selected.value) return;
  const aid = agencyId.value, id = selected.value.id;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await http.value.post(`/childcare/shifts/${id}/${action}`, { agencyId: aid, ...body }, { skipGlobalLoading: true });
    actionKey = null; pendingPunch = null;
    if (aid !== agencyId.value) return;
    notice.value = success;
    window.dispatchEvent(new Event('childcare-clock-changed'));
    await openShift(id);
    if(action==='clock-out'&&aid===agencyId.value&&Number(selected.value?.id)===Number(id)){
      if(!props.http) await router.replace({query:{...route.query,shiftId:String(id),focus:'finalize'}});
      finalizeShift.value=true;
      await focusFinalize();
    }
  } catch (e) { if (aid === agencyId.value) error.value = message(e); }
  finally { busy.value = false; }
}
function punch(action) {
  try {
    const counts = childcareCountPayload(countChoice.value, actualCount.value, selected.value.plannedChildren);
    if (pendingPunch && (pendingPunch.action !== action || JSON.stringify(pendingPunch.counts) !== JSON.stringify(counts))) throw new Error('Retry the original clock request or refresh this shift to confirm its result before changing attendance.');
    actionKey ||= globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingPunch = { action, counts };
    return perform(action, { ...counts, idempotencyKey: actionKey }, action === 'clock-in' ? 'Clock-in recorded.' : 'Clock-out recorded.');
  } catch (e) { error.value = message(e); }
}
function saveAttendance() {
  try { if (pendingPunch) throw new Error('Refresh this shift to confirm the earlier clock request before recording an attendance change.'); return perform('attendance', { ...childcareCountPayload(countChoice.value, actualCount.value, selected.value.plannedChildren), expectedVersion: selected.value.attendanceVersion }, 'Attendance change recorded.'); }
  catch (e) { error.value = message(e); }
}
function resolveAttendance() {
  try {
    if (!reviewNote.value.trim()) throw new Error('Explain the attendance review before saving.');
    const effectiveAt = zonedDatetimeLocalToIso(reviewEffectiveLocal.value, selected.value.timezone);
    if (!effectiveAt) throw new Error('Choose the verified start of this attendance count.');
    return perform('attendance', { ...childcareCountPayload('actual', reviewCount.value, selected.value.plannedChildren), expectedVersion: selected.value.attendanceVersion, resolveReview: true, reviewNote: reviewNote.value.trim(), effectiveAt }, 'Attendance review recorded.');
  } catch (e) { error.value = message(e); }
}
function requestTimeCorrection(){
 try{const intervals=correctionIntervals.value.map(row=>({startedAt:zonedDatetimeLocalToIso(row.startLocal,selected.value.timezone),endedAt:zonedDatetimeLocalToIso(row.endLocal,selected.value.timezone)}));
  if(intervals.some(row=>!row.startedAt||!row.endedAt)||!correctionReason.value.trim()||correctionChildren.value==='')throw new Error('Enter actual time, the child count and a correction reason.');
  const body={intervals,actualChildren:Number(correctionChildren.value),reason:correctionReason.value.trim()};
  if(correctionPending&&correctionPending!==JSON.stringify(body))throw new Error('Confirm the earlier correction request by refreshing before changing its contents.');
  correctionKey||=globalThis.crypto.randomUUID();correctionPending=JSON.stringify(body);
  return perform('time-corrections',{...body,idempotencyKey:correctionKey},'Time correction sent for separate review. Original punches are preserved.');
 }catch(e){error.value=message(e);}
}
function reviewWork(row,decision){return perform('review-work',{targetUserId:row.user_id,decision,note:workNotes[row.user_id],snapshotHash:row.snapshot_hash,confirmed:!!workConfirmed[row.user_id]},decision==='approved'?'Childcare work signed off; payroll review remains separate.':'Work returned for correction.');}
function reviewTime(row,decision){return perform(`time-corrections/${row.id}/review`,{decision,note:timeNotes[row.id]},decision==='approved'?'Actual time correction reviewed. Employee must review and submit the current work.':'Time correction returned.');}
async function cancelShift() {
  if (busy.value) return;
  busy.value = true; error.value = '';
  const aid = agencyId.value, id = selected.value.id;
  try { await http.value.patch(`/childcare/shifts/${id}`, { agencyId: aid, status: 'cancelled' }); if (aid === agencyId.value) { notice.value = 'Shift canceled.'; await load(); } }
  catch (e) { if (aid === agencyId.value) error.value = message(e); }
  finally { busy.value = false; }
}
watch(agencyId, load, { immediate: true });
watch(() => props.shiftId, id => { if (id && context.value) openShift(id); });
watch(()=>[route.query.shiftId,route.query.focus],async()=>{const id=Number(route.query.shiftId);if(id&&context.value){await openShift(id);await focusFinalize();}});
watch(()=>selected.value?.id,focusFinalize);
</script>

<style scoped>
.childcare-page{max-width:1120px;margin:auto;padding:24px;color:var(--text-primary,#203b32)}header,.actions{display:flex;gap:12px;align-items:center;justify-content:space-between}header p{margin:5px 0}.eyebrow{font-size:.8rem;text-transform:uppercase;letter-spacing:.1em}h1{margin:0}.card{border:1px solid #b7cfc3;border-radius:12px;background:var(--bg-card,#fff);padding:20px;margin:14px 0}.shift-layout{display:grid;grid-template-columns:minmax(220px,1fr) minmax(0,2fr);gap:24px}.shift-choice{display:flex;flex-direction:column;text-align:left;gap:8px;width:100%}.shift-choice[aria-pressed=true]{outline:2px solid #27654e}.shift-form{display:grid;gap:14px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}label{display:grid;gap:6px}.check{display:flex;align-items:center;gap:8px;margin:8px 0}.check input{width:auto}input,select,textarea,button{font:inherit}input,select,textarea{width:100%;box-sizing:border-box;border:1px solid #95b4a5;border-radius:7px;padding:10px;background:var(--bg-input,#fff);color:inherit}button{border:1px solid #739b87;border-radius:7px;padding:10px 14px;cursor:pointer;color:inherit;background:var(--bg-card,#fff)}button:disabled{opacity:.6;cursor:wait}.actions{justify-content:flex-start;flex-wrap:wrap}.error{background:#fff0ef;color:#8b2020;padding:14px;border-radius:8px}.notice{background:#e8f5ee;padding:12px;border-radius:8px}.review{color:#754800;background:#fff4d6;padding:12px}.operational-note{white-space:pre-wrap}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:.85rem}th,td{text-align:left;padding:10px;border-bottom:1px solid #d4e1da}fieldset{border:1px solid #bbcec2;border-radius:8px;padding:14px;margin:14px 0}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #367bd4;outline-offset:2px}@media(max-width:700px){.childcare-page{padding:16px}.shift-layout,.columns{grid-template-columns:1fr}.card{padding:16px}header{align-items:flex-start;flex-wrap:wrap}}
.shift-layout>*{min-width:0}.card{min-width:0;box-sizing:border-box}.table-wrap{max-width:100%}fieldset{min-inline-size:0}.check{overflow-wrap:anywhere}.child-count-choices .check{cursor:pointer;min-height:44px;text-align:left;justify-content:flex-start}.child-count-choices input[type=radio]{flex:0 0 18px;width:18px;height:18px;max-width:18px;margin:0;cursor:pointer}@media(max-width:700px){.shift-layout,.columns{grid-template-columns:minmax(0,1fr)}}
.childcare-page{box-sizing:border-box;max-width:1540px;width:100%;padding:clamp(12px,1.5vw,24px)}.rate-summary{padding:10px 16px}.rate-summary summary{font-weight:700;cursor:pointer}.rate-summary ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(195px,1fr));gap:5px 20px;padding-left:20px}.shift-layout{align-items:start}.shift-choice{padding:12px 14px;margin:8px 0;gap:4px}@media(max-width:700px){header{flex-wrap:wrap}}
</style>
