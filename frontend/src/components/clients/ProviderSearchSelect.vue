<template>
  <div ref="container" class="provider-search-select">
    <input
      :id="inputId || `${id}-input`"
      ref="input"
      class="provider-search-input"
      type="text"
      role="combobox"
      :value="inputText"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="`${id}-list`"
      :aria-activedescendant="open && matches[highlighted] ? `${id}-option-${highlighted}` : undefined"
      aria-autocomplete="list"
      autocomplete="off"
      :placeholder="loading ? 'Loading providers…' : placeholder"
      :disabled="disabled || loading"
      @focus="onFocus"
      @input="onInput"
      @keydown="onKeydown"
    />
    <div v-if="open" class="provider-search-menu">
      <ul :id="`${id}-list`" ref="list" role="listbox" :aria-label="label">
        <li v-for="(provider, index) in matches" :key="provider.id" role="presentation">
          <button
            :id="`${id}-option-${index}`"
            type="button"
            role="option"
            tabindex="-1"
            :aria-selected="String(provider.id) === String(modelValue)"
            :class="{ 'is-highlighted': highlighted === index }"
            @mouseenter="highlighted = index"
            @mousedown.prevent
            @click="choose(provider)"
          >
            <span class="provider-search-name">{{ providerName(provider) }}</span>
            <span v-if="agencyNames(provider)" class="provider-search-agencies">{{ agencyNames(provider) }}</span>
          </button>
        </li>
      </ul>
      <p v-if="!matches.length" class="provider-search-empty" role="status">
        {{ query.trim() ? 'No providers match your search.' : emptyMessage }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue';

const props = defineProps({
  options: { type: Array, default: () => [] },
  modelValue: { type: [String, Number], default: '' },
  inputId: { type: String, default: '' },
  label: { type: String, default: 'Search providers' },
  placeholder: { type: String, default: 'Search provider name or agency…' },
  emptyMessage: { type: String, default: 'No providers available for this agency.' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue']);
const id = `provider-select-${useId()}`;
const container = ref(null);
const input = ref(null);
const list = ref(null);
const query = ref('');
const open = ref(false);
const editing = ref(false);
const highlighted = ref(0);
const providerName = provider => String(provider.name || provider.displayName || [provider.preferred_name || provider.first_name || provider.firstName, provider.last_name || provider.lastName].filter(Boolean).join(' ') || `Provider ${provider.id}`);
const agencyNames = provider => (provider.agencies || []).map(agency => agency.name || agency.agency_name).filter(Boolean).join(' · ');
const chosen = computed(() => props.options.find(provider => String(provider.id) === String(props.modelValue)));
const inputText = computed(() => editing.value ? query.value : chosen.value ? providerName(chosen.value) : '');
const matches = computed(() => {
  const tokens = query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return props.options.filter(provider => {
    const text = `${providerName(provider)} ${agencyNames(provider)}`.toLocaleLowerCase();
    return tokens.every(token => text.includes(token));
  }).slice().sort((a, b) => providerName(a).localeCompare(providerName(b)));
});

function onFocus() {
  query.value = '';
  open.value = true;
  highlighted.value = 0;
  nextTick(() => input.value?.select());
}

function onInput(event) {
  query.value = event.target.value;
  editing.value = true;
  open.value = true;
  highlighted.value = 0;
  if (props.modelValue) emit('update:modelValue', '');
}

function choose(provider) {
  emit('update:modelValue', provider.id);
  editing.value = false;
  query.value = '';
  open.value = false;
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    open.value = false;
    editing.value = false;
    query.value = '';
  } else if (event.key === 'Tab') {
    open.value = false;
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open.value) { open.value = true; highlighted.value = 0; }
    else highlighted.value = Math.max(0, Math.min(matches.value.length - 1, highlighted.value + (event.key === 'ArrowDown' ? 1 : -1)));
    nextTick(() => list.value?.querySelectorAll('[role="option"]')[highlighted.value]?.scrollIntoView?.({ block: 'nearest' }));
  } else if (event.key === 'Enter' && open.value) {
    event.preventDefault();
    if (matches.value[highlighted.value]) choose(matches.value[highlighted.value]);
  }
}

function onOutsideClick(event) {
  if (!container.value?.contains(event.target)) open.value = false;
}

watch(() => props.modelValue, value => {
  if (value) { editing.value = false; query.value = ''; }
});
watch(() => props.options, () => { highlighted.value = 0; });
watch(() => props.loading || props.disabled, unavailable => {
  if (unavailable) { open.value = false; editing.value = false; query.value = ''; }
});
onMounted(() => document.addEventListener('click', onOutsideClick));
onUnmounted(() => document.removeEventListener('click', onOutsideClick));
</script>

<style scoped>
.provider-search-select { position: relative; width: 100%; min-width: 0; font: inherit; }
.provider-search-input { box-sizing: border-box; width: 100%; min-width: 0; min-height: 40px; border: 1px solid var(--border-color, #d7e1ec); border-radius: 10px; padding: 0.6rem 0.75rem; color: var(--text-primary, #203b59); background: var(--bg-primary, #fff); font: inherit; }
.provider-search-input:focus { outline: 2px solid var(--primary, #2563a7); outline-offset: 2px; }
.provider-search-input:disabled { background: var(--bg-secondary, #f4f7fa); color: var(--text-secondary, #62748b); }
.provider-search-menu { position: absolute; z-index: 50; inset: calc(100% + 5px) 0 auto; max-height: 280px; overflow: auto; border: 1px solid var(--border-color, #d7e1ec); border-radius: 10px; background: var(--bg-primary, #fff); box-shadow: 0 8px 24px #132b471c; }
.provider-search-menu ul { margin: 0; padding: 4px; list-style: none; }
.provider-search-menu button { box-sizing: border-box; display: grid; gap: 3px; width: 100%; min-width: 0; border: 0; border-radius: 6px; padding: 0.65rem; text-align: left; white-space: normal; overflow-wrap: anywhere; color: var(--text-primary, #203b59); background: transparent; cursor: pointer; font: inherit; }
.provider-search-menu button.is-highlighted { background: var(--bg-secondary, #edf4fa); }
.provider-search-name { font-weight: 600; }
.provider-search-agencies, .provider-search-empty { font-size: 0.8125rem; line-height: 1.45; color: var(--text-secondary, #62748b); }
.provider-search-empty { margin: 0; padding: 0.75rem; }
</style>
