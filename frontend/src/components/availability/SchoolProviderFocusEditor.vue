<script setup>
import { computed, ref } from 'vue';
import api from '../../services/api';
import ContractServiceFocusSelect from '../hiring/ContractServiceFocusSelect.vue';
import { SERVICE_FOCUS_CATEGORIES } from '../../constants/serviceFocusCategories.js';
const props = defineProps({ providers: { type: Array, required: true }, agencyId: { type: Number, required: true } });
const emit = defineEmits(['close', 'saved']);
const search = ref(''), selected = ref(null), focus = ref(''), busy = ref(false), error = ref(''), notice = ref('');
const name = person => [person.first_name,person.last_name].filter(Boolean).join(' ');
const people = computed(() => props.providers.filter(person => ![true,1,'1'].includes(person.is_demo) && !person.schoolRosterExcluded && name(person).toLowerCase().includes(search.value.trim().toLowerCase())));
function choose(person) { selected.value = person; focus.value = person.service_focus || ''; error.value = ''; notice.value = ''; }
function addSchool() {
  const values = focus.value.split(/[;,\n]/).map(value => value.trim()).filter(Boolean);
  if (!values.some(value => /^school[ -]based(?: counseling)?$/i.test(value))) values.push('School-Based Counseling');
  focus.value = values.join('; ');
}
async function save() {
  if (busy.value || !selected.value) return;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const { data } = await api.put(`/availability/providers/${selected.value.id}/school-service-focus`, { agencyId: props.agencyId, serviceFocus: focus.value, expectedServiceFocus: selected.value.service_focus || '' }, { skipGlobalLoading: true });
    selected.value = { ...selected.value, service_focus: data.serviceFocus }; focus.value = data.serviceFocus;
    notice.value = `Service focuses saved for ${name(selected.value)}.`; emit('saved');
  } catch (e) { error.value = e.response?.data?.error?.message || 'Could not save service focuses. Please retry.'; }
  finally { busy.value = false; }
}
</script>
<template>
  <Teleport to="body">
    <div class="focus-backdrop" @click.self="!busy && emit('close')" @keydown.esc="!busy && emit('close')">
      <section class="focus-dialog" role="dialog" aria-modal="true" aria-labelledby="school-focus-title">
        <header><h2 id="school-focus-title">Edit service focuses</h2><button type="button" :disabled="busy" @click="emit('close')">Close</button></header>
        <p>Find a provider, then add School-Based Counseling or update their focuses. Demo accounts are excluded.</p>
        <label>Find a provider<input v-model="search" type="search" placeholder="Provider name" :disabled="busy" /></label>
        <div class="focus-people"><button v-for="person in people" :key="person.id" type="button" :aria-pressed="selected?.id === person.id" :disabled="busy" @click="choose(person)">{{ name(person) }}<small>{{ person.service_focus || 'No service focus saved' }}</small></button></div>
        <p v-if="!people.length">No matching providers.</p>
        <form v-if="selected" @submit.prevent="save">
          <h3>{{ name(selected) }}</h3>
          <fieldset :disabled="busy"><ContractServiceFocusSelect v-model="focus" :options="SERVICE_FOCUS_CATEGORIES" /></fieldset>
          <div class="focus-actions"><button type="button" :disabled="busy" @click="addSchool">Add School-Based Counseling</button><button type="submit" class="save" :disabled="busy">{{ busy ? 'Saving…' : 'Save service focuses' }}</button></div>
        </form>
        <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.focus-backdrop { position:fixed; inset:0; z-index:20050; display:grid; place-items:center; padding:20px; background:rgba(15,23,42,.42); }
.focus-dialog { width:min(620px,100%); max-height:90dvh; overflow:auto; box-sizing:border-box; border-radius:16px; padding:24px; background:#fff; color:#183b32; box-shadow:0 24px 80px #0f172a40; }
header,.focus-actions { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; } h2 { margin:0; font-size:20px; } p { line-height:1.5; }
label { display:grid; gap:6px; } input,button { font:inherit; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; color:inherit; background:#fff; } button { cursor:pointer; } button:disabled { opacity:.6; cursor:default; }
.focus-people { display:grid; gap:6px; max-height:200px; overflow:auto; margin-top:12px; } .focus-people button { text-align:left; } small { display:block; margin-top:4px; color:#64748b; } button[aria-pressed="true"] { background:#f0fdf4; border-color:#15803d; }
fieldset { border:0; padding:0; margin:0 0 16px; min-width:0; } .save { color:#fff; background:#176745; } [role="alert"] { color:#b91c1c; }
</style>
