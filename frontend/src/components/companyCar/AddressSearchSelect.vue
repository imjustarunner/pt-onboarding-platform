<template>
  <div class="address-search-select" ref="containerRef">
    <input
      ref="inputRef"
      type="text"
      :value="displayValue"
      :placeholder="placeholder"
      class="input"
      :class="{ 'has-selection': !!selectedOption }"
      :disabled="disabled"
      autocomplete="off"
      @input="onInput"
      @focus="openDropdown"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <div
      v-if="showDropdown && filteredOptions.length > 0"
      class="address-search-dropdown"
      role="listbox"
    >
      <button
        v-for="(opt, idx) in filteredOptions"
        :key="opt.id"
        type="button"
        role="option"
        :aria-selected="idx === highlightedIndex"
        :class="['address-search-option', { highlighted: idx === highlightedIndex }]"
        @click="selectOption(opt)"
        @mouseenter="highlightedIndex = idx"
      >
        <span v-html="opt.highlightedName"></span>
        <span v-if="opt.addressLine" class="option-address">{{ opt.addressLine }}</span>
      </button>
    </div>
    <div v-else-if="showDropdown && searchQuery && filteredOptions.length === 0" class="address-search-dropdown address-search-empty">
      No matches
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  options: { type: Array, default: () => [] },
  modelValue: { type: [Object, String], default: null },
  placeholder: { type: String, default: 'Type to search…' },
  disabled: { type: Boolean, default: false },
  /** Max options to show. 0 = no limit (show all). Default 20. */
  limit: { type: Number, default: 20 }
});

const emit = defineEmits(['update:modelValue']);

const containerRef = ref(null);
const inputRef = ref(null);
const searchQuery = ref('');
const showDropdown = ref(false);
const highlightedIndex = ref(0);

const selectedOption = computed(() => {
  const v = props.modelValue;
  if (!v) return null;
  if (typeof v === 'object' && v?.id) {
    return props.options.find((o) => o.id === v.id) || v;
  }
  if (typeof v === 'string') {
    return props.options.find((o) => o.addressLine === v || o.name === v) || { name: v, addressLine: v };
  }
  return null;
});

const displayValue = computed(() => {
  if (!selectedOption.value) return searchQuery.value;
  const o = selectedOption.value;
  return o.addressLine || o.name || searchQuery.value;
});

function fuzzyMatch(text, query) {
  if (!query) return { score: 1, matchedIndices: [] };
  const t = String(text || '').toLowerCase();
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { score: 1, matchedIndices: [] };
  const qChars = q.split('').filter(Boolean);
  if (!qChars.length) return { score: 1, matchedIndices: [] };
  const allPresent = qChars.every((c) => t.includes(c));
  if (!allPresent) return { score: 0, matchedIndices: [] };
  const matchedIndices = [];
  let ti = 0;
  for (const c of qChars) {
    const idx = t.indexOf(c, ti);
    if (idx === -1) {
      const fallback = t.indexOf(c);
      if (fallback === -1) return { score: 0, matchedIndices: [] };
      matchedIndices.push(fallback);
      ti = fallback + 1;
    } else {
      matchedIndices.push(idx);
      ti = idx + 1;
    }
  }
  const inOrder = matchedIndices.every((idx, i) => i === 0 || idx > matchedIndices[i - 1]);
  const score = inOrder ? 2 : 1;
  return { score, matchedIndices: matchedIndices.sort((a, b) => a - b) };
}

function highlightText(text, matchedIndices) {
  if (!text || !matchedIndices.length) return escapeHtml(text);
  const chars = text.split('');
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    if (matchedIndices.includes(i)) {
      out += '<mark>' + escapeHtml(chars[i]) + '</mark>';
    } else {
      out += escapeHtml(chars[i]);
    }
  }
  return out;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

const filteredOptions = computed(() => {
  const q = String(searchQuery.value || '').trim();
  const base = (props.options || []).slice();
  const limit = props.limit > 0 ? props.limit : base.length;

  if (!q) {
    return base.slice(0, limit).map((o) => ({
      ...o,
      highlightedName: escapeHtml(o.name || '')
    }));
  }

  const scored = base.map((o) => {
    const searchText = (o.searchText || `${o.name || ''} ${o.addressLine || ''}`).toLowerCase();
    const nameForMatch = (o.name || '').toLowerCase();
    const { score: scoreSearch } = fuzzyMatch(searchText, q);
    const { score, matchedIndices } = fuzzyMatch(nameForMatch, q);
    const useScore = Math.max(score, scoreSearch);
    const highlightedName = highlightText(o.name || '', matchedIndices);
    return { ...o, score: useScore, highlightedName };
  }).filter((o) => o.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });

  return scored.slice(0, limit);
});

function onInput(e) {
  searchQuery.value = e.target.value;
  showDropdown.value = true;
  highlightedIndex.value = 0;
  if (selectedOption.value) {
    emit('update:modelValue', null);
  }
}

function onBlur() {
  setTimeout(() => {
    showDropdown.value = false;
    const q = String(searchQuery.value || '').trim();
    if (q && !selectedOption.value) {
      emit('update:modelValue', { id: 'custom', name: q, addressLine: q, searchText: q.toLowerCase() });
    }
  }, 150);
}

function openDropdown() {
  showDropdown.value = true;
  highlightedIndex.value = 0;
}

function selectOption(opt) {
  emit('update:modelValue', opt);
  searchQuery.value = '';
  showDropdown.value = false;
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    const q = String(searchQuery.value || '').trim();
    if (q && filteredOptions.value.length === 0) {
      e.preventDefault();
      emit('update:modelValue', { id: 'custom', name: q, addressLine: q, searchText: q.toLowerCase() });
      showDropdown.value = false;
      return;
    }
  }
  if (!showDropdown.value || filteredOptions.value.length === 0) {
    if (e.key === 'Escape') showDropdown.value = false;
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightedIndex.value = Math.min(highlightedIndex.value + 1, filteredOptions.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const opt = filteredOptions.value[highlightedIndex.value];
    if (opt) selectOption(opt);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    showDropdown.value = false;
    inputRef.value?.blur();
  }
}

function handleClickOutside(e) {
  if (containerRef.value && !containerRef.value.contains(e.target)) {
    showDropdown.value = false;
  }
}

watch(() => props.modelValue, (val) => {
  if (!val) searchQuery.value = '';
});

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.address-search-select {
  position: relative;
  display: block;
  width: 100%;
}

.address-search-select .input {
  width: 100%;
  min-width: 0;
}

.address-search-select .input.has-selection {
  font-weight: 500;
}

.address-search-dropdown {
  position: absolute;
  z-index: 1000;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 2px;
  max-height: 280px;
  overflow-y: auto;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-color, #ccc);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.address-search-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-primary, #333);
  gap: 2px;
}

.address-search-option:hover,
.address-search-option.highlighted {
  background: var(--bg-hover, #f0f0f0);
}

.option-address {
  font-size: 12px;
  color: var(--text-muted, #666);
}

.address-search-option :deep(mark) {
  background: rgba(59, 130, 246, 0.3);
  font-weight: 600;
  padding: 0 1px;
  border-radius: 2px;
}

.address-search-empty {
  padding: 12px;
  color: var(--text-muted, #666);
  font-size: 14px;
}
</style>
