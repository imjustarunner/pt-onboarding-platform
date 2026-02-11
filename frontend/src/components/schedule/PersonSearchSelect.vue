<template>
  <div class="person-search-select" ref="containerRef">
    <input
      ref="inputRef"
      type="text"
      :value="displayValue"
      :placeholder="placeholder"
      class="input"
      :class="{ 'has-selection': selectedId }"
      :disabled="disabled"
      autocomplete="off"
      @input="onInput"
      @focus="openDropdown"
      @keydown="onKeydown"
    />
    <div
      v-if="showDropdown && filteredOptions.length > 0"
      class="person-search-dropdown"
      role="listbox"
    >
      <button
        v-for="(opt, idx) in filteredOptions"
        :key="opt.id"
        type="button"
        role="option"
        :aria-selected="idx === highlightedIndex"
        :class="['person-search-option', { highlighted: idx === highlightedIndex }]"
        @click="selectOption(opt)"
        @mouseenter="highlightedIndex = idx"
        v-html="opt.highlightedLabel"
      />
    </div>
    <div v-else-if="showDropdown && searchQuery && filteredOptions.length === 0" class="person-search-dropdown person-search-empty">
      No matches
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  options: { type: Array, default: () => [] },
  modelValue: { type: [Number, String], default: 0 },
  placeholder: { type: String, default: 'Type name to search…' },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue']);

const containerRef = ref(null);
const inputRef = ref(null);
const searchQuery = ref('');
const showDropdown = ref(false);
const highlightedIndex = ref(0);

const selectedId = computed(() => Number(props.modelValue) || 0);

const displayValue = computed(() => {
  if (!selectedId.value) return searchQuery.value;
  const opt = props.options.find((p) => Number(p.id) === selectedId.value);
  if (!opt) return searchQuery.value;
  return `${opt.last_name || ''}, ${opt.first_name || ''}`.trim();
});

/**
 * Fuzzy match: prioritize letters in correct order, then all letters present.
 * Returns { score, matchedIndices } for sorting and highlighting.
 */
function fuzzyMatch(text, query) {
  if (!query) return { score: 1, matchedIndices: [] };
  const t = String(text || '').toLowerCase();
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { score: 1, matchedIndices: [] };

  const qChars = q.split('').filter(Boolean);
  if (!qChars.length) return { score: 1, matchedIndices: [] };

  // Check all letters present
  const allPresent = qChars.every((c) => t.includes(c));
  if (!allPresent) return { score: 0, matchedIndices: [] };

  // Find letters in order (greedy left-to-right)
  const matchedIndices = [];
  let ti = 0;
  for (const c of qChars) {
    const idx = t.indexOf(c, ti);
    if (idx === -1) {
      // Letter not in order - still match but lower score
      const fallback = t.indexOf(c);
      if (fallback === -1) return { score: 0, matchedIndices: [] };
      matchedIndices.push(fallback);
      ti = fallback + 1;
    } else {
      matchedIndices.push(idx);
      ti = idx + 1;
    }
  }

  // Score: 2 = all in order, 1 = all present but not in order
  const inOrder = matchedIndices.every((idx, i) => i === 0 || idx > matchedIndices[i - 1]);
  const score = inOrder ? 2 : 1;
  return { score, matchedIndices: matchedIndices.sort((a, b) => a - b) };
}

/**
 * Wrap matched characters in <mark> for highlighting.
 */
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
  base.sort((a, b) =>
    String(a?.last_name || '').localeCompare(String(b?.last_name || '')) ||
    String(a?.first_name || '').localeCompare(String(b?.first_name || ''))
  );

  if (!q) {
    return base.map((p) => ({
      ...p,
      highlightedLabel: escapeHtml(`${p.last_name || ''}, ${p.first_name || ''}`.trim())
    }));
  }

  const scored = base.map((p) => {
    const display = `${p.last_name || ''}, ${p.first_name || ''}`.trim();
    const searchText = `${p.first_name || ''} ${p.last_name || ''} ${p.email || ''}`.toLowerCase();
    const displayForMatch = display.toLowerCase();
    const { score: scoreFull } = fuzzyMatch(searchText, q);
    const { score, matchedIndices } = fuzzyMatch(displayForMatch, q);
    const useScore = Math.max(score, scoreFull);
    const highlightedLabel = highlightText(display, matchedIndices);
    return { ...p, score: useScore, highlightedLabel };
  }).filter((p) => p.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a?.last_name || '').localeCompare(String(b?.last_name || '')) ||
      String(a?.first_name || '').localeCompare(String(b?.first_name || ''));
  });

  return scored;
});

function onInput(e) {
  searchQuery.value = e.target.value;
  showDropdown.value = true;
  highlightedIndex.value = 0;
  if (selectedId.value) {
    emit('update:modelValue', 0);
  }
}

function openDropdown() {
  showDropdown.value = true;
  highlightedIndex.value = 0;
}

function selectOption(opt) {
  emit('update:modelValue', Number(opt.id));
  searchQuery.value = '';
  showDropdown.value = false;
}

function onKeydown(e) {
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
.person-search-select {
  position: relative;
  display: inline-block;
  min-width: 180px;
}

.person-search-select .input {
  width: 100%;
  min-width: 180px;
}

.person-search-select .input.has-selection {
  font-weight: 500;
}

.person-search-dropdown {
  position: absolute;
  z-index: 1000;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 2px;
  max-height: 240px;
  overflow-y: auto;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-color, #ccc);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.person-search-option {
  display: block;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-primary, #333);
}

.person-search-option:hover,
.person-search-option.highlighted {
  background: var(--bg-hover, #f0f0f0);
}

.person-search-option :deep(mark) {
  background: rgba(59, 130, 246, 0.3);
  font-weight: 600;
  padding: 0 1px;
  border-radius: 2px;
}

.person-search-empty {
  padding: 12px;
  color: var(--text-muted, #666);
  font-size: 14px;
}
</style>
