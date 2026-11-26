<template>
  <div class="cnd-panel">
    <div class="cnd-header">
      <div>
        <h2 class="cnd-title">Possible name duplicates</h2>
        <p class="cnd-sub">
          Select the charts you want to compare before merging or linking them.
        </p>
      </div>
      <div class="cnd-merge-controls">
        <label v-if="directoryAgency === undefined">Agency
          <select v-model="agencyFilter" :disabled="merging">
            <option :value="null">All agencies</option>
            <option v-for="agency in agencies" :key="agency.id" :value="agency.id">{{ agency.name }}</option>
          </select>
        </label>
        <label class="cnd-include"><input v-model="includeArchived" type="checkbox" :disabled="merging" /> Include archived</label>
      </div>
    </div>

    <div v-if="linkedAgencyCharts.length" class="cnd-merge-review" role="status">
      <p>Linked as the same client. Each agency keeps its own chart. Open either chart to switch agencies from the client profile.</p>
      <div class="cnd-merge-controls">
        <button v-for="chart in linkedAgencyCharts" :key="chart.id" type="button" class="cnd-open" @click="$emit('open-client', chart)">Open {{ chart.agency_name || 'agency' }} chart</button>
      </div>
    </div>
    <p v-if="loading" class="cnd-empty">Scanning names…</p>
    <p v-else-if="error" class="cnd-error">{{ error }}</p>
    <p v-else-if="!groups.length" class="cnd-empty">No unresolved matching names found.</p>

    <div v-else class="cnd-groups">
      <article v-for="group in groups" :key="group.key" class="cnd-group">
        <header class="cnd-group-head">
          <div>
            <strong class="cnd-name">{{ displayName(group) }}</strong>
            <span class="cnd-count">{{ group.memberCount }} records</span>
          </div>
          <span class="cnd-confidence" :class="`cnd-confidence--${group.confidence}`">
            {{ confidenceLabel(group.confidence) }}
          </span>
        </header>
        <table class="cnd-table">
          <thead>
            <tr>
              <th>Compare</th><th>Name</th>
              <th>Initials</th>
              <th>Agency</th>
              <th>School / program</th>
              <th>DOB</th>
              <th>Status</th>
              <th>Provider</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in group.members" :key="member.id">
              <td>
                <input
                  v-if="String(member.status).toUpperCase() !== 'ARCHIVED'"
                  type="checkbox"
                  :aria-label="`Compare chart ${member.id}`"
                  :checked="selectedCharts(group).includes(member)"
                  :disabled="merging || mergeBusy"
                  @change="chooseChart(group, member, $event.target.checked)"
                />
              </td>
              <td>{{ member.full_name || '—' }}</td>
              <td>{{ member.initials || '—' }}</td>
              <td>{{ member.agency_name || '—' }}</td>
              <td>{{ member.organization_name || '—' }}</td>
              <td>{{ formatDob(member.date_of_birth) }}</td>
              <td>{{ member.client_status_label || member.status || '—' }}</td>
              <td>{{ member.provider_name || '—' }}</td>
              <td>
                <button type="button" class="cnd-open" @click="$emit('open-client', member)">Open</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="cnd-merge-controls">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="merging || mergeBusy || selectedCharts(group).length < 2" @click="reviewMerge(group)">{{ isCrossAgency(group) ? 'Review chart link' : 'Review merge' }}</button>
        </div>
        <section v-if="mergeGroupKey === group.key" class="cnd-merge-review" aria-label="Review client merge">
          <p v-if="mergeBusy" role="status">Loading comparison…</p>
          <template v-if="mergePreview?.crossAgency">
            <h3>Link these agency charts</h3>
            <p>Open either chart to switch between agencies you have access to. Each agency keeps its own records, assignments, and portal permissions.</p>
            <ul><li v-for="record in mergePreview.records" :key="record.id">{{ record.agency_name }} · Chart #{{ record.id }}</li></ul>
            <label class="cnd-include"><input v-model="identityConfirmed" type="checkbox" /> I compared the records and confirmed they are the same person.</label>
            <div class="cnd-merge-controls"><button type="button" class="btn btn-secondary btn-sm" :disabled="merging" @click="cancelMerge">Cancel</button><button type="button" class="btn btn-primary btn-sm" :disabled="!identityConfirmed || merging" @click="applyMerge(group)">{{ merging ? 'Linking…' : 'Link agency charts' }}</button></div>
          </template>
          <template v-else-if="mergePreview">
            <h3>Review the combined client record</h3>
            <p>Current school, office, and provider assignments stay with the record you keep. Prior program affiliations remain in its history. Uploaded enrollment documents and guardian links are retained.</p>
            <RecordFieldComparison :sources="comparisonSources(group)" :rows="comparisonRows" :disabled="merging || mergeBusy"
              @choose="(field, id) => fieldChoices[field] = Number(id)">
              <template #source="{ source }">
                <button type="button" class="cnd-open" :disabled="merging || mergeBusy || Number(keepByGroup[group.key]) === Number(source.id)" @click="retainChart(group, source.id)">
                  {{ Number(keepByGroup[group.key]) === Number(source.id) ? 'Chart to keep' : 'Keep this chart' }}
                </button>
              </template>
            </RecordFieldComparison>
            <fieldset v-if="mergePreview.guardianAccessDifferences?.length"><legend>Guardian access differs</legend><p v-for="row in mergePreview.guardianAccessDifferences" :key="`${row.sourceClientId}-${row.guardianUserId}`">{{ row.name }} · Current record: {{ row.currentAccessEnabled ? 'enabled' : 'pending / off' }} · Prior record: {{ row.priorAccessEnabled ? 'enabled' : 'off' }}</p><label><input v-model="keepCurrentGuardianAccess" type="checkbox" /> Retain the current record’s exact guardian access and keep prior permissions in audit history.</label></fieldset>
            <fieldset v-if="priorPrograms.length"><legend>Completed programs</legend><label v-for="program in priorPrograms" :key="program.organization_id"><input v-model="completedOrganizationIds" type="checkbox" :value="Number(program.organization_id)" /> {{ program.organization_name }} — retain as completed</label></fieldset>
            <label class="cnd-include"><input v-model="identityConfirmed" type="checkbox" /> I compared the records and confirmed they are the same person.</label>
            <div class="cnd-merge-controls"><button type="button" class="btn btn-secondary btn-sm" :disabled="merging" @click="cancelMerge">Cancel</button><button type="button" class="btn btn-primary btn-sm" :disabled="!identityConfirmed || (mergePreview.guardianAccessDifferences?.length && !keepCurrentGuardianAccess) || merging || mergeBusy" @click="applyMerge(group)">{{ merging ? 'Merging…' : 'Merge client records' }}</button></div>
          </template>
          <p v-if="mergeError" class="cnd-error" role="alert">{{ mergeError }}</p>
        </section>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import RecordFieldComparison from './clientChart/RecordFieldComparison.vue';

const emit = defineEmits(['open-client', 'merged']);

const groups = ref([]);
const linkedAgencyCharts = ref([]);
const agencies = ref([]);
const props = defineProps({ directoryAgency: String });
const scopedAgency = computed(() => props.directoryAgency === 'all' ? null : (props.directoryAgency || agencyFilter.value));
const agencyFilter = ref(null);
const keepByGroup = reactive({}), fieldChoices = reactive({});
const keepCurrentGuardianAccess=ref(false);
const mergeGroupKey = ref(null), mergePreview = ref(null), mergeError = ref(''), mergeBusy = ref(false), merging = ref(false), identityConfirmed = ref(false), completedOrganizationIds = ref([]);
const priorPrograms = computed(() => [...new Map((mergePreview.value?.affiliations || []).filter(row => ['program','clinical'].includes(String(row.organization_type).toLowerCase()) && !(Number(row.client_id) === Number(mergePreview.value?.keep.id) && Number(row.is_primary) === 1)).map(row => [Number(row.organization_id),row])).values()]);
const comparisonRows = computed(() => (mergePreview.value?.fields || []).map(field => {
  const keepId = mergePreview.value.keep.id;
  return {
    key: field.key,
    label: field.label || field.key,
    values: Object.fromEntries([[keepId, field.keepValue], ...field.otherValues.map(other => [other.id, other.value])]),
    selected: fieldChoices[field.key] ?? field.chosenSourceId ?? keepId
  };
}));
function comparisonSources(group) {
  return [mergePreview.value.keep, ...mergePreview.value.others].map(chart => {
    const member = group.members.find(row => Number(row.id) === Number(chart.id)) || chart;
    const updated = new Date(member.updated_at || member.created_at || '');
    return { id: chart.id, label: `Chart #${chart.id}`,
      detail: [member.organization_name, Number.isFinite(+updated) ? `Updated ${updated.toLocaleDateString()}` : ''].filter(Boolean).join(' · ') };
  });
}
function mostRecentChart(members) {
  const timestamp = row => Date.parse(row.updated_at || row.created_at || '') || 0;
  return [...members].sort((a, b) => timestamp(b) - timestamp(a) || Number(Boolean(b.provider_name)) - Number(Boolean(a.provider_name)) || Number(a.id) - Number(b.id))[0]?.id ?? null;
}
const checkedCharts = reactive({});
const selectedCharts = group => group.members.filter(member => String(member.status).toUpperCase() !== 'ARCHIVED'
  && (checkedCharts[group.key] || []).includes(Number(member.id)));
function isCrossAgency(group) {
  return new Set(selectedCharts(group).map(member => Number(member.agency_id))).size > 1;
}
function chooseChart(group, member, checked) {
  const ids = selectedCharts(group).map(row => Number(row.id)).filter(id => id !== Number(member.id));
  if (checked) ids.push(Number(member.id));
  checkedCharts[group.key] = ids;
  keepByGroup[group.key] = mostRecentChart(group.members.filter(row => ids.includes(Number(row.id))));
  cancelMerge();
}
function cancelMerge() { mergeGroupKey.value=null;mergePreview.value=null;mergeError.value='';identityConfirmed.value=false; }
async function reviewMerge(group) {
  mergeGroupKey.value=group.key;mergeBusy.value=true;mergeError.value='';
  keepCurrentGuardianAccess.value = false;
  mergePreview.value = null;
  identityConfirmed.value = false;
  completedOrganizationIds.value = [];
  Object.keys(fieldChoices).forEach(key => delete fieldChoices[key]);
  try { const {data}=await api.post('/clients/merge/preview',{keepId:Number(keepByGroup[group.key]),sourceIds:selectedCharts(group).map(row => Number(row.id)).filter(id => id!==Number(keepByGroup[group.key])),fieldChoices:{...fieldChoices}},{skipGlobalLoading:true});mergePreview.value=data; }
  catch(e){mergeError.value=e.response?.data?.error?.message || 'Unable to load the merge comparison.';}
  finally{mergeBusy.value=false;}
}
async function retainChart(group, id) {
  keepByGroup[group.key] = Number(id);
  await reviewMerge(group);
}
async function applyMerge(group) {
  if(!identityConfirmed.value || merging.value)return;
  merging.value=true;mergeError.value='';
  try {
    const keepId = Number(keepByGroup[group.key]);
    const crossAgency = mergePreview.value.crossAgency;
    const chartsToLink = crossAgency ? selectedCharts(group) : [];
    const payload = crossAgency
      ? { keepId, sourceIds: mergePreview.value.records.map(row => Number(row.id)).filter(id => id !== keepId), confirmIdentity: true }
      : { keepId, sourceIds: mergePreview.value.others.map(row => row.id), fieldChoices: { ...fieldChoices }, completedOrganizationIds: completedOrganizationIds.value, guardianAccessResolution: keepCurrentGuardianAccess.value ? 'keep_current' : null };
    const { data } = await api.post('/clients/merge', payload, { skipGlobalLoading: true });
    if (crossAgency) {
      if (data?.result?.linked !== true) throw Error('The agency chart link could not be confirmed.');
      linkedAgencyCharts.value = chartsToLink;
    }
    cancelMerge();
    await loadGroups();
    emit('merged');
  }
  catch(e){mergeError.value=e.response?.data?.error?.message || e.message || 'The merge could not finish. Your review is still here.';}
  finally{merging.value=false;}
}
const loading = ref(false);
const error = ref('');
const includeArchived = ref(false);
let scan = 0;

function displayName(group) {
  const fullName = String(group?.members?.[0]?.full_name || '').trim();
  if (fullName) return fullName;
  const first = String(group?.firstName || '');
  const last = String(group?.lastName || '');
  return `${first} ${last}`.trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function confidenceLabel(value) {
  if (value === 'high') return 'Same name + DOB';
  if (value === 'medium') return 'Same name + school';
  return 'Matching full name';
}

function formatDob(value) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  return raw.slice(0, 10);
}

async function loadGroups() {
  const currentScan = ++scan;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/clients/name-duplicates', {
      params: { ...(scopedAgency.value ? { agencyId: scopedAgency.value } : {}), includeArchived: includeArchived.value },
      skipGlobalLoading: true
    });
    if (currentScan !== scan) return;
    agencies.value = res.data?.agencies || [];
    groups.value = Array.isArray(res.data?.groups) ? res.data.groups : [];
    for (const group of groups.value) {
      const active = group.members.filter(row => String(row.status).toUpperCase() !== 'ARCHIVED');
      checkedCharts[group.key] = active.length === 2 ? active.map(row => Number(row.id)) : [];
      keepByGroup[group.key] = mostRecentChart(active);
    }
  } catch (e) {
    if (currentScan !== scan) return;
    groups.value = [];
    error.value = e?.response?.data?.error?.message || 'Could not scan for name duplicates.';
  } finally {
    if (currentScan === scan) loading.value = false;
  }
}

watch([scopedAgency, includeArchived], () => { linkedAgencyCharts.value=[]; cancelMerge(); return loadGroups(); }, { immediate: true });

defineExpose({ loadGroups, groups });
</script>

<style scoped>
.cnd-panel { display: grid; gap: 16px; }
.cnd-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.cnd-title { margin: 0 0 4px; font-size: 1.15rem; }
.cnd-sub { margin: 0; color: var(--text-secondary, #6b7280); font-size: 13px; max-width: 46rem; }
.cnd-include { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary, #4b5563); }
.cnd-empty, .cnd-error { margin: 0; color: var(--text-secondary, #6b7280); }
.cnd-error { color: #b91c1c; }
.cnd-groups { display: grid; gap: 14px; }
.cnd-group {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.cnd-group-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #f8fafc;
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.cnd-name { text-transform: capitalize; }
.cnd-count { margin-left: 8px; color: var(--text-secondary, #6b7280); font-size: 12px; font-weight: 600; }
.cnd-confidence {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  border-radius: 999px;
  padding: 4px 8px;
}
.cnd-confidence--high { background: #fee2e2; color: #991b1b; }
.cnd-confidence--medium { background: #ffedd5; color: #9a3412; }
.cnd-confidence--low { background: #e5e7eb; color: #374151; }
.cnd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.cnd-table th, .cnd-table td { text-align: left; padding: 8px 12px; border-top: 1px solid #f1f5f9; }
.cnd-table th { color: var(--text-secondary, #6b7280); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
.cnd-open {
  border: 0;
  background: transparent;
  color: var(--primary, #2d6a4f);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}
.cnd-merge-controls{display:flex;gap:10px;align-items:center;padding:10px 12px;flex-wrap:wrap}.cnd-merge-controls label{display:flex;align-items:center;gap:8px}.cnd-merge-review{padding:12px;border-top:1px solid #dbe5ef;display:grid;gap:10px}.cnd-merge-review h3,.cnd-merge-review p{margin:0}.cnd-merge-review p{font-size:13px;color:#52647d}.cnd-comparison{overflow:auto;max-height:320px}.cnd-merge-review fieldset{display:grid;gap:8px;border:1px solid #dbe5ef;border-radius:8px}.cnd-merge-review select,.cnd-merge-controls select{max-width:100%;padding:6px;border:1px solid #cdd9e6;border-radius:6px}
</style>
