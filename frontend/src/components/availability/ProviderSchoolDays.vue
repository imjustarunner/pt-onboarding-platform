<template>
  <section class="provider-days" aria-label="Provider Days">
    <header>
      <div><h2>Provider Days</h2><p>Find school coverage across Monday–Friday.</p></div>
      <button v-if="canRequest" type="button" class="btn btn-secondary" @click="showResponses=!showResponses">{{showResponses?'Back to provider days':'Track responses'}}</button>
      <button v-if="!showResponses" type="button" class="btn btn-secondary" :disabled="loading" @click="load">{{ loading ? 'Refreshing…' : 'Refresh providers' }}</button>
    </header>
    <SchoolWeekdayResponseTracker v-if="showResponses&&canRequest" :agency-id="agencyId" />
    <template v-else>
    <p>Green means saved as available for a school, gray shows an assigned school, red means not available, and yellow needs confirmation. Providers can update their usual five-day school availability.</p>
    <p v-if="canRequest && responseCounts" class="response-summary">{{ responseCounts.completed }} complete · {{ responseCounts.opened }} opened and unfinished · {{ responseCounts.pending }} pending. <button type="button" class="btn btn-secondary btn-sm" @click="showResponses=true">View delivery and responses</button></p>
    <p v-if="canRequest" class="muted">Request update saves an in-app prompt. Enabled email follow-ups run automatically. Existing emails are not resent by repeated clicks; providers who have accounted for all five weekdays need no update.</p>
    <button v-if="canRequest" type="button" class="btn btn-primary" :disabled="requesting || loading" @click="requestUpdate()">{{ requesting ? 'Requesting…' : 'Request update from all school providers' }}</button>
    <p v-if="requestNotice" ref="noticeElement" role="status" tabindex="-1">{{ requestNotice }}</p>
    <p v-if="progressError" role="alert">{{ progressError }} <button type="button" @click="loadProgress">Refresh delivery status</button></p>
    <SchoolWeekdayEditor v-if="editing" :provider-id="editing.id" :agency-id="agencyId" :provider-name="name(editing)" @close="editing = null" @saved="load" />
    <div class="days-toolbar">
      <label>Search providers<input v-model="search" type="search" placeholder="Provider name, title, or school" /></label>
      <button v-if="canRequest" type="button" class="btn btn-secondary" @click="editingFocus = true">Edit service focuses</button>
    </div>
    <p class="muted">Showing non-demo providers with School-Based Counseling in their service focuses. Use Edit service focuses to add another provider.</p>
    <SchoolProviderFocusEditor v-if="editingFocus" :providers="providers" :agency-id="agencyId" @close="editingFocus = false" @saved="load" />
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Try again</button></p>
    <p v-else-if="loading && !providers.length" role="status">Loading provider school days…</p>
    <template v-else>
      <SchoolDayBar v-model="selectedDay" :days="dayCounts" />
      <div class="days-filter"><button type="button" class="btn btn-secondary" :aria-pressed="!selectedDay" @click="selectedDay = ''">All provider days</button><strong>{{ selectedDay ? `Available ${selectedDay}` : 'Monday–Friday overview' }}</strong><span role="status">{{ filtered.length }} {{ filtered.length === 1 ? 'provider' : 'providers' }}</span></div>
      <div class="days-table-wrap">
        <table>
          <caption class="sr-only">Provider school assignments and available weekdays</caption>
          <thead><tr><th scope="col">Provider</th><th v-for="day in weekdays" :key="day" scope="col">{{ day }}</th><th scope="col">Contact &amp; schedule</th></tr></thead>
          <tbody>
            <tr v-for="person in filtered" :key="person.id">
              <th scope="row"><strong><SchoolAvailabilityIcon v-if="person.schoolWeekdays?.eligible" /> {{ name(person) }}</strong><small>{{ person.title || 'Provider' }}</small><small v-if="person.preferences?.school === false">School-based care is off</small><small v-if="!person.schoolAssignments?.length">No school assignments</small></th>
              <td v-for="day in weekdays" :key="day" :class="{ available: available(person, day), assigned: schoolsOn(person, day).length, unavailable: !available(person, day) && !schoolsOn(person, day).length && !needsConfirmation(person,day), unconfirmed:needsConfirmation(person,day), selected: selectedDay === day }">
                <button v-if="person.schoolWeekdays?.eligible && canRequest" type="button" class="school-status-button" :aria-label="`Update school availability for ${name(person)} on ${day}`" @click="editing = person"><SchoolAvailabilityIcon /></button>
                <template v-if="schoolsOn(person, day).length"><span v-for="school in schoolsOn(person, day)" :key="school.schoolOrganizationId" class="school-name">{{ school.schoolName }}</span></template>
                <span v-else-if="available(person, day)" class="available-label">Available</span>
                <span v-else-if="needsConfirmation(person,day)">Needs confirmation</span>
                <span v-else>{{ person.schoolWeekdays?.eligible ? 'Not available' : Array.isArray(person.schoolAssignments) ? 'School care off' : 'Not checked' }}</span>
              </td>
              <td><div class="row-actions"><button v-if="canRequest && person.schoolWeekdays?.eligible" type="button" class="btn btn-secondary btn-sm" :disabled="requesting" :aria-label="`Request update from ${name(person)}`" @click="requestUpdate(person)">{{ requestingTarget===person.id ? 'Requesting…' : 'Request update' }}</button><router-link class="btn btn-primary btn-sm" :to="messageLink(person)" :aria-label="`Message ${name(person)}`">Message</router-link><router-link class="btn btn-secondary btn-sm" :to="scheduleLink(person)" :aria-label="`View schedule for ${name(person)}`">View schedule</router-link></div><SchoolWeekdayRequestReceipt v-if="canRequest" :progress="progressById[person.id]" :outcome="outcomesById[person.id]" :requesting="requestingTarget===person.id" /><SchoolWeekdayCompletionEvidence v-if="canRequest && progressById[person.id]" :progress="progressById[person.id]" /><SchoolWeekdayReminderButton v-if="canRequest && progressById[person.id]" :agency-id="agencyId" :provider-id="person.id" :provider-name="name(person)" :progress="progressById[person.id]" @queued="reminderQueued(person)" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!filtered.length" class="empty">{{ selectedDay ? `No matching providers are available ${selectedDay}.` : 'No providers match these filters.' }}</p>
    </template>
    </template>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import SchoolProviderFocusEditor from './SchoolProviderFocusEditor.vue';
import SchoolWeekdayResponseTracker from './SchoolWeekdayResponseTracker.vue';
import SchoolWeekdayRequestReceipt from './SchoolWeekdayRequestReceipt.vue';
import SchoolWeekdayReminderButton from './SchoolWeekdayReminderButton.vue';
import SchoolWeekdayCompletionEvidence from './SchoolWeekdayCompletionEvidence.vue';
import { useAuthStore } from '../../store/auth';
import SchoolAvailabilityIcon from './SchoolAvailabilityIcon.vue';
import SchoolWeekdayEditor from './SchoolWeekdayEditor.vue';
import SchoolDayBar from '../school/redesign/SchoolDayBar.vue';

const props = defineProps({ agencyId: { type: Number, required: true }, organizationSlug: { type: String, default: null } });
const route = useRoute();
const showResponses=ref(route.query?.responses==='1');
const auth = useAuthStore();
const canRequest = computed(() => ['admin','super_admin','staff','support'].includes(auth.user?.role));
const editingFocus = ref(false);
const editing = ref(null), requesting = ref(false), requestNotice = ref('');
const requestingTarget = ref(null), noticeElement = ref(null), outcomesById = ref({});
const progressById = ref({}), responseCounts = ref(null), progressError = ref('');
let requestGeneration = 0, progressGeneration = 0, progressTimer, lastProgressAt=0;
async function loadProgress() {
  if (!canRequest.value) return;
  const current = ++progressGeneration;
  try {
    const { data } = await api.get('/availability/admin/school-weekdays/progress', { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
    if (current !== progressGeneration) return;
    progressById.value = Object.fromEntries((data.providers || []).map(person => [person.providerId, person]));
    responseCounts.value = data.counts || null; progressError.value = ''; lastProgressAt=Date.now();
  } catch (e) { if (current === progressGeneration) progressError.value = e.response?.data?.error?.message || 'Delivery status could not be refreshed. Last known status is shown; use Track responses before retrying.'; }
}
async function requestUpdate(person = null) {
  if (requesting.value) return;
  const current = ++requestGeneration;
  requestingTarget.value = person?.id || 'all';
  requesting.value = true; requestNotice.value = '';
  try {
    const { data } = await api.post('/availability/admin/school-weekdays/request', { agencyId: props.agencyId, ...(person ? { providerId: person.id } : {}) }, { skipGlobalLoading: true });
    if (current !== requestGeneration) return;
    const outcomes = data.outcomes || [...data.requested.map(providerId => ({ providerId, outcome: 'requested' })), ...data.skipped.map(providerId => ({ providerId, outcome: 'skipped', reason: 'already_pending' })), ...data.failed.map(providerId => ({ providerId, outcome: 'failed' }))];
    for (const outcome of outcomes) outcomesById.value[outcome.providerId] = outcome;
    requestNotice.value = `${data.requested.length} in-app update requests saved. ${data.skipped.length} needed no new request (complete, already pending, or not eligible).${data.failed.length ? ` ${data.failed.length} failed; check each provider’s status before retrying.` : ''} Email delivery is shown beside each provider and in Track responses.`;
    await loadProgress();
    if (current === requestGeneration && !person) { await nextTick(); noticeElement.value?.focus(); }
  } catch (e) {
    if (current !== requestGeneration) return;
    requestNotice.value = e.response?.data?.error?.message || 'Could not confirm update requests. Check delivery status before retrying.';
    if (person) outcomesById.value[person.id] = { providerId: person.id, outcome: 'failed' };
  }
  finally { if (current === requestGeneration) { requesting.value = false; requestingTarget.value = null; } }
}
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const providers = ref([]), search = ref(''), selectedDay = ref(''), loading = ref(false), error = ref('');
const name = person => [person.first_name, person.last_name].filter(Boolean).join(' ');
const schoolsOn = (person, day) => (person.schoolAssignments || []).filter(school => school.days?.includes(day));
const needsConfirmation = (person,day) => !schoolsOn(person,day).length && (progressById.value[person.id]?.reconfirmationPending || person.schoolWeekdays?.days.some(item=>item.day===day&&item.status==='unconfirmed'));
const reminderQueued = async person => { requestNotice.value=`${name(person)}’s email request is recorded. Delivery status is shown beside the provider and in Track responses.`; if(progressById.value[person.id]?.status==='completed')selectedDay.value=''; await loadProgress(); };
const available = (person, day) => needsConfirmation(person,day) ? false : person.schoolWeekdays ? person.schoolWeekdays.days.some(item => item.day === day && item.status === 'available') : Array.isArray(person.schoolAssignments) && person.preferences?.school !== false && !schoolsOn(person, day).length;
const searchable = computed(() => providers.value.filter(person => {
  if (person.schoolRosterExcluded || [true,1,'1'].includes(person.is_demo) || !person.schoolWeekdays?.eligible) return false;
  const text = [name(person), person.title, ...(person.schoolAssignments || []).map(school => school.schoolName)].join(' ').toLowerCase();
  return text.includes(search.value.trim().toLowerCase());
}));
const filtered = computed(() => searchable.value.filter(person => !selectedDay.value || available(person, selectedDay.value)));
const dayCounts = computed(() => weekdays.map(weekday => ({ weekday, has_providers: true, availability_count: searchable.value.filter(person => available(person, weekday)).length })));
const prefix = computed(() => {
  // SchoolCareBridge partner workspaces share the agency's existing schedule and chat routes.
  const slug = props.organizationSlug !== null ? props.organizationSlug : route.params.organizationSlug || route.params.partnerSlug;
  return slug ? `/${encodeURIComponent(slug)}` : '';
});
const messageLink = person => ({ path: `${prefix.value}/messages`, query: { view: 'workspace', tab: 'dms', agencyId: String(props.agencyId), openChatWith: String(person.id), openChatWithName: name(person) } });
const scheduleLink = person => ({ path: `${prefix.value}/dashboard`, query: { tab: 'my_schedule', agencyId: String(props.agencyId), scheduleViewAs: String(person.id) } });
let generation = 0;
async function load() {
  const current = ++generation;
  loading.value = true; error.value = '';
  const delivery = loadProgress();
  try {
    const { data } = await api.get('/availability/admin/providers', { params: { agencyId: props.agencyId, includePreferences: true }, skipGlobalLoading: true });
    if (current === generation) providers.value = Array.isArray(data) ? data : [];
  } catch (e) {
    if (current === generation) error.value = e.response?.data?.error?.message || 'Could not load provider school days.';
  } finally { if (current === generation) loading.value = false; }
  await delivery;
}
watch(() => props.agencyId, () => { ++requestGeneration; ++progressGeneration; providers.value=[]; progressById.value={}; outcomesById.value={}; responseCounts.value=null; progressError.value=''; requesting.value=false; requestingTarget.value=null; search.value = ''; selectedDay.value = ''; editingFocus.value = false; editing.value = null; requestNotice.value = ''; load(); }, { immediate: true });
onMounted(() => { progressTimer=setInterval(() => { if (document.visibilityState!=='hidden' && !showResponses.value && (Date.now()-lastProgressAt>=30000 || Object.values(progressById.value).some(person=>['pending','sending'].includes(person.reminder?.status)))) loadProgress(); },5000); });
onBeforeUnmount(() => { ++generation; ++requestGeneration; ++progressGeneration; clearInterval(progressTimer); });
</script>

<style scoped>
.provider-days { color: var(--text-primary, #183b32); }
header,.days-toolbar,.days-filter,.row-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
header { justify-content:space-between; }
h2 { margin:0; } p { line-height:1.5; }
.days-toolbar { margin:20px 0 10px; align-items:flex-end; }
label { display:grid; gap:6px; font-weight:600; flex:1; min-width:200px; }
input { padding:10px 12px; border:1px solid var(--border, #cedbd5); border-radius:8px; font:inherit; }
.days-filter { margin:14px 0; }
.days-table-wrap { overflow-x:auto; }
table { width:100%; border-collapse:collapse; min-width:850px; font-size:14px; }
th,td { text-align:left; padding:14px 10px; border-bottom:1px solid var(--border, #dce5df); vertical-align:top; }
thead th { background:var(--bg, #f4f8f5); }
tbody th { min-width:160px; }
small,.school-name { display:block; margin-top:4px; }
small,.muted { color:var(--text-secondary, #5b7066); }
.available { background:rgba(16,185,129,.07); }
.assigned { background:#f1f5f9; color:#64748b; }
.unconfirmed { background:#fffbea; color:#854d0e; }
.unavailable { background:#fff1f2; color:#b91c1c; }
.school-status-button { display:inline-flex; border:0; border-radius:5px; background:transparent; color:inherit; padding:3px; cursor:pointer; }
.available-label { color:#176745; font-weight:700; }
.selected { box-shadow:inset 2px 0 rgba(79,70,229,.3); }
.row-actions { min-width:130px; gap:8px; }
.empty { padding:20px 0; }
.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }
@media(max-width:600px) {
  .days-toolbar>button { width:100%; }
  header { align-items:flex-start; }
  :deep(.day-bar) { grid-template-columns:repeat(5,minmax(0,1fr)); gap:6px; }
  :deep(.day) { min-width:0; padding:12px 3px; }
  :deep(.count) { font-size:10px; }
}
</style>
