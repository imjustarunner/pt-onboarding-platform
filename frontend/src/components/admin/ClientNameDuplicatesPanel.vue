<template>
  <div class="cnd-panel">
    <div class="cnd-header">
      <div>
        <h2 class="cnd-title">Possible name duplicates</h2>
        <p class="cnd-sub">
          Compare the records, keep the current school or office record, and retain completed program history.
        </p>
      </div>
      <label class="cnd-include">
        <input v-model="includeArchived" type="checkbox" @change="loadGroups" />
        Include archived
      </label>
    </div>

    <p v-if="!agencyId" class="cnd-empty">Pick a tenant to review matching full names.</p>
    <p v-else-if="loading" class="cnd-empty">Scanning names…</p>
    <p v-else-if="error" class="cnd-error">{{ error }}</p>
    <p v-else-if="!groups.length" class="cnd-empty">No matching full names found for this tenant.</p>

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
              <th>Name</th>
              <th>Initials</th>
              <th>School</th>
              <th>DOB</th>
              <th>Status</th>
              <th>Provider</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in group.members" :key="member.id">
              <td>{{ member.full_name || '—' }}</td>
              <td>{{ member.initials || '—' }}</td>
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
          <label>Keep current record <select v-model="keepByGroup[group.key]" :disabled="merging || mergeBusy" @change="cancelMerge"><option v-for="member in group.members" :key="member.id" :value="member.id">{{ member.organization_name || 'Office' }} · {{ member.provider_name || member.full_name }} · {{ member.client_status_label || member.status }}</option></select></label>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="merging || group.members.some(m => m.status === 'ARCHIVED')" @click="reviewMerge(group)">Review merge</button>
        </div>
        <section v-if="mergeGroupKey === group.key" class="cnd-merge-review" aria-label="Review client merge">
          <p v-if="mergeBusy" role="status">Loading comparison…</p>
          <template v-if="mergePreview">
            <h3>Review the combined client record</h3>
            <p>Current school, office, and provider assignments stay with the record you keep. Prior program affiliations remain in its history. Uploaded enrollment documents and guardian links are retained.</p>
            <div class="cnd-comparison"><table class="cnd-table"><thead><tr><th>Field</th><th>Value to keep</th></tr></thead><tbody><tr v-for="field in mergePreview.fields" :key="field.key"><td>{{ field.label || field.key }}</td><td><select :value="fieldSource(field)" @change="chooseField(group,field.key,$event.target.value)"><option :value="mergePreview.keep.id">{{ displayValue(field.keepValue) }} · Current record</option><option v-for="other in field.otherValues" :key="other.id" :value="other.id">{{ displayValue(other.value) }} · Prior record</option></select></td></tr></tbody></table></div>
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

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

const emit = defineEmits(['open-client', 'merged']);

const groups = ref([]);
const keepByGroup = reactive({}), fieldChoices = reactive({});
const keepCurrentGuardianAccess=ref(false);
const mergeGroupKey = ref(null), mergePreview = ref(null), mergeError = ref(''), mergeBusy = ref(false), merging = ref(false), identityConfirmed = ref(false), completedOrganizationIds = ref([]);
const priorPrograms = computed(() => [...new Map((mergePreview.value?.affiliations || []).filter(row => ['program','clinical'].includes(String(row.organization_type).toLowerCase()) && !(Number(row.client_id) === Number(mergePreview.value?.keep.id) && Number(row.is_primary) === 1)).map(row => [Number(row.organization_id),row])).values()]);
function fieldSource(field) { return fieldChoices[field.key] || (JSON.stringify(field.chosenValue) === JSON.stringify(field.keepValue) ? mergePreview.value.keep.id : field.otherValues.find(row => JSON.stringify(row.value) === JSON.stringify(field.chosenValue))?.id) || mergePreview.value.keep.id; }
function displayValue(value) { return value === null || value === undefined || value === '' ? 'Not recorded' : String(value); }
function cancelMerge() { mergeGroupKey.value=null;mergePreview.value=null;mergeError.value='';identityConfirmed.value=false; }
async function reviewMerge(group, reset=true) {
  mergeGroupKey.value=group.key;mergeBusy.value=true;mergeError.value='';
  if(reset){keepCurrentGuardianAccess.value=false;mergePreview.value=null;identityConfirmed.value=false;completedOrganizationIds.value=[];Object.keys(fieldChoices).forEach(key => delete fieldChoices[key]);}
  try { const {data}=await api.post('/clients/merge/preview',{keepId:Number(keepByGroup[group.key]),sourceIds:group.members.map(row => Number(row.id)).filter(id => id!==Number(keepByGroup[group.key])),fieldChoices:{...fieldChoices}},{skipGlobalLoading:true});mergePreview.value=data; }
  catch(e){mergeError.value=e.response?.data?.error?.message || 'Unable to load the merge comparison.';}
  finally{mergeBusy.value=false;}
}
async function chooseField(group,key,id){fieldChoices[key]=Number(id);await reviewMerge(group,false);}
async function applyMerge(group) {
  if(!identityConfirmed.value || merging.value)return;
  merging.value=true;mergeError.value='';
  try {await api.post('/clients/merge',{keepId:Number(mergePreview.value.keep.id),sourceIds:mergePreview.value.others.map(row => row.id),fieldChoices:{...fieldChoices},completedOrganizationIds:completedOrganizationIds.value,guardianAccessResolution:keepCurrentGuardianAccess.value?'keep_current':null},{skipGlobalLoading:true});cancelMerge();await loadGroups();emit('merged');}
  catch(e){mergeError.value=e.response?.data?.error?.message || 'The merge could not finish. Your review is still here.';}
  finally{merging.value=false;}
}
const loading = ref(false);
const error = ref('');
const includeArchived = ref(false);

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
  const aid = Number(props.agencyId);
  if (!Number.isFinite(aid) || aid <= 0) {
    groups.value = [];
    error.value = '';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/clients/name-duplicates', {
      params: { agencyId: aid, includeArchived: includeArchived.value },
      skipGlobalLoading: true
    });
    groups.value = Array.isArray(res.data?.groups) ? res.data.groups : [];
    for(const group of groups.value){keepByGroup[group.key]=group.members.find(row => row.provider_name && !String(row.organization_name || '').toLowerCase().includes('summer'))?.id || group.members[0]?.id;}
  } catch (e) {
    groups.value = [];
    error.value = e?.response?.data?.error?.message || 'Could not scan for name duplicates.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.agencyId, () => {cancelMerge();return loadGroups();}, { immediate: true });

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
