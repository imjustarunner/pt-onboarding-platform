<template>
  <div class="message-link">
    <button
      ref="trigger"
      type="button"
      class="message-link-button"
      :disabled="disabled || (!rich && !textarea)"
      :aria-expanded="open"
      @click="toggle"
    ><Link2 :size="16" aria-hidden="true" /> <span>Add link</span></button>
    <div v-if="open" class="message-link-panel" role="group" aria-label="Insert link" @keydown.esc.stop.prevent="close">
      <label v-if="rich && !hasSelection">Text to display <input v-model="label" @keydown.enter.prevent.stop="insert" /></label>
      <label>Web address
        <input ref="addressField" v-model="address" type="text" inputmode="url" autocomplete="off"
          placeholder="https://example.com" :aria-invalid="!!error" @input="error = ''" @keydown.enter.prevent.stop="insert" />
      </label>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="message-link-actions">
        <button type="button" @click="insert">Insert link</button>
        <button type="button" @click="close">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import { Link2 } from '@lucide/vue';
import { messageLinkUrl } from '../../navigation/messageLinks.js';

const props = defineProps({
  textarea: { type: Object, default: null },
  disabled: Boolean,
  rich: Boolean,
  selection: { type: String, default: '' }
});
const emit = defineEmits(['open', 'insert']);
const trigger = ref(null);
const addressField = ref(null);
const open = ref(false);
const address = ref('');
const label = ref('');
const error = ref('');
const hasSelection = ref(false);
let selectionStart = 0;
let selectionEnd = 0;
let originalText = '';

function reset() {
  open.value = false;
  address.value = label.value = error.value = '';
}
function close() {
  reset();
  trigger.value?.focus();
}
async function toggle() {
  if (open.value) return close();
  const field = props.textarea;
  if (!props.rich && (!field || field.disabled || field.readOnly)) return;
  if (field) {
    originalText = field.value;
    selectionStart = field.selectionStart;
    selectionEnd = field.selectionEnd;
    address.value = messageLinkUrl(field.value.slice(selectionStart, selectionEnd)) || '';
    if (!address.value) selectionStart = selectionEnd;
  }
  emit('open');
  open.value = true;
  await nextTick();
  hasSelection.value = !!props.selection;
  addressField.value?.focus();
}
function insert() {
  const url = messageLinkUrl(address.value, { addScheme: true });
  if (!url) {
    error.value = 'Enter a valid http or https web address.';
    return;
  }
  if (props.rich) {
    emit('insert', { url, label: label.value.trim() || url });
    reset();
    return;
  }
  const field = props.textarea;
  if (!field || field.disabled || field.readOnly) return close();
  if (field.value !== originalText) {
    error.value = 'The draft changed. Reopen Add link to use the new cursor position.';
    return;
  }
  // Separate the URL from adjoining words so it remains clickable in plain text.
  const before = field.value.slice(0, selectionStart);
  const after = field.value.slice(selectionEnd);
  const prefix = before && !/[\s([{]$/.test(before) ? ' ' : '';
  const suffix = after && !/^[\s\])},.;!?]/.test(after) ? ' ' : '';
  const linkText = prefix + url + suffix;
  if (field.maxLength >= 0 && before.length + linkText.length + after.length > field.maxLength) {
    error.value = 'This link would exceed the message length limit.';
    return;
  }
  field.setRangeText(linkText, selectionStart, selectionEnd, 'end');
  field.dispatchEvent(new Event('input', { bubbles: true }));
  reset();
  field.focus();
}

watch(() => props.textarea, reset);
</script>

<style scoped>
.message-link { display: inline-block; position: relative; vertical-align: middle; text-align: left; }
.message-link button { font: inherit; cursor: pointer; }
.message-link-button { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--border, #cbd5e1); border-radius: 7px; padding: 5px 8px; color: var(--text-primary, #1d3657); background: var(--bg-primary, #fff); white-space: nowrap; }
.message-link-button:disabled { opacity: .55; cursor: default; }
.message-link-panel { position: absolute; bottom: calc(100% + 6px); inset-inline-start: 0; z-index: 10; width: min(300px, calc(100vw - 54px)); padding: 12px; box-sizing: border-box; border: 1px solid var(--border, #cbd5e1); border-radius: 9px; background: var(--bg-primary, #fff); color: var(--text-primary, #172944); box-shadow: 0 6px 20px #17294429; }
.message-link-panel label { display: grid; gap: 3px; margin-bottom: 8px; }
.message-link-panel input { width: 100%; min-width: 0; box-sizing: border-box; font: inherit; padding: 6px 8px; border: 1px solid var(--border, #cbd5e1); border-radius: 5px; }
.message-link-panel p { color: var(--danger, #a0232e); margin: 0 0 8px; }
.message-link-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.message-link-actions button { border-radius: 5px; border: 1px solid var(--border, #cbd5e1); padding: 4px 8px; }
</style>
