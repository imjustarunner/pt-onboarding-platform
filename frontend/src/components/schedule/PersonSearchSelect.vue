<template>
  <div class="person-search-select" :class="{ 'person-search-select--rich': showPhotos }" ref="containerRef">
    <div
      v-if="showPhotos && selectedPerson && !isSearching"
      class="person-chip"
      @click="startSearch"
    >
      <img
        v-if="selectedPerson.photoUrl"
        class="person-avatar"
        :src="selectedPerson.photoUrl"
        alt=""
      />
      <span v-else class="person-avatar person-avatar--initials" aria-hidden="true">
        {{ selectedPerson.initials }}
      </span>
      <span class="person-chip-name">{{ selectedPerson.displayName }}</span>
      <button
        type="button"
        class="person-chip-clear"
        title="Change provider"
        aria-label="Change provider"
        @click.stop="startSearch"
      >
        ✕
      </button>
    </div>

    <input
      v-show="!showPhotos || !selectedPerson || isSearching"
      ref="inputRef"
      type="text"
      :value="inputDisplay"
      :placeholder="placeholder"
      class="input"
      :class="{ 'has-selection': selectedId && !isSearching }"
      :disabled="disabled"
      autocomplete="off"
      @input="onInput"
      @focus="onFocus"
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
        :class="['person-search-option', { highlighted: idx === highlightedIndex, rich: showPhotos }]"
        @click="selectOption(opt)"
        @mouseenter="highlightedIndex = idx"
      >
        <template v-if="showPhotos">
          <img
            v-if="opt.photoUrl"
            class="person-avatar"
            :src="opt.photoUrl"
            alt=""
          />
          <span v-else class="person-avatar person-avatar--initials" aria-hidden="true">
            {{ opt.initials }}
          </span>
          <span class="person-option-copy">
            <span class="person-option-name" v-html="opt.highlightedLabel" />
            <span v-if="opt.meta" class="person-option-meta">{{ opt.meta }}</span>
          </span>
        </template>
        <span v-else v-html="opt.highlightedLabel" />
      </button>
    </div>
    <div v-else-if="showDropdown && searchQuery && filteredOptions.length === 0" class="person-search-dropdown person-search-empty">
      No matches
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  options: { type: Array, default: () => [] },
  modelValue: { type: [Number, String], default: 0 },
  placeholder: { type: String, default: 'Type name to search…' },
  disabled: { type: Boolean, default: false },
  /** Show avatars and chip UX (schedule modal). */
  showPhotos: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue']);

const containerRef = ref(null);
const inputRef = ref(null);
const searchQuery = ref('');
const showDropdown = ref(false);
const highlightedIndex = ref(0);
const isSearching = ref(false);

const selectedId = computed(() => Number(props.modelValue) || 0);

const personInitials = (p) => {
  const f = String(p?.first_name || '').trim();
  const l = String(p?.last_name || '').trim();
  const a = (f[0] || '').toUpperCase();
  const b = (l[0] || '').toUpperCase();
  return `${a}${b}` || '?';
};

const enrich = (p) => {
  if (!p) return null;
  const first = String(p.first_name || '').trim();
  const last = String(p.last_name || '').trim();
  const displayName = `${last}${last && first ? ', ' : ''}${first}`.trim()
    || String(p.email || '').trim()
    || `User ${p.id}`;
  return {
    ...p,
    id: Number(p.id),
    photoUrl: String(p.photoUrl || p.profilePhotoUrl || p.profile_photo_url || '').trim() || '',
    displayName,
    initials: personInitials(p),
    meta: String(p.role || p.meta || '').trim()
  };
};

const selectedPerson = computed(() => {
  if (!selectedId.value) return null;
  const opt = (props.options || []).find((p) => Number(p.id) === selectedId.value);
  return enrich(opt);
});

const inputDisplay = computed(() => {
  if (isSearching.value || !selectedId.value) return searchQuery.value;
  return selectedPerson.value?.displayName || searchQuery.value;
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
  return { score: inOrder ? 2 : 1, matchedIndices: matchedIndices.sort((a, b) => a - b) };
}

function highlightText(text, matchedIndices) {
  if (!text || !matchedIndices.length) return escapeHtml(text);
  const chars = text.split('');
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    if (matchedIndices.includes(i)) {
      out += `<mark>${escapeHtml(chars[i])}</mark>`;
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
  const base = (props.options || []).map(enrich).filter(Boolean);
  base.sort((a, b) =>
    String(a?.last_name || '').localeCompare(String(b?.last_name || ''))
    || String(a?.first_name || '').localeCompare(String(b?.first_name || ''))
  );

  if (!q) {
    return base.slice(0, 40).map((p) => ({
      ...p,
      highlightedLabel: escapeHtml(p.displayName)
    }));
  }

  const scored = base.map((p) => {
    const searchText = `${p.first_name || ''} ${p.last_name || ''} ${p.email || ''}`.toLowerCase();
    const displayForMatch = p.displayName.toLowerCase();
    const { score: scoreFull } = fuzzyMatch(searchText, q);
    const { score, matchedIndices } = fuzzyMatch(displayForMatch, q);
    const useScore = Math.max(score, scoreFull);
    return { ...p, score: useScore, highlightedLabel: highlightText(p.displayName, matchedIndices) };
  }).filter((p) => p.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a?.last_name || '').localeCompare(String(b?.last_name || ''))
      || String(a?.first_name || '').localeCompare(String(b?.first_name || ''));
  });

  return scored.slice(0, 40);
});

async function startSearch() {
  if (props.disabled) return;
  isSearching.value = true;
  searchQuery.value = '';
  showDropdown.value = true;
  highlightedIndex.value = 0;
  await nextTick();
  inputRef.value?.focus();
}

function onFocus() {
  showDropdown.value = true;
  highlightedIndex.value = 0;
  if (props.showPhotos) {
    isSearching.value = true;
    searchQuery.value = '';
    return;
  }
  // Plain mode: select all so typing replaces the current name immediately.
  nextTick(() => {
    try { inputRef.value?.select?.(); } catch { /* ignore */ }
  });
}

function onInput(e) {
  isSearching.value = true;
  searchQuery.value = e.target.value;
  showDropdown.value = true;
  highlightedIndex.value = 0;
  if (selectedId.value) {
    emit('update:modelValue', 0);
  }
}

function selectOption(opt) {
  emit('update:modelValue', Number(opt.id));
  searchQuery.value = '';
  showDropdown.value = false;
  isSearching.value = false;
}

function onKeydown(e) {
  if (!showDropdown.value || filteredOptions.value.length === 0) {
    if (e.key === 'Escape') {
      showDropdown.value = false;
      isSearching.value = false;
    }
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
    isSearching.value = false;
    inputRef.value?.blur();
  }
}

function handleClickOutside(e) {
  if (containerRef.value && !containerRef.value.contains(e.target)) {
    showDropdown.value = false;
    if (selectedId.value) isSearching.value = false;
  }
}

watch(() => props.modelValue, (val) => {
  if (!val) searchQuery.value = '';
  else isSearching.value = false;
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
  width: 100%;
}

.person-search-select .input {
  width: 100%;
  min-width: 180px;
}

.person-search-select .input.has-selection {
  font-weight: 500;
}

.person-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  padding: 4px 8px 4px 4px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  cursor: text;
}

.person-chip:hover {
  border-color: #cbd5e1;
}

.person-avatar {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  object-fit: cover;
  flex: 0 0 28px;
  background: transparent;
}

.person-avatar--initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #2563eb);
}

.person-chip-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person-chip-clear {
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1;
  padding: 4px;
  cursor: pointer;
  border-radius: 6px;
}

.person-chip-clear:hover {
  background: #e2e8f0;
  color: #475569;
}

.person-search-dropdown {
  position: absolute;
  z-index: 1000;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  max-height: 280px;
  overflow-y: auto;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
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
  color: var(--text-primary, #0f172a);
}

.person-search-option.rich {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
}

.person-search-option:hover,
.person-search-option.highlighted {
  background: #eef2ff;
}

.person-option-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.person-option-name {
  font-size: 0.88rem;
  font-weight: 700;
  color: #0f172a;
}

.person-option-meta {
  font-size: 0.72rem;
  color: #64748b;
  text-transform: capitalize;
}

.person-search-option :deep(mark) {
  background: rgba(99, 102, 241, 0.28);
  font-weight: 700;
  padding: 0 1px;
  border-radius: 2px;
}

.person-search-empty {
  padding: 12px;
  color: var(--text-muted, #64748b);
  font-size: 14px;
}
</style>
