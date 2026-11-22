<template>
  <details class="client-types" @toggle="onToggle">
    <summary class="cdp-pill cdp-pill--type" aria-label="Client Type">
      Client Type · {{ label }}
    </summary>
    <div class="type-options">
      <p v-if="error" role="alert">{{ error }} <button type="button" @click="$emit('reload')">Reload</button></p>
      <p v-else-if="!profile" role="status">Loading service types…</p>
      <template v-if="profile">
        <fieldset v-if="canEdit" :disabled="busy">
          <legend>Staff selections for this agency</legend>
          <div v-for="type in options" :key="type">
            <label><input type="checkbox" :checked="checked(type)" :disabled="requiredByLink(type)" @change="toggle(type,$event.target.checked)" /> {{ title(type) }}</label>
            <label v-if="requiredByLink(type)" class="keep-type"><input v-model="draft" type="checkbox" :value="type" /> Keep after unlinking</label>
          </div>
        </fieldset>
        <div v-for="(sources,type) in profile.evidence" :key="type" class="type-source">
          <strong>{{ title(type) }}</strong>
          <button v-for="source in sources" :key="source.label + source.tab" type="button" @click="manage($event, source.tab)">{{ chartOrganizationLabel(source.label,type) }}</button>
        </div>
        <button v-if="canEdit" type="button" class="btn btn-primary btn-sm" :disabled="busy || !changed" @click="save">{{ busy ? 'Saving…' : 'Save types' }}</button>
      </template>
    </div>
  </details>
</template>
<script setup>
import { chartOrganizationLabel } from '../../../utils/clientRosterContext.js';
import { computed, ref, watch } from 'vue';
const props = defineProps({profile:Object, label:String, error:String, canEdit:Boolean, busy:Boolean});
const emit = defineEmits(['save','reload','manage']);
const options = ['clinical','learning','coaching','consulting','school','dependent'];
const title = type => type[0].toUpperCase() + type.slice(1);
const draft = ref([]), useMinorDefault = ref(true);
function reset() {
  draft.value = [...(props.profile?.selected || [])];
  useMinorDefault.value = !props.profile?.suppressMinorDefault;
}
watch(() => [props.profile?.revision, props.profile?.selected?.join(',')], reset, {immediate:true});
function onToggle(event) { if (!event.target.open) reset(); }
function manage(event, tab) {
  event.currentTarget.closest('details').open = false;
  emit('manage', tab);
}
function requiredByLink(type) {
  return props.profile.evidence[type]?.some(source => !source.minorDefault);
}
function checked(type) {
  return draft.value.includes(type) || requiredByLink(type) || type === 'dependent' && props.profile.minorDefault && useMinorDefault.value;
}
function toggle(type,enabled) {
  if (type === 'dependent' && props.profile.minorDefault) useMinorDefault.value = enabled;
  draft.value = enabled ? [...new Set([...draft.value,type])] : draft.value.filter(item => item !== type);
}
const changed = computed(() => options.some(type => draft.value.includes(type) !== props.profile.selected.includes(type))
  || useMinorDefault.value === props.profile.suppressMinorDefault);
function save() {
  emit('save',{types:[...draft.value],suppressMinorDefault:!useMinorDefault.value,revision:props.profile.revision});
}
</script>
<style scoped>
.client-types { position:relative }
summary {cursor:pointer}
.type-options {position:absolute;z-index:15;left:0;min-width:min(19rem,82vw);padding:14px;background:var(--bg,#fff);color:var(--text-primary,#173c62);border:1px solid var(--border,#cbd5e1);border-radius:8px;box-shadow:0 6px 18px #142a431c}
fieldset {display:grid;grid-template-columns:1fr 1fr;gap:8px;border:0;padding:0;margin:0 0 12px}
.keep-type {display:block;font-size:.85em;margin-top:4px}
legend {margin-bottom:8px;font-weight:600}
.type-source {display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.type-source button {background:none;color:inherit;border:0;padding:0;text-decoration:underline;cursor:pointer}
</style>
