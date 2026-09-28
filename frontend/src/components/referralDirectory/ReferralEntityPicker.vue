<template>
  <section class="referral-picker">
    <label>Referred by / referral directory
      <input v-model="search" type="search" placeholder="Search referring company or practice" @input="load" />
    </label>
    <select :value="modelValue || ''" aria-label="Referral directory entry" @change="$emit('update:modelValue', Number($event.target.value) || null)">
      <option value="">Select directory entry…</option>
      <option v-for="entry in entries" :key="entry.id" :value="entry.id">{{ entry.name }}{{ entry.address ? ' — ' + entry.address : '' }}</option>
    </select>
    <button type="button" class="btn btn-secondary btn-sm" @click="showLookup = !showLookup">Find or add a referring organization</button>
    <div v-if="showLookup" class="lookup">
      <p>Search public business information using only the practice name and city/state.</p>
      <label>Business name <input v-model="businessName" maxlength="200" placeholder="Alliance Family Practice" /></label>
      <label>City / state <input v-model="location" maxlength="120" placeholder="Colorado Springs, CO" /></label>
      <button type="button" class="btn btn-secondary" :disabled="busy || !businessName.trim() || !location.trim()" @click="lookup">{{ busy ? 'Searching…' : 'Look up business' }}</button>
      <p v-if="warning" role="status">{{ warning }}</p>
      <article v-for="(candidate, index) in candidates" :key="index">
        <strong>{{ candidate.name }}</strong><p>{{ candidate.address }}</p>
        <p>{{ candidate.phone }} <span v-if="candidate.fax">· Fax {{ candidate.fax }}</span></p>
        <a v-if="safeUrl(candidate.source_url)" :href="candidate.source_url" target="_blank" rel="noopener noreferrer">View public source</a>
        <button type="button" class="btn btn-secondary btn-sm" @click="editCandidate(candidate)">Review directory details</button>
      </article>
      <button type="button" class="btn btn-secondary btn-sm" @click="editCandidate({ name: businessName })">Enter details manually</button>
      <div v-if="draft" class="draft">
        <label v-for="field in editable" :key="field.key">{{ field.label }}<input v-model="draft[field.key]" :type="field.key.includes('url') || field.key === 'website' ? 'url' : 'text'" :maxlength="field.max" /></label>
        <p v-if="!isAdmin">A directory administrator must approve a new organization before it can be linked.</p>
        <button type="button" class="btn btn-primary btn-sm" :disabled="busy || !draft.name?.trim()" @click="save">{{ isAdmin ? 'Save to directory and select' : 'Propose directory entry' }}</button>
      </div>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
const props = defineProps({ agencyId: [Number, String], modelValue: [Number, String] });
const emit = defineEmits(['update:modelValue']);
const auth = useAuthStore();
const isAdmin = computed(() => ['super_admin', 'admin'].includes(auth.user?.role));
const entries = ref([]), search = ref(''), error = ref(''), busy = ref(false), showLookup = ref(false);
const businessName = ref(''), location = ref(''), candidates = ref([]), warning = ref(''), draft = ref(null);
const editable = [{ key: 'name', label: 'Directory name', max: 200 }, { key: 'organization_name', label: 'Organization', max: 200 }, { key: 'phone', label: 'Phone', max: 40 }, { key: 'fax', label: 'Fax', max: 40 }, { key: 'email', label: 'Email', max: 200 }, { key: 'address', label: 'Address', max: 400 }, { key: 'website', label: 'Website', max: 300 }, { key: 'source_url', label: 'Public source URL', max: 500 }];
const safeUrl = value => /^https?:\/\//i.test(value || '');
let sequence = 0;
async function load() {
  const current = ++sequence;
  if (!props.agencyId) { entries.value = []; return; }
  try {
    const { data } = await api.get('/client-referral-links/directory', { params: { agencyId: props.agencyId, search: search.value } });
    if (current === sequence) entries.value = data.entries || [];
  } catch { if (current === sequence) error.value = 'Unable to load the referral directory.'; }
}
async function lookup() {
  busy.value = true; error.value = ''; candidates.value = [];
  try {
    const { data } = await api.post('/client-referral-links/business-lookup', { name: businessName.value, location: location.value }, { params: { agencyId: props.agencyId } });
    candidates.value = data.candidates || []; warning.value = data.warning || (candidates.value.length ? '' : 'No matching businesses found.');
  } catch (e) { error.value = e.response?.data?.error?.message || 'Lookup unavailable.'; }
  finally { busy.value = false; }
}
function editCandidate(candidate) { draft.value = Object.fromEntries(editable.map(f => [f.key, candidate[f.key] || ''])); }
async function save() {
  busy.value = true; error.value = '';
  try {
    const { data } = await api.post('/referral-directory/entries', { ...draft.value, agencyId: Number(props.agencyId) });
    const id = data.entry?.id;
    if (id) { search.value = ''; await load(); emit('update:modelValue', id); draft.value = null; showLookup.value = false; }
    else { warning.value = 'Directory entry submitted for administrator approval. Select an approved entry after review.'; draft.value = null; }
  } catch (e) { error.value = e.response?.data?.error?.message || 'Could not save directory entry.'; }
  finally { busy.value = false; }
}
watch(() => props.agencyId, () => { emit('update:modelValue', null); entries.value = []; candidates.value = []; draft.value = null; load(); }, { immediate: true });
</script>
<style scoped>
.referral-picker,.lookup,.draft { display:grid; gap:10px; } label { display:grid; gap:4px; } input,select { width:100%; padding:8px; border:1px solid var(--border-color,#ccc); border-radius:6px; background:var(--bg-primary,#fff); color:var(--text-primary,#222); } .lookup,article { padding:12px; border:1px solid var(--border-color,#ddd); border-radius:8px; } p { margin:4px 0; } article button { margin:8px; }
</style>
