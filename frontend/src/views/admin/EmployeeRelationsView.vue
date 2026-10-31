<template>
  <div class="er-root">
    <header class="er-header">
      <div><h2>Year Awards</h2><p>Anniversary gifts, dinner invitations, and the details of what each person received.</p></div>
      <div class="er-actions">
        <label v-if="agencyChoices.length > 1">Agency <select v-model="selectedAgencyId" aria-label="Awards agency" :disabled="busy"><option v-for="a in agencyChoices" :key="a.id" :value="String(a.id)">{{ a.name }}</option></select></label>
        <button :disabled="loading || busy" @click="load">Refresh</button>
        <button class="primary" :disabled="loading || busy || !selectedAgencyId" @click="sync">Sync from start dates</button>
      </div>
    </header>
    <p class="er-help">Each agency tracks its own gifts. Eligibility uses the earlier of the app’s start date and first-client date. Both dates stay separate. Missing dates need review; highlights here mean eligible with no gift completion recorded.</p>
    <p class="er-context"><strong>{{ selectedAgency?.name || 'Select an agency' }} · Year Awards</strong></p>
    <p v-if="isDemoAgency" class="er-warning" role="status">You are viewing demo awards. Choose your work agency above to see its employee dinner records.</p>
    <p class="er-help">The two-year view includes everyone who has reached two years, with dinner received or still owed shown for each person. Completed dinners stay in the history. Date and status filters can narrow this list.</p>
    <p v-if="message" class="er-success" role="status">{{ message }}</p>
    <p v-if="error" class="er-error" role="alert">{{ error }}</p>
    <details class="er-settings">
      <summary>Edit agency gifts</summary>
      <div class="er-gift-grid">
        <form v-for="gift in giftDrafts" :key="gift.milestone_years" @submit.prevent="saveGift(gift)">
          <strong>{{ gift.milestone_years }} year{{ gift.milestone_years === 1 ? '' : 's' }}</strong>
          <label>Gift name<input v-model="gift.gift_name" required maxlength="120" /></label>
          <label>Gift details<textarea v-model="gift.details" maxlength="10000" placeholder="Budget, sizes, ordering instructions…" /></label>
          <button :disabled="busy">Save gift</button>
        </form>
      </div>
    </details>
    <div class="er-awards" aria-label="Anniversary awards">
      <button v-for="gift in definitions" :key="gift.milestone_years" class="er-award" :aria-pressed="yearsFilter === String(gift.milestone_years)"
        @click="selectYear(gift.milestone_years)">
        <strong>{{ gift.milestone_years }} year{{ Number(gift.milestone_years) === 1 ? '' : 's' }}</strong><span>{{ gift.gift_name }}</span>
      </button>
    </div>
    <div class="er-controls">
      <input v-model="q" aria-label="Search awards" placeholder="Search name, email, award, or notes…" />
      <select v-model="statusFilter" aria-label="Award status"><option value="">All statuses</option><option value="owed">Eligible · gift owed</option><option value="upcoming">Upcoming</option><option value="gift_sent">Gift sent / dinner attended</option><option value="acknowledged">Acknowledged</option><option value="invited">Dinner invited</option></select>
      <select v-model="yearsFilter" aria-label="Milestone year"><option value="">All years</option><option v-for="gift in definitions" :key="gift.milestone_years" :value="String(gift.milestone_years)">{{ gift.milestone_years }} years</option></select>
      <select v-model="eligibilityFilter" aria-label="Eligibility"><option value="eligible">Reached anniversary</option><option value="all">All eligibility dates, including upcoming</option></select>
      <label class="er-check"><input v-model="includeInactive" type="checkbox" /> Include former employees</label>
      <label>Eligible from <input v-model="eligibleFrom" type="date" /></label>
      <label>Eligible through <input v-model="eligibleThrough" type="date" :min="eligibleFrom || undefined" /></label>
      <button v-if="eligibleFrom || eligibleThrough" @click="eligibleFrom='';eligibleThrough=''">All eligibility dates</button>
      <button @click="showAllDinners">All eligible two-year dinners</button>
      <button @click="showDinnerOwed">Two-year dinner follow-up</button>
    </div>
    <div class="er-stats" aria-label="Awards in this view">
      <span><strong>{{ filtered.length }}</strong> awards in view</span>
      <span><strong>{{ filtered.filter(r => r.status === 'owed').length }}</strong> {{ yearsFilter === '2' ? 'dinner still owed' : 'eligible · gift owed' }}</span>
      <span><strong>{{ filtered.filter(r => isComplete(r)).length }}</strong> {{ yearsFilter === '2' ? 'dinner received' : 'completed' }}</span>
    </div>
    <div v-if="selectedIds.length" class="er-bulk">
      <strong>{{ selectedIds.length }} people selected</strong>
      <button class="primary" :disabled="busy" @click="dinnerOpen = true">Schedule dinner / record invitations</button>
      <button @click="selectedIds = []">Clear selection</button>
    </div>
    <div class="er-table-wrap">
      <table>
        <thead><tr>
          <th><input type="checkbox" aria-label="Select all visible dinner candidates" :checked="allSelected" :disabled="!selectable.length" @change="toggleAll($event.target.checked)" /></th>
          <th v-for="col in columns" :key="col.key" :aria-sort="sortKey === col.key ? (sortAsc ? 'ascending' : 'descending') : 'none'"><button @click="sortBy(col.key)">{{ col.label }} {{ sortKey === col.key ? (sortAsc ? '↑' : '↓') : '↕' }}</button></th>
          <th>Dinner / gift notes</th>
        </tr></thead>
        <tbody>
          <tr v-if="loading"><td :colspan="columns.length + 2" class="er-empty">Loading…</td></tr>
          <tr v-else-if="!filtered.length"><td :colspan="columns.length + 2" class="er-empty">{{ milestones.length ? 'No awards match these filters.' : 'No awards yet. Staff need a start date or first-client date to calculate eligibility.' }}</td></tr>
          <template v-else>
            <tr v-for="row in filtered" :key="row.id" :class="{ 'er-owed': row.status === 'owed' }">
              <td><input v-if="canInvite(row)" v-model="selectedIds" type="checkbox" :value="row.id" :aria-label="`Select ${fullName(row)} for dinner`" /></td>
              <td><button class="er-link" @click="openAward(row)">{{ fullName(row) }}</button><small>{{ row.work_email || row.email }}</small><small v-if="!row.active_employee">Former / inactive employee</small></td>
              <td>{{ fmtDate(row.start_date) }}</td><td>{{ fmtDate(row.first_client_date) }}</td><td>{{ fmtDate(row.award_start_date) }}</td>
              <td>{{ row.milestone_years }} year{{ Number(row.milestone_years) === 1 ? '' : 's' }}</td>
              <td><button class="er-link" @click="openAward(row)">{{ awardName(row.milestone_years) }}</button></td>
              <td>{{ fmtDate(row.milestone_date) }}</td>
              <td><button class="er-link" @click="openAward(row)">{{ statusLabel(row) }}</button><small v-if="row.fulfilled_on">{{ fmtDate(row.fulfilled_on) }}</small></td>
              <td><span v-if="invitation(row)">{{ invitation(row).title }} · {{ fmtDate(invitation(row).scheduled_on) }} · {{ attendanceLabel(invitation(row).attendance) }}</span><small>{{ row.latest_note || row.gift_notes || 'Click award to add details' }}</small></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <details v-if="missingDates.length" class="er-settings">
      <summary>{{ missingDates.length }} active employees need a start or first-client date</summary>
      <p>Update their dates in the employee’s Lifecycle tab, then refresh this list.</p>
      <ul><li v-for="person in missingDates" :key="person.id">{{ fullName(person) }}</li></ul>
    </details>
    <section class="er-dinners">
      <h3>Two-year dinners</h3><p>Invitations are tracked here. Record who attended after the dinner. Recording invitations does not complete the award or send emails.</p>
      <p v-if="!dinners.length">Select people with unfinished two-year awards above to record a dinner.</p>
      <details v-for="dinner in dinners" :key="dinner.id" class="er-settings">
        <summary>{{ dinner.title }} · {{ fmtDate(dinner.scheduled_on) }} {{ dinner.scheduled_time || '' }} · {{ dinner.attendees.length }} invited</summary>
        <p>{{ dinner.location }} <span v-if="dinner.notes">— {{ dinner.notes }}</span></p>
        <div v-for="person in dinner.attendees" :key="person.milestone_id" class="er-attendee">
          <span>{{ fullName(person) }}</span>
          <select :value="person.attendance" :disabled="busy" :aria-label="`Dinner attendance for ${fullName(person)}`" @change="saveAttendance(dinner, person, $event.target.value)">
            <option v-for="state in attendanceStates" :key="state" :value="state">{{ attendanceLabel(state) }}</option>
          </select>
        </div>
      </details>
    </section>
    <div v-if="activeAward" class="er-overlay" @click.self="closeAward" @keydown.esc="closeAward">
      <section class="er-modal" role="dialog" aria-modal="true" aria-labelledby="award-title" tabindex="-1" ref="awardDialog">
        <header class="er-header"><h3 id="award-title">{{ fullName(activeAward) }} · {{ activeAward.milestone_years }} years · {{ awardName(activeAward.milestone_years) }}</h3><button :disabled="busy" @click="closeAward">Close</button></header>
        <p v-if="error" class="er-error" role="alert">{{ error }}</p>
        <p>{{ giftDetails(activeAward.milestone_years) }}</p>
        <p>Start: {{ fmtDate(activeAward.start_date) }} · First client: {{ fmtDate(activeAward.first_client_date) }}<br />Awards begin: {{ fmtDate(activeAward.award_start_date) }} · Eligible: {{ fmtDate(activeAward.milestone_date) }}</p>
        <form @submit.prevent="saveAward">
          <label>Status<select v-model="awardDraft.status" aria-label="Person award status"><option :value="pendingStatus(activeAward)">{{ pendingStatus(activeAward) === 'owed' ? 'Eligible · gift owed' : 'Upcoming / date needed' }}</option><option value="gift_sent">Gift sent / dinner attended</option><option value="acknowledged">Acknowledged</option></select></label>
          <label>Date given / attended (optional)<input v-model="awardDraft.fulfilledOn" type="date" /></label>
          <label>Gift details<textarea v-model="awardDraft.giftNotes" maxlength="10000" placeholder="Size, mailing details, left in kitchen…" /></label>
          <button class="primary" :disabled="busy">Save award</button>
        </form>
        <h4>Notes & history</h4>
        <form @submit.prevent="addNote"><label>Add a note<textarea v-model="noteDraft" required maxlength="10000" placeholder="Left in kitchen, mailed it, dinner arrangements…" /></label><button :disabled="busy || !noteDraft.trim()">Add note</button></form>
        <p v-if="notesLoading">Loading notes…</p>
        <ul class="er-history"><li v-for="note in notes" :key="note.id"><p>{{ note.note }}</p><small>{{ fullName(note) === '—' ? 'Imported / system' : fullName(note) }} · {{ fmtDate(note.created_at) }}</small></li></ul>
      </section>
    </div>
    <div v-if="dinnerOpen" class="er-overlay" @keydown.esc="dinnerOpen = false">
      <section class="er-modal" role="dialog" aria-modal="true" aria-labelledby="dinner-title">
        <header class="er-header"><h3 id="dinner-title">Schedule a two-year dinner</h3><button :disabled="busy" @click="dinnerOpen = false">Close</button></header>
        <p v-if="error" class="er-error" role="alert">{{ error }}</p>
        <p>{{ selectedIds.length }} invitees: {{ milestones.filter(r => selectedIds.includes(r.id)).map(fullName).join(', ') }}</p>
        <form @submit.prevent="saveDinner">
          <label>Dinner name<input v-model="dinnerDraft.title" required maxlength="160" /></label>
          <label>Date<input v-model="dinnerDraft.scheduledOn" type="date" required /></label>
          <label>Local time (optional)<input v-model="dinnerDraft.scheduledTime" type="time" /></label>
          <label>Location<input v-model="dinnerDraft.location" maxlength="255" /></label>
          <label>Details<textarea v-model="dinnerDraft.notes" maxlength="10000" placeholder="Reservation, organizer, invitation details…" /></label>
          <button class="primary" :disabled="busy">Save dinner and invitees</button>
        </form>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { isLikelyDemoTenant } from '../../utils/demoTenant';
import { isDemoWindowSession } from '../../utils/demoWindowSession';
import { resolvePortalSlug } from '../../utils/orgScopedPath';
import { resolveAwardsAgencyId } from '../../utils/employeeAwardView';
const route = useRoute();
const auth = useAuthStore();
const agencyStore = useAgencyStore();
const agencyChoices = computed(() => ((auth.user?.role === 'super_admin' ? agencyStore.agencies : agencyStore.userAgencies) || []).filter(a => a && (a.organization_type || 'agency') === 'agency'));
const defaultAgencyId = () => resolveAwardsAgencyId({ agencies: agencyChoices.value, requestedId: route.query.agencyId, currentId: agencyStore.currentAgencyId, portalSlug: resolvePortalSlug(route.params), demoSession: isDemoWindowSession() });
const selectedAgencyId = ref(defaultAgencyId());
const selectedAgency = computed(() => agencyChoices.value.find(a => String(a.id) === selectedAgencyId.value));
const isDemoAgency = computed(() => isLikelyDemoTenant(selectedAgency.value));
const milestones = ref([]), definitions = ref([]), giftDrafts = ref([]), dinners = ref([]), missingDates = ref([]);
const loading = ref(false), busy = ref(false), message = ref(''), error = ref(''), today = ref('');
const q = ref(''), statusFilter = ref(route.query.status || ''), yearsFilter = ref(route.query.status ? '' : '2'), includeInactive = ref(false);
const eligibilityFilter = ref(route.query.status === 'upcoming' ? 'all' : 'eligible');
const eligibleFrom=ref(''),eligibleThrough=ref('');
const selectedIds = ref([]), sortKey = ref('milestone_date'), sortAsc = ref(true);
const activeAward = ref(null), awardDraft = ref({}), notes = ref([]), noteDraft = ref(''), notesLoading = ref(false), awardDialog = ref(null);
const dinnerOpen = ref(false), dinnerDraft = ref({ title: 'Two-year dinner', scheduledOn: '', scheduledTime: '', location: '', notes: '' });
const attendanceStates = ['invited','attended','declined','no_show','cancelled'];
const attendanceLabel = value => ({ invited: 'Invited', attended: 'Attended', declined: 'Declined', no_show: 'Did not attend', cancelled: 'Invitation cancelled' }[value] || value);
const fullName = row => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '—';
const isComplete = row => ['gift_sent','acknowledged'].includes(row.status);
const canInvite = row => {
  const invite = invitation(row);
  return Number(row.milestone_years) === 2 && !isComplete(row) && !!row.milestone_date && !!row.active_employee
    && !(invite?.attendance === 'invited' && invite.scheduled_on.slice(0,10) >= today.value);
};
const pendingStatus = row => row.milestone_date && row.milestone_date.slice(0,10) <= today.value ? 'owed' : 'upcoming';
const statusLabel = row => Number(row.milestone_years) === 2 && isComplete(row) ? 'Dinner received' : !row.milestone_date && !isComplete(row) ? 'Date needed' : ({ upcoming: 'Upcoming', owed: Number(row.milestone_years) === 2 ? 'Dinner still owed' : 'Eligible · gift owed', gift_sent: 'Gift sent', acknowledged: 'Acknowledged' }[row.status]);
const awardName = years => definitions.value.find(g => Number(g.milestone_years) === Number(years))?.gift_name || 'Gift to confirm';
const giftDetails = years => definitions.value.find(g => Number(g.milestone_years) === Number(years))?.details || '';
const fmtDate = date => date ? new Date(`${String(date).slice(0,10)}T12:00:00`).toLocaleDateString('en-US',{ month:'short',day:'numeric',year:'numeric' }) : '—';
const invitation = row => {
  for (const dinner of dinners.value) { const person = dinner.attendees.find(a => a.milestone_id === row.id); if (person) return { ...dinner, attendance: person.attendance }; }
  return null;
};
const columns = [{key:'name',label:'Employee'},{key:'start_date',label:'Start date'},{key:'first_client_date',label:'First client'},{key:'award_start_date',label:'Awards begin'},{key:'milestone_years',label:'Year'},{key:'gift',label:'Gift'},{key:'milestone_date',label:'Eligible on'},{key:'status',label:'Status'}];
const filtered = computed(() => {
  const search = q.value.trim().toLowerCase();
  return milestones.value.filter(row => (includeInactive.value || row.active_employee)
    && (eligibilityFilter.value !== 'eligible' || (row.milestone_date && row.milestone_date.slice(0,10) <= today.value))
    && (!eligibleFrom.value || row.milestone_date?.slice(0,10)>=eligibleFrom.value)
    && (!eligibleThrough.value || row.milestone_date?.slice(0,10)<=eligibleThrough.value)
    && (!yearsFilter.value || String(row.milestone_years) === yearsFilter.value)
    && (!statusFilter.value || (statusFilter.value === 'invited' ? invitation(row)?.attendance === 'invited' : row.status === statusFilter.value))
    && (!search || [fullName(row),row.work_email,row.email,row.gift_notes,row.latest_note,awardName(row.milestone_years)].filter(Boolean).join(' ').toLowerCase().includes(search)))
    .sort((a,b) => {
      const value = row => sortKey.value === 'name' ? fullName(row) : sortKey.value === 'gift' ? awardName(row.milestone_years) : row[sortKey.value];
      const av = value(a), bv = value(b);
      const order = sortKey.value === 'milestone_years' ? Number(av)-Number(bv) : String(av || '').localeCompare(String(bv || ''));
      return (sortAsc.value ? order : -order) || fullName(a).localeCompare(fullName(b));
    });
});
const selectable = computed(() => filtered.value.filter(canInvite));
const allSelected = computed(() => selectable.value.length > 0 && selectable.value.every(r => selectedIds.value.includes(r.id)));
function toggleAll(checked) { selectedIds.value = checked ? [...new Set([...selectedIds.value,...selectable.value.map(r=>r.id)])] : selectedIds.value.filter(id=>!selectable.value.some(r=>r.id===id)); }
function sortBy(key) { sortAsc.value = sortKey.value === key ? !sortAsc.value : true; sortKey.value = key; }
function showAllDinners() { yearsFilter.value = '2'; eligibilityFilter.value = 'eligible'; statusFilter.value = ''; q.value = ''; eligibleFrom.value = ''; eligibleThrough.value = ''; }
function showDinnerOwed() { showAllDinners(); statusFilter.value = 'owed'; }
function selectYear(years) {
  if (Number(years) === 2) { showAllDinners(); return; }
  yearsFilter.value = yearsFilter.value === String(years) ? '' : String(years);
  eligibilityFilter.value = 'all';
}
function fail(e) { error.value = e.response?.data?.error?.message || e.message || 'Unable to save. Please try again.'; }
let requestId = 0;
async function load() {
  if (!selectedAgencyId.value) return;
  const request = ++requestId; loading.value = true; error.value = '';
  try {
    const {data} = await api.get('/employee-relations',{params:{agencyId:selectedAgencyId.value}});
    if (request !== requestId) return;
    milestones.value = data.milestones || []; definitions.value = data.definitions || [];
    giftDrafts.value = definitions.value.map(g => ({...g})); dinners.value = data.dinners || []; missingDates.value = data.missingStartDates || []; today.value = data.today;
    selectedIds.value = selectedIds.value.filter(id => milestones.value.some(r => r.id === id && canInvite(r)));
  } catch(e) { if (request === requestId) { fail(e); milestones.value = []; } }
  finally { if (request === requestId) loading.value = false; }
}
async function action(work) { busy.value=true; error.value=''; try { await work(); } catch(e) { fail(e); } finally { busy.value=false; } }
async function sync() { await action(async()=>{ const {data} = await api.post('/employee-relations/sync-from-start-dates',null,{params:{agencyId:selectedAgencyId.value}}); await load(); message.value=`Refreshed ${data.scanned} employees. ${data.missingDates || 0} need dates.`; }); }
async function saveGift(gift) { await action(async()=>{ const {data}=await api.put(`/employee-relations/gifts/${gift.milestone_years}`,{giftName:gift.gift_name,details:gift.details},{params:{agencyId:selectedAgencyId.value}}); definitions.value=data.definitions; message.value='Agency gift saved.'; }); }
async function openAward(row) { activeAward.value=row; awardDraft.value={status:row.status,fulfilledOn:row.fulfilled_on?.slice(0,10)||'',giftNotes:row.gift_notes||''}; notes.value=[];noteDraft.value='';notesLoading.value=true;error.value=''; await nextTick(); awardDialog.value?.focus(); try { const {data}=await api.get(`/employee-relations/${row.id}/notes`); if(activeAward.value?.id===row.id) notes.value=data.notes; }catch(e){fail(e);}finally{notesLoading.value=false;} }
function closeAward(){if(!busy.value)activeAward.value=null;}
async function saveAward(){await action(async()=>{await api.patch(`/employee-relations/${activeAward.value.id}`,awardDraft.value);await load();const row=milestones.value.find(r=>r.id===activeAward.value.id);if(row)await openAward(row);message.value='Award saved.';});}
async function addNote(){await action(async()=>{const {data}=await api.post(`/employee-relations/${activeAward.value.id}/notes`,{note:noteDraft.value});notes.value=data.notes;const row=milestones.value.find(r=>r.id===activeAward.value.id);if(row)row.latest_note=noteDraft.value;noteDraft.value='';});}
async function saveDinner(){await action(async()=>{await api.post('/employee-relations/dinners',{...dinnerDraft.value,milestoneIds:selectedIds.value},{params:{agencyId:selectedAgencyId.value}});dinnerOpen.value=false;selectedIds.value=[];await load();message.value='Dinner and invitees saved. Record attendance after the dinner.';});}
async function saveAttendance(dinner,person,attendance){await action(async()=>{await api.patch(`/employee-relations/dinners/${dinner.id}/attendees/${person.milestone_id}`,{attendance},{params:{agencyId:selectedAgencyId.value}});await load();});}
watch(selectedAgencyId,()=>{selectedIds.value=[];activeAward.value=null;dinnerOpen.value=false;message.value='';milestones.value=[];dinners.value=[];load();});
// Memberships can arrive after this component mounts. The global tenant picker
// must also update the roster instead of leaving a second, stale agency selected.
watch(agencyChoices,()=>{if(!selectedAgencyId.value) selectedAgencyId.value=defaultAgencyId();});
watch(()=>agencyStore.currentAgencyId,id=>{
  if (!route.query.agencyId && agencyChoices.value.some(a=>String(a.id)===String(id))) selectedAgencyId.value=String(id);
});
watch(()=>route.query.agencyId,()=>{selectedAgencyId.value=defaultAgencyId();});
onMounted(load);
</script>

<style scoped>
.er-context{margin-bottom:4px}.er-warning{background:#fff7ed;color:#9a3412;padding:12px;border:1px solid #fdba74;border-radius:8px}
.er-root{padding:24px;background:var(--bg,#f9fafb);color:var(--text-primary,#111827);min-height:100vh}h2{font-size:28px;margin:0}h3,h4{margin:0 0 12px}p{line-height:1.5}.er-header,.er-actions,.er-controls,.er-bulk,.er-attendee{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.er-header{justify-content:space-between;align-items:flex-start}.er-header p,.er-help{color:var(--text-secondary,#6b7280);font-size:13px;max-width:920px}.er-actions{margin-bottom:12px}button,input,select,textarea{font:inherit;font-size:13px;border:1px solid var(--border,#d1d5db);border-radius:7px;padding:8px 10px;background:var(--bg-card,#fff);color:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #4f46e5;outline-offset:2px}.primary{background:#1f2937;color:#fff}.er-awards{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.er-award{display:grid;gap:6px;flex:1 1 120px;text-align:left;padding:12px}.er-award[aria-pressed=true]{background:#eef2ff;border-color:#6366f1}.er-controls{margin-bottom:12px}.er-controls>input{flex:1;min-width:210px}.er-check{display:flex;gap:6px;align-items:center}.er-stats{display:flex;gap:24px;flex-wrap:wrap;font-size:13px;margin:16px 0}.er-bulk{background:#eef2ff;padding:12px;margin:12px 0;border-radius:8px}.er-table-wrap{overflow:auto;border:1px solid var(--border,#e5e7eb);border-radius:10px}table{width:100%;border-collapse:collapse;background:var(--bg-card,#fff);font-size:13px}th,td{padding:10px;text-align:left;border-bottom:1px solid var(--border,#e5e7eb);vertical-align:top}th{white-space:nowrap}th button{border:0;background:transparent;font-weight:600}small{display:block;color:var(--text-secondary,#6b7280);font-size:12px;max-width:280px;margin-top:4px;white-space:pre-wrap}.er-link{border:0;padding:0;background:transparent;color:var(--link-color,#4338ca);text-align:left;text-decoration:underline}.er-owed{background:#fffbeb;color:#111827}.er-empty{text-align:center;padding:24px}.er-settings{padding:14px;border:1px solid var(--border,#e5e7eb);border-radius:8px;margin:14px 0;background:var(--bg-card,#fff)}summary{cursor:pointer;font-weight:600}.er-gift-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:18px}.er-gift-grid form{padding:12px;border:1px solid var(--border,#e5e7eb);border-radius:8px}form label{display:grid;gap:5px;margin:12px 0}textarea{min-height:70px;resize:vertical}.er-dinners{margin-top:28px}.er-attendee{justify-content:space-between;max-width:500px;margin:8px 0}.er-error{background:#fef2f2;color:#991b1b;padding:12px;border-radius:8px}.er-success{background:#ecfdf5;color:#065f46;padding:12px;border-radius:8px}.er-overlay{position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px}.er-modal{background:var(--bg-card,#fff);padding:24px;border-radius:12px;max-width:640px;width:100%;max-height:90vh;overflow:auto}.er-history{padding-left:20px}.er-history p{white-space:pre-wrap;margin-bottom:4px}.er-history li{margin:12px 0}@media(max-width:650px){.er-root{padding:14px}.er-overlay{padding:8px}.er-modal{padding:16px}.er-controls>*{width:100%}}
</style>
