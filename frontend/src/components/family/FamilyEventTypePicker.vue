<template>
  <div class="event-type-picker">
    <div class="picker-filters">
      <label>Search {{ label.toLowerCase() }}<input v-model="query" type="search" placeholder="Try softball, dentist, school pickup…" autocomplete="off" /></label>
      <label>Category<select v-model="category"><option value="">All categories</option><option v-for="g in familyEventCategories" :key="g.label">{{ g.label }}</option></select></label>
    </div>
    <label>{{ label }}<select :value="modelValue" @change="select($event.target.value)">
      <option v-if="!selectedVisible" :value="modelValue">{{ selected.icon }} {{ selected.label }} (current)</option>
      <optgroup v-for="g in groups" :key="g.label" :label="g.label"><option v-for="type in g.types" :key="type.id" :value="type.id">{{ type.icon }} {{ type.label }}</option></optgroup>
    </select></label>
    <p role="status">{{ count ? count+' matching types' : 'No matches. Try another search or category.' }}</p>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue';
import { eventType, familyEventCategories, searchFamilyEventGroups } from '../../utils/familyCommandCenter';
const props=defineProps({modelValue:{type:String,default:'family'},label:{type:String,default:'Event type'}});
const emit=defineEmits(['update:modelValue','change']);
const query=ref(''),category=ref('');
const selected=computed(()=>eventType(props.modelValue));
const groups=computed(()=>searchFamilyEventGroups(query.value,category.value));
const ids=computed(()=>new Set(groups.value.flatMap(g=>g.types.map(t=>t.id))));
const count=computed(()=>ids.value.size);
const selectedVisible=computed(()=>ids.value.has(props.modelValue));
function select(value){emit('update:modelValue',value);emit('change',eventType(value));}
</script>
<style scoped>
.event-type-picker{min-width:0;width:100%}
.picker-filters{display:flex;gap:12px;flex-wrap:wrap}
.picker-filters>label{flex:1;min-width:130px}
.event-type-picker label{display:flex;flex-direction:column;gap:7px;font-size:13px;color:var(--muted);margin:8px 0}
.event-type-picker input,.event-type-picker select{box-sizing:border-box;width:100%;min-width:0;max-width:100%;font:inherit;background:var(--surface);color:var(--ink);border:1px solid var(--control);border-radius:9px;padding:11px;min-height:44px}
.event-type-picker input:focus,.event-type-picker select:focus{outline:2px solid var(--purple);outline-offset:1px}
.event-type-picker p{font-size:13px;color:var(--muted);margin:6px 0}

</style>
