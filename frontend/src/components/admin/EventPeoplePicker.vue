<template>
  <div class="people-picker">
    <div class="picker-tools">
      <label class="search-field"><span class="sr-only">{{ searchLabel }}</span><input v-model="search" type="search" :aria-label="searchLabel" placeholder="Search name, email, role or agency" /></label>
      <select v-model="sort" :aria-label="`${label} sort order`"><option value="first">First name A–Z</option><option value="last">Last name A–Z</option><option value="role">Role A–Z</option><option value="selected">Selected first</option></select>
    </div>
    <div class="picker-summary"><span>{{ modelValue.length }} selected · {{ filtered.length }} shown</span><button v-if="modelValue.length" type="button" @click="$emit('update:modelValue', [])">Clear selection</button></div>
    <div class="people-list" :aria-label="label">
      <div v-for="person in filtered" :key="person.id" class="person-row" :class="{ selected: modelValue.includes(Number(person.id)) }">
        <label class="person-choice"><input type="checkbox" :checked="modelValue.includes(Number(person.id))" @change="toggle(person.id, $event.target.checked)" /><span class="person-avatar" aria-hidden="true">{{ initials(person) }}</span><span class="person-copy"><strong>{{ person.name || person.label }}</strong><small>{{ [person.email, roleLabel(person.role)].filter(Boolean).join(' · ') }}</small><small v-if="person.agencyNames?.length">{{ person.agencyNames.join(' · ') }}</small></span></label>
        <select v-if="mandatory && modelValue.includes(Number(person.id))" :value="mandatoryUserIds.includes(Number(person.id)) ? 'required' : 'optional'" :aria-label="`Attendance for ${person.name || person.label}`" @change="setMandatory(person.id, $event.target.value === 'required')"><option value="optional">Optional</option><option value="required">Mandatory</option></select>
      </div>
      <p v-if="!filtered.length" class="empty-people">{{ search ? 'No matching people. Try another name, email, role or agency.' : 'No eligible people are available.' }}</p>
    </div>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue';
const props = defineProps({ users: { type: Array, default: () => [] }, modelValue: { type: Array, default: () => [] }, label: { type: String, default: 'People' }, searchLabel: { type: String, default: 'Search people' }, mandatory: Boolean, mandatoryUserIds: { type: Array, default: () => [] } });
const emit = defineEmits(['update:modelValue', 'update:mandatoryUserIds']);
const search = ref(''), sort = ref('first');
const roleLabel = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
const initials = person => String(person.name || person.label || '?').trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();
const filtered = computed(() => {
  const term = search.value.trim().toLocaleLowerCase();
  const list = props.users.filter(person => !term || [person.name,person.label,person.email,person.role,...(person.agencyNames || [])].join(' ').toLocaleLowerCase().includes(term));
  return [...list].sort((a,b) => {
    if (sort.value === 'selected') { const selected = Number(props.modelValue.includes(Number(b.id))) - Number(props.modelValue.includes(Number(a.id))); if (selected) return selected; }
    const key = person => sort.value === 'last' ? (person.lastName || person.last_name || String(person.name || person.label || '').trim().split(/\s+/).at(-1)) : sort.value === 'role' ? `${person.role || ''} ${person.name || person.label || ''}` : person.name || person.label || '';
    return String(key(a)).localeCompare(String(key(b)), undefined, { sensitivity:'base' });
  });
});
function toggle(id, checked) { const key=Number(id), next = new Set(props.modelValue.map(Number)); if (checked) next.add(key); else next.delete(key); emit('update:modelValue',[...next]); if (!checked && props.mandatoryUserIds.includes(key)) emit('update:mandatoryUserIds', props.mandatoryUserIds.filter(v=>Number(v)!==key)); }
function setMandatory(id, required) { const next=new Set(props.mandatoryUserIds.map(Number)); if(required)next.add(Number(id));else next.delete(Number(id)); emit('update:mandatoryUserIds',[...next]); }
</script>
<style scoped>
.people-picker{border:1px solid #dce5e4;border-radius:14px;background:#fff;overflow:hidden;color:#203f3b}.picker-tools{display:flex;gap:8px;padding:12px;background:#f6f9f8}.search-field{flex:1;min-width:0}input[type=search],select{box-sizing:border-box;border:1px solid #cedbd8;background:#fff;border-radius:8px;padding:10px 11px;color:#284541;font:inherit;font-size:13px;min-width:0;width:100%}.picker-tools>select{width:160px}.picker-summary{display:flex;justify-content:space-between;gap:8px;padding:8px 14px;color:#60746d;font-size:14px;border-bottom:1px solid #edf1ef}.picker-summary button{background:none;border:0;color:#316e5e;font:inherit;cursor:pointer}.people-list{max-height:340px;overflow-y:auto}.person-row{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #edf1ef}.person-row:last-child{border:0}.person-row.selected{background:#eff7f3}.person-choice{display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer}.person-choice input{accent-color:#236853;width:16px;height:16px;flex:none}.person-avatar{width:33px;height:33px;flex:none;border-radius:50%;display:grid;place-items:center;background:#e7efeb;color:#3d6558;font-size:13px;font-weight:700}.person-copy{display:grid;gap:4px;min-width:0}.person-copy strong{font-size:13px;font-weight:650;color:#24473d}.person-copy small{font-size:13px;color:#62736b;overflow-wrap:anywhere}.person-row>select{width:110px;flex:none;padding:8px;font-size:13px}.empty-people{padding:20px;font-size:13px;color:#5f736b}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:600px){.picker-tools{flex-wrap:wrap}.picker-tools>select{width:100%}.person-avatar{display:none}.person-row{padding:10px}.person-row>select{width:96px}}
</style>
