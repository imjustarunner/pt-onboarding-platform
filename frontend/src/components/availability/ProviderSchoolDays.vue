<template>
  <section class="provider-days" aria-label="Provider Days">
    <header>
      <div><h2>Provider Days</h2><p>Find school coverage across Monday–Friday.</p></div>
      <button v-if="canRequest" type="button" class="btn btn-secondary" @click="showResponses=!showResponses">{{showResponses?'Back to provider days':'Track responses'}}</button>
      <button v-if="!showResponses" type="button" class="btn btn-secondary" :disabled="loading" @click="load">{{ loading ? 'Refreshing…' : 'Refresh providers' }}</button>
    </header>
    <SchoolWeekdayResponseTracker v-if="showResponses&&canRequest" :agency-id="agencyId" />
    <template v-else>
    <p>Green means available for a school, gray shows an assigned school, and red means not available. Providers can update their usual five-day school availability.</p>
    <button v-if="canRequest" type="button" class="btn btn-primary" :disabled="requesting || loading" @click="requestUpdate()">{{ requesting ? 'Requesting…' : 'Request update from all school providers' }}</button>
    <p v-if="requestNotice" role="status">{{ requestNotice }}</p>
    <SchoolWeekdayEditor v-if="editing" :provider-id="editing.id" :agency-id="agencyId" :provider-name="name(editing)" @close="editing = null" @saved="load" />
    <div class="days-toolbar">
      <label>Search providers<input v-model="search" type="search" placeholder="Provider name, title, or school" /></label>
      <button v-if="canRequest" type="button" class="btn btn-secondary" @click="editingFocus = true">Edit service focuses</button>
    </div>
    <p class="muted">Showing non-demo providers with School-Based Counseling in their service focuses. Use Edit service focuses to add another provider.</p>
    <SchoolProviderFocusEditor v-if="editingFocus" :providers="providers" :agency-id="agencyId" @close="editingFocus = false" @saved="load" />
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Try again</button></p>
    <p v-else-if="loading" role="status">Loading provider school days…</p>
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
              <td v-for="day in weekdays" :key="day" :class="{ available: available(person, day), assigned: schoolsOn(person, day).length, unavailable: !available(person, day) && !schoolsOn(person, day).length, selected: selectedDay === day }">
                <button v-if="person.schoolWeekdays?.eligible && canRequest" type="button" class="school-status-button" :aria-label="`Update school availability for ${name(person)} on ${day}`" @click="editing = person"><SchoolAvailabilityIcon /></button>
                <template v-if="schoolsOn(person, day).length"><span v-for="school in schoolsOn(person, day)" :key="school.schoolOrganizationId" class="school-name">{{ school.schoolName }}</span></template>
                <span v-else-if="available(person, day)" class="available-label">Available</span>
                <span v-else>{{ person.schoolWeekdays?.eligible ? 'Not available' : Array.isArray(person.schoolAssignments) ? 'School care off' : 'Not checked' }}</span>
              </td>
              <td><div class="row-actions"><button v-if="canRequest && person.schoolWeekdays?.eligible" type="button" class="btn btn-secondary btn-sm" :disabled="requesting" @click="requestUpdate(person)">Request update</button><router-link class="btn btn-primary btn-sm" :to="messageLink(person)" :aria-label="`Message ${name(person)}`">Message</router-link><router-link class="btn btn-secondary btn-sm" :to="scheduleLink(person)" :aria-label="`View schedule for ${name(person)}`">View schedule</router-link></div></td>
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
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import SchoolProviderFocusEditor from './SchoolProviderFocusEditor.vue';
import SchoolWeekdayResponseTracker from './SchoolWeekdayResponseTracker.vue';
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
async function requestUpdate(person = null) {
  if (requesting.value) return;
  requesting.value = true; requestNotice.value = '';
  try {
    const { data } = await api.post('/availability/admin/school-weekdays/request', { agencyId: props.agencyId, ...(person ? { providerId: person.id } : {}) }, { skipGlobalLoading: true });
    requestNotice.value = `${data.requested.length} update requests sent. ${data.skipped.length} skipped (already answered, fully assigned, already pending, or not eligible).${data.failed.length ? ` ${data.failed.length} failed; retry to send the remaining requests.` : ''}`;
    await load();
  } catch (e) { requestNotice.value = e.response?.data?.error?.message || 'Could not send update requests. Please retry.'; }
  finally { requesting.value = false; }
}
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const providers = ref([]), search = ref(''), selectedDay = ref(''), loading = ref(false), error = ref('');
const name = person => [person.first_name, person.last_name].filter(Boolean).join(' ');
const schoolsOn = (person, day) => (person.schoolAssignments || []).filter(school => school.days?.includes(day));
const available = (person, day) => person.schoolWeekdays ? person.schoolWeekdays.days.some(item => item.day === day && item.status === 'available') : Array.isArray(person.schoolAssignments) && person.preferences?.school !== false && !schoolsOn(person, day).length;
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
  providers.value = []; loading.value = true; error.value = '';
  try {
    const { data } = await api.get('/availability/admin/providers', { params: { agencyId: props.agencyId, includePreferences: true }, skipGlobalLoading: true });
    if (current === generation) providers.value = Array.isArray(data) ? data : [];
  } catch (e) {
    if (current === generation) error.value = e.response?.data?.error?.message || 'Could not load provider school days.';
  } finally { if (current === generation) loading.value = false; }
}
watch(() => props.agencyId, () => { search.value = ''; selectedDay.value = ''; editingFocus.value = false; editing.value = null; requestNotice.value = ''; load(); }, { immediate: true });
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
