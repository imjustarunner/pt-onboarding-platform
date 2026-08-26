<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  modelValue: { type: String, default: '' },
  agencyId: { type: [Number, String], default: null },
  placeholder: { type: String, default: 'Type a name or email…' }
});
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const results = ref([]);
const loading = ref(false);
let debounce = null;

async function search(q) {
  if (!props.agencyId || String(q || '').trim().length < 2) {
    results.value = [];
    return;
  }
  loading.value = true;
  try {
    const { data } = await api.get('/communications/directory', {
      params: { agencyId: props.agencyId, q: String(q).trim() },
      skipGlobalLoading: true
    });
    results.value = data?.results || [];
    open.value = results.value.length > 0;
  } catch {
    results.value = [];
  } finally {
    loading.value = false;
  }
}

function onInput(e) {
  const v = e.target.value;
  emit('update:modelValue', v);
  clearTimeout(debounce);
  debounce = setTimeout(() => search(v), 220);
}

function pick(item) {
  const current = String(props.modelValue || '').trim();
  // If last segment looks incomplete, replace it; else append
  const parts = current.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length && !parts[parts.length - 1].includes('@')) {
    parts[parts.length - 1] = item.email;
  } else {
    parts.push(item.email);
  }
  emit('update:modelValue', parts.join(', '));
  open.value = false;
  results.value = [];
}

function onBlur() {
  setTimeout(() => {
    open.value = false;
  }, 150);
}

onUnmounted(() => clearTimeout(debounce));
</script>

<template>
  <div class="uc-dir">
    <input
      :value="modelValue"
      type="text"
      :placeholder="placeholder"
      autocomplete="off"
      @input="onInput"
      @focus="search(modelValue)"
      @blur="onBlur"
    />
    <ul v-if="open && results.length" class="uc-dir-list" role="listbox">
      <li
        v-for="r in results"
        :key="`${r.kind}-${r.id}-${r.email}`"
        role="option"
        @mousedown.prevent="pick(r)"
      >
        <strong>{{ r.name }}</strong>
        <span>{{ r.email }}</span>
        <em v-if="r.meta">{{ r.kind === 'school_contact' ? 'School' : 'Staff' }} · {{ r.meta }}</em>
      </li>
    </ul>
    <p v-else-if="loading" class="uc-dir-hint">Searching…</p>
  </div>
</template>

<style scoped>
.uc-dir { position: relative; width: 100%; }
.uc-dir input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 0.85rem;
  box-sizing: border-box;
}
.uc-dir-list {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  top: calc(100% + 2px);
  margin: 0;
  padding: 4px;
  list-style: none;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
  max-height: 220px;
  overflow-y: auto;
}
.uc-dir-list li {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.82rem;
}
.uc-dir-list li:hover { background: #f0fdf4; }
.uc-dir-list strong { color: #0f172a; }
.uc-dir-list span { color: #166534; }
.uc-dir-list em { font-style: normal; color: #94a3b8; font-size: 0.72rem; }
.uc-dir-hint { margin: 4px 0 0; font-size: 0.72rem; color: #94a3b8; }
</style>
