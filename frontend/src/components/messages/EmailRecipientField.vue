<template>
  <div class="recipient-field">
    <label :for="inputId">{{ label }}</label>
    <div class="recipient-box">
      <span v-for="(address, index) in addresses" :key="index" class="recipient-chip" :class="{ invalid: !valid(address) }">
        <span>{{ address }}</span>
        <button type="button" :aria-label="`Remove ${address} from ${label}`" @click="remove(index)">×</button>
      </span>
      <input :id="inputId" ref="input" :value="pending" type="text" inputmode="email" autocomplete="off"
        autocapitalize="none" spellcheck="false" :required="required && !addresses.length"
        :aria-describedby="`${inputId}-hint`" placeholder="Enter an email address"
        @input="updateInput" @keydown.enter.prevent="commit" @keydown.tab="commit" @blur="commit" @paste="paste" />
      <button type="button" class="add-recipient" @click="add">Add recipient</button>
    </div>
    <small :id="`${inputId}-hint`">{{ invalidAddress ? `Check this email address: ${invalidAddress}` : 'Add each person with Enter or Add recipient. You can also paste a list.' }}</small>
  </div>
</template>
<script setup>
import { computed, nextTick, ref, useId, watch } from 'vue';
const props = defineProps({ modelValue: { type: String, default: '' }, label: { type: String, required: true }, required: Boolean });
const emit = defineEmits(['update:modelValue']);
const inputId = `email-recipient-${useId()}`;
const input = ref(null), addresses = ref([]), pending = ref('');
const split = value => String(value || '').split(/[,;\s]+/).filter(Boolean);
const valid = value => /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
const serialized = () => [...addresses.value, pending.value].filter(Boolean).join(', ');
const invalidAddress = computed(() => [...addresses.value, ...split(pending.value)].find(address => !valid(address)));
function publish() { emit('update:modelValue', serialized()); }
function append(values) {
  const seen = new Set(addresses.value.map(address => address.toLowerCase()));
  for (const address of values) {
    if (!seen.has(address.toLowerCase())) { addresses.value.push(address); seen.add(address.toLowerCase()); }
  }
}
watch(() => props.modelValue, value => {
  if (value === serialized()) return;
  addresses.value = []; append(split(value)); pending.value = '';
}, { immediate: true });
watch([invalidAddress, input], () => {
  input.value?.setCustomValidity(invalidAddress.value ? `Check this email address: ${invalidAddress.value}` : '');
}, { flush: 'post', immediate: true });
// Keep partially typed addresses in the saved draft, including before pop-out or close.
function updateInput(event) {
  const parts = event.target.value.split(/[,;\s]+/);
  pending.value = parts.pop() || ''; append(parts.filter(Boolean)); publish();
}
function commit() { append(split(pending.value)); pending.value = ''; publish(); }
async function add() { commit(); await nextTick(); input.value?.focus(); }
function remove(index) { addresses.value.splice(index, 1); publish(); }
function paste(event) {
  const text = event.clipboardData?.getData('text');
  if (!text || !/[,;\s]/.test(text.trim())) return;
  event.preventDefault();
  const element = event.target;
  pending.value = pending.value.slice(0, element.selectionStart ?? pending.value.length) + text + pending.value.slice(element.selectionEnd ?? pending.value.length);
  commit();
}
</script>
<style scoped>
.recipient-field{flex:1;min-width:0;margin:12px 0}label{display:block;margin-bottom:6px}.recipient-box{display:flex;flex-wrap:wrap;align-items:center;gap:6px;border:1px solid #a5b9af;border-radius:6px;padding:6px}.recipient-box:focus-within{outline:2px solid #47755f;outline-offset:1px}input{min-width:160px;flex:1;border:0;outline:0;background:transparent;padding:7px;font:inherit;color:inherit}.recipient-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;background:var(--bg-secondary,#edf4ef);border-radius:5px;padding:3px 7px;font-size:.9em}.recipient-chip>span{overflow-wrap:anywhere;min-width:0}.invalid{outline:1px solid #af2929}.recipient-chip button{border:0;background:transparent;font-size:1.2em;padding:3px 6px}.add-recipient{border:1px solid #a5b9af;border-radius:5px;background:transparent;padding:7px;font:inherit;font-size:.85em}button{color:inherit;cursor:pointer}small{display:block;margin-top:5px;font-size:.8em;color:var(--text-secondary,#47755f)}
</style>
