<template>
  <div ref="root" class="context-picker" @focusout="onFocusOut" @keydown.esc.stop.prevent="close(true)">
    <span :id="`${id}-label`" class="picker-label">{{ label }}</span>
    <button ref="trigger" type="button" class="picker-trigger" :aria-labelledby="`${id}-label ${id}-value`" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="open ? id : undefined" @click="open ? close() : show()" @keydown.down.prevent="show()" @keydown.up.prevent="show(true)">
      <span :id="`${id}-value`" class="picker-value"><strong>{{ selected?.label || placeholder }}</strong><small v-if="selected?.description">{{ selected.description }}</small></span>
      <span class="picker-chevron" aria-hidden="true">⌄</span>
    </button>
    <div v-if="open" class="picker-popover">
      <p v-if="hint" class="picker-hint">{{ hint }}</p>
      <div :id="id" role="listbox" :aria-labelledby="`${id}-label`" class="picker-list" @keydown="onListKeydown">
        <div v-for="(group, index) in groups" :key="group.label || index" role="group" :aria-labelledby="group.label ? `${id}-group-${index}` : undefined" :aria-label="group.label ? undefined : label" class="picker-group">
          <div v-if="group.label" :id="`${id}-group-${index}`" class="picker-group-label">{{ group.label }}</div>
          <button v-for="option in group.options" :key="option.value" type="button" role="option" :aria-selected="option.value === modelValue" :tabindex="option.value === focusedValue ? 0 : -1" class="picker-option" :class="{ 'is-selected': option.value === modelValue }" @focus="focusedValue = option.value" @click="select(option)">
            <span v-if="option.initials" class="picker-avatar" aria-hidden="true">{{ option.initials }}</span>
            <span class="picker-value"><strong>{{ option.label }}</strong><small v-if="option.description">{{ option.description }}</small></span>
            <span v-if="option.value === modelValue" class="picker-selected" aria-hidden="true">✓</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';

const props = defineProps({
  label: String,
  modelValue: [String, Number],
  groups: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Choose an option' },
  hint: String
});
const emit = defineEmits(['update:modelValue', 'select']);
const id = `portal-picker-${useId()}`;
const root = ref(null), trigger = ref(null), open = ref(false), focusedValue = ref(null);
const options = computed(() => props.groups.flatMap(group => group.options));
const selected = computed(() => options.value.find(option => option.value === props.modelValue));
async function focusOption(index) {
  focusedValue.value = options.value[index]?.value;
  await nextTick();
  root.value?.querySelectorAll('[role="option"]')[index]?.focus();
}
async function show(last = false) {
  open.value = true;
  const selectedIndex = options.value.findIndex(option => option.value === props.modelValue);
  await focusOption(selectedIndex >= 0 ? selectedIndex : last ? options.value.length - 1 : 0);
}
function close(restoreFocus = false) {
  open.value = false;
  if (restoreFocus) trigger.value?.focus();
}
function select(option) {
  close(true);
  emit('update:modelValue', option.value);
  emit('select', option);
}
function onListKeydown(event) {
  const index = options.value.findIndex(option => option.value === focusedValue.value);
  let next;
  if (event.key === 'ArrowDown') next = (index + 1) % options.value.length;
  else if (event.key === 'ArrowUp') next = (index - 1 + options.value.length) % options.value.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = options.value.length - 1;
  else if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
    next = options.value.findIndex((_, offset) => options.value[(index + offset + 1) % options.value.length].label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
    if (next >= 0) next = (index + next + 1) % options.value.length;
    else return;
  } else return;
  event.preventDefault();
  focusOption(next);
}
function onFocusOut(event) { if (!root.value?.contains(event.relatedTarget)) close(); }
function onPointerDown(event) { if (!root.value?.contains(event.target)) close(); }
onMounted(() => document.addEventListener('pointerdown', onPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));
</script>

<style scoped>
.context-picker{position:relative;min-width:0;flex:1;font-family:inherit;color:#173451}
.picker-label{display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#405571}
.picker-trigger{display:flex;align-items:center;gap:12px;width:100%;min-height:58px;padding:11px 14px;border:1px solid #b9cadc;border-radius:10px;background:#fff;color:#173451;text-align:left;font:inherit;cursor:pointer}
.picker-trigger:hover,.picker-trigger[aria-expanded=true]{border-color:#2467a7;background:#f2f7fd}
.picker-value{display:grid;gap:3px;min-width:0;flex:1;overflow-wrap:anywhere}
.picker-value strong{font-size:15px;line-height:1.4;font-weight:650;color:#173451}
.picker-value small{font-size:13px;line-height:1.4;color:#405571}
.picker-chevron{flex-shrink:0;font-size:22px;color:#405571}
.picker-popover{position:absolute;top:calc(100% + 8px);left:0;width:100%;min-width:0;z-index:5;border:1px solid #b9cadc;border-radius:12px;background:#fff;box-shadow:0 12px 30px #17345126;overflow:hidden}
.picker-hint{margin:0;padding:12px 14px;border-bottom:1px solid #dce5ef;color:#405571;font-size:13px;line-height:1.5}
.picker-list{max-height:min(420px,50dvh);overflow-y:auto;overscroll-behavior:contain;padding:6px}
.picker-group+.picker-group{margin-top:10px;border-top:1px solid #c9d8e7;padding-top:6px}
.picker-group-label{padding:9px 10px;font-size:12px;font-weight:750;letter-spacing:.04em;color:#405571;background:#f2f6fa;border-radius:6px}
.picker-option{display:flex;align-items:center;gap:12px;width:100%;min-height:64px;margin-top:5px;padding:12px 10px;border:1px solid #e0e7ef;border-radius:8px;background:#fff;text-align:left;font:inherit;cursor:pointer}
.picker-option:hover{background:#f2f7fd;border-color:#9ab7d5}
.picker-option.is-selected{background:#eaf3fe;border-color:#8aafd4}
.picker-option:focus-visible,.picker-trigger:focus-visible{outline:3px solid #2467a7;outline-offset:-3px}
.picker-avatar{display:grid;place-items:center;flex-shrink:0;width:36px;height:36px;border-radius:50%;background:#e5edf7;color:#173451;font-size:13px;font-weight:700}
.picker-selected{flex-shrink:0;color:#164f86;font-size:20px;font-weight:700}
</style>
