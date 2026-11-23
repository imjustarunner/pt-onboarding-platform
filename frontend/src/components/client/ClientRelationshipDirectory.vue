<template>
  <div class="relationship-directory">
    <p v-if="loading" role="status">Loading relationships…</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" class="relationship-link" @click="load">Retry</button></p>
    <template v-if="directory">
      <section v-if="!compact || directory.siblings.length || directory.restrictedSiblings.length || directory.sharedGuardianClients?.length || directory.hasRestrictedSharedGuardianClients">
        <h4>Siblings</h4>
        <p v-if="!directory.siblings.length && !directory.restrictedSiblings.length">No sibling charts linked.</p>
        <ul v-else>
          <li v-for="sibling in directory.siblings" :key="sibling.id">
            <router-link :to="siblingPath(sibling.id)">{{ siblingLabel(sibling) }}</router-link>
            <button v-if="canEdit" type="button" class="relationship-link" :disabled="saving" @click="changeSibling(sibling.id, true)">Unlink</button>
            <small>{{ sibling.providerName || 'No provider assigned' }}</small>
          </li>
          <li v-for="(sibling, index) in directory.restrictedSiblings" :key="'restricted-' + index">
            <strong>{{ siblingLabel(sibling) }}</strong>
            <small>{{ sibling.providerName || 'No provider assigned' }} · Chart access restricted</small>
          </li>
        </ul>
        <div v-if="directory.sharedGuardianClients?.length || directory.hasRestrictedSharedGuardianClients">
          <h5>Clients with a shared guardian</h5>
          <ul>
            <li v-for="related in directory.sharedGuardianClients" :key="related.id">
              <router-link :to="siblingPath(related.id)">{{ siblingLabel(related) }}</router-link>
              <button v-if="canEdit" type="button" class="relationship-link" :disabled="saving" @click="changeSibling(related.id)">Confirm as sibling</button>
            </li>
            <li v-if="directory.hasRestrictedSharedGuardianClients">Client in this agency <small>Chart access restricted</small></li>
          </ul>
        </div>
        <p v-else-if="directory.sharedGuardianClients === null" role="status">Shared guardian charts could not be checked.</p>
        <div v-if="canEdit">
          <button v-if="!showSearch" type="button" class="btn btn-secondary btn-sm" @click="openSearch">Link a sibling</button>
          <div v-else class="relationship-search">
            <p>Confirm the sibling relationship before linking a chart. Each chart keeps its own access permissions.</p>
            <div class="relationship-search-controls">
              <label>Sibling name <input v-model.trim="search" type="search" placeholder="Search by name or initials" @keydown.enter.prevent="findSiblings" /></label>
              <button type="button" class="btn btn-secondary btn-sm" :disabled="searching" @click="findSiblings">Search</button>
              <button type="button" class="relationship-link" @click="closeSearch">Close</button>
            </div>
            <p v-if="searching" role="status">Checking available charts…</p>
            <p v-else-if="!candidates.length">No charts found.</p>
            <ul v-else>
              <li v-for="candidate in candidates" :key="candidate.id">
                <strong>{{ candidate.name }}</strong>
                <small>Chart #{{ candidate.id }}<span v-if="candidate.reason"> · {{ candidate.reason }}</span></small>
                <button type="button" class="relationship-link" :disabled="saving" @click="changeSibling(candidate.id)">Link sibling</button>
              </li>
            </ul>
          </div>
        </div>
      </section>
      <section v-if="!compact || directory.reminders?.some(row => row.email || row.sms || row.smsPending)">
        <h4>Client and guardian reminders</h4>
        <p v-if="directory.reminders === null">Reminder preferences are unavailable.</p>
        <p v-else-if="!directory.reminders.length">No authorized appointment recipients.</p>
        <ul v-else>
          <li v-for="recipient in directory.reminders" :key="recipient.id">
            <strong>{{ recipient.name }}</strong>
            <small>{{ recipient.role === 'client' ? 'Client' : 'Guardian' }} · {{ reminderLabel(recipient) }}</small>
          </li>
        </ul>
      </section>
      <section v-if="directory.releasesUnavailable || (directory.releases && (!compact || directory.releases.length))">
        <h4>Releases of information</h4>
        <p v-if="directory.releasesUnavailable">Release recipients could not be loaded.</p>
        <p v-else-if="!directory.releases.length">No release recipients recorded.</p>
        <ul v-else>
          <li v-for="recipient in directory.releases" :key="recipient.id">
            <strong>{{ recipient.name }}</strong>
            <small>{{ recipient.kind }} · {{ recipient.status }}<span v-if="recipient.at"> · {{ portalCalendarDate(recipient.at) }}</span></small>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { portalCalendarDate } from '../../utils/portalDates';

const props = defineProps({ clientId: { type: [Number, String], required: true }, agencyId: [Number, String], labelMode: String, compact: Boolean });
const siblingLabel = sibling => {
  if (props.labelMode === 'initials') return sibling.initials || 'Client';
  if (props.labelMode === 'codes') return sibling.code || sibling.initials || 'Client';
  return sibling.name;
};
const route = useRoute();
const siblingPath = id => route.params.organizationSlug
  ? { name:'OrganizationClientProfile', params:{ organizationSlug:route.params.organizationSlug, clientId:id }, query:{ tab:'relationships' } }
  : { name:'ClientProfile', params:{ clientId:id }, query:{ tab:'relationships' } };
const url = computed(() => '/clients/' + props.clientId + '/relationships');
const options = computed(() => ({ skipGlobalLoading: true, ...(props.agencyId ? { headers:{ 'X-Agency-Id':String(props.agencyId) } } : {}) }));
const directory = ref(null), error = ref(''), loading = ref(false), saving = ref(false);
const showSearch = ref(false), search = ref(''), candidates = ref([]), searching = ref(false);
const canEdit = computed(() => !props.compact && directory.value?.canEdit);
let version = 0, searchVersion = 0;
const message = (exception, fallback) => exception.response?.data?.error?.message || fallback;
const reminderLabel = row => [
  row.email && 'Email enabled',
  row.sms && 'Text enabled',
  row.smsPending && 'Text consent pending'
].filter(Boolean).join(' · ') || 'Email and text off';

async function load() {
  const current = ++version;
  error.value = '';
  loading.value = true;
  try {
    const { data } = await api.get(url.value, options.value);
    if (current === version) directory.value = {
      ...data,
      siblings: Array.isArray(data.siblings) ? data.siblings : [],
      restrictedSiblings: Array.isArray(data.restrictedSiblings) ? data.restrictedSiblings : [],
      reminders: Array.isArray(data.reminders) ? data.reminders : null
    };
  } catch (exception) {
    if (current === version) error.value = message(exception, 'Relationships could not be loaded.');
  } finally {
    if (current === version) loading.value = false;
  }
}
function closeSearch() {
  searchVersion++;
  showSearch.value = false;
  search.value = '';
  candidates.value = [];
  searching.value = false;
}
function openSearch() {
  showSearch.value = true;
  findSiblings();
}
async function findSiblings() {
  const current = ++searchVersion;
  error.value = '';
  searching.value = true;
  try {
    const { data } = await api.get(url.value, { ...options.value, params:{ search:search.value } });
    if (current === searchVersion) candidates.value = Array.isArray(data.candidates) ? data.candidates : [];
  } catch (exception) {
    if (current === searchVersion) {
      candidates.value = [];
      error.value = message(exception, 'Sibling charts could not be loaded.');
    }
  } finally {
    if (current === searchVersion) searching.value = false;
  }
}
async function changeSibling(id, remove = false) {
  const current = version;
  const path = url.value + '/siblings/' + id;
  saving.value = true;
  error.value = '';
  try {
    if (remove) await api.delete(path, options.value);
    else await api.put(path, {}, options.value);
    if (current === version) {
      candidates.value = candidates.value.filter(row => row.id !== id);
      await load();
    }
  } catch (exception) {
    if (current === version) error.value = message(exception, 'The sibling link could not be saved.');
  } finally {
    saving.value = false;
  }
}
watch(() => [props.clientId, props.agencyId], () => {
  directory.value = null;
  closeSearch();
  load();
}, { immediate:true });
onUnmounted(() => { version++; searchVersion++; });
</script>

<style scoped>
.relationship-directory { display: grid; gap: 1rem; }
.relationship-directory section + section { border-top: 1px solid var(--border, #dbe4dd); padding-top: .85rem; }
.relationship-directory h4 { margin: 0 0 .4rem; }
.relationship-directory h5 { margin: .7rem 0 .4rem; font-size: .9em; }
.relationship-directory p { margin: .35rem 0; }
.relationship-directory ul { display: grid; gap: .5rem; margin: .5rem 0; padding-left: 1.15rem; }
.relationship-directory small { display: block; color: var(--text-secondary, #515f59); }
.relationship-link { padding: 0; color: var(--primary, #216146); background: none; border: none; text-decoration: underline; font: inherit; cursor: pointer; }
li .relationship-link { margin-left: .65rem; }
.relationship-search { margin: .9rem 0; }
.relationship-search-controls { display: flex; align-items: end; gap: .55rem; flex-wrap: wrap; }
.relationship-search-controls label { display: grid; gap: .25rem; }
.relationship-search-controls input { padding: .4rem .55rem; border: 1px solid #c8d4cd; border-radius: .4rem; }
</style>
