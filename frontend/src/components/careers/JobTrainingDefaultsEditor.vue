<template>
  <section class="training-defaults">
    <h3>Training &amp; guides</h3>
    <p>These choices add to the selected package. Training already inside a package is managed in that package.</p>
    <label class="search">Find training<input v-model="search" type="search" placeholder="Search modules or training focuses" /></label>
    <section v-for="group in groups" :key="group.key">
      <h4>{{ group.label }}</h4><p v-if="!group.items.length">No matching training available.</p>
      <label v-for="item in group.items" :key="item.id" class="training-row">
        <input type="checkbox" :checked="included(group, item.id)" @change="toggle(group, item.id, $event.target.checked)" />
        <span>{{ item.title || item.name }}<small>{{ !shared && (defaults[group.key] || []).includes(Number(item.id)) ? 'All jobs' : shared ? 'All jobs' : 'This job only' }}</small></span>
      </label>
    </section>
    <section v-if="guides.length"><h4>Company guides</h4><p>Automatic keeps the usual requirements for the person’s role. Required adds the guide to onboarding; Not required removes that requirement for this scope.</p>
      <label v-for="guide in guides" :key="guide.key" class="guide-row"><span>{{ guide.title }}<small v-if="!shared">All jobs: {{ requirementLabel(defaults.guideRequirements?.[guide.key]) }}</small></span><select :aria-label="`${guide.title} requirement`" :value="requirementValue(modelValue.guideRequirements?.[guide.key])" @change="setGuide(guide.key, $event.target.value)"><option value="inherit">{{ shared ? 'Automatic by role' : 'Use all-jobs default' }}</option><option value="required">Required</option><option value="excluded">Not required</option></select></label>
    </section>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue';
const props = defineProps({ modelValue: { type: Object, default: () => ({}) }, defaults: { type: Object, default: () => ({}) }, shared: Boolean, modules: { type: Array, default: () => [] }, tracks: { type: Array, default: () => [] }, guides: { type: Array, default: () => [] } });
const emit = defineEmits(['update:modelValue']);
const search = ref('');
const groups = computed(() => [{ key: 'moduleIds', excluded: 'excludedModuleIds', label: 'Training modules', items: props.modules }, { key: 'trackIds', excluded: 'excludedTrackIds', label: 'Training focuses', items: props.tracks }].map(group => ({ ...group, items: group.items.filter(item => `${item.title || item.name}`.toLowerCase().includes(search.value.toLowerCase())) })));
const included = (group, id) => !((props.modelValue[group.excluded] || []).includes(Number(id))) && ((props.modelValue[group.key] || []).includes(Number(id)) || (!props.shared && (props.defaults[group.key] || []).includes(Number(id))));
function toggle(group, rawId, enabled) {
  const id = Number(rawId), inherited = !props.shared && (props.defaults[group.key] || []).includes(id);
  const selected = new Set(props.modelValue[group.key] || []), excluded = new Set(props.modelValue[group.excluded] || []);
  if (enabled) { excluded.delete(id); if (!inherited) selected.add(id); } else { selected.delete(id); if (inherited) excluded.add(id); }
  emit('update:modelValue', { ...props.modelValue, [group.key]: [...selected], [group.excluded]: [...excluded] });
}
const requirementValue = value => value === true ? 'required' : value === false ? 'excluded' : 'inherit';
const requirementLabel = value => value === true ? 'Required' : value === false ? 'Not required' : 'Automatic by role';
function setGuide(key, value) {
  const guideRequirements = { ...props.modelValue.guideRequirements };
  if (value === 'inherit') delete guideRequirements[key]; else guideRequirements[key] = value === 'required';
  emit('update:modelValue', { ...props.modelValue, guideRequirements });
}
</script>
<style scoped>
.training-defaults{display:grid;gap:14px;color:#263449}.training-defaults h3,.training-defaults h4,.training-defaults p{margin:0}.training-defaults p,small{color:#64748b;font-size:13px;line-height:1.6}section section{display:grid;gap:10px}input:not([type=checkbox]),select{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#172339;font:inherit;box-sizing:border-box}.search{display:grid;gap:6px}.training-row,.guide-row{display:flex;gap:12px;align-items:center;border-bottom:1px solid #e2e8f0;padding:10px 0}.training-row input{width:18px;height:18px;flex-shrink:0}.guide-row{justify-content:space-between}.guide-row select{max-width:230px}small{display:block}@media(max-width:600px){.guide-row{align-items:stretch;flex-direction:column}.guide-row select{max-width:none}}
</style>
