<template>
  <div class="thread-email-search">
    <button
      ref="toggleButton"
      type="button"
      class="btn btn-secondary btn-xs search-toggle"
      aria-label="Search this email thread"
      title="Search this email thread"
      :aria-expanded="open"
      @click="toggle"
    ><Search :size="16" aria-hidden="true" /></button>
    <template v-if="open">
      <input
        ref="input"
        :value="query"
        type="search"
        aria-label="Search email sender, subject, and message text"
        placeholder="Search this thread…"
        @input="emit('update:query', $event.target.value)"
        @keydown.esc.stop.prevent="toggle"
      />
      <span v-if="query.trim()" role="status">{{ matchCount }} {{ matchCount === 1 ? 'match' : 'matches' }}</span>
    </template>
  </div>
</template>

<script setup>
import { nextTick, ref } from 'vue';
import { Search } from '@lucide/vue';

defineProps({
  query: { type: String, default: '' },
  matchCount: { type: Number, default: 0 }
});
const emit = defineEmits(['update:query']);
const open = ref(false);
const input = ref(null);
const toggleButton = ref(null);

async function toggle() {
  open.value = !open.value;
  if (!open.value) emit('update:query', '');
  await nextTick();
  (open.value ? input.value : toggleButton.value)?.focus();
}
</script>

<style scoped>
.thread-email-search { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }
.search-toggle { display: inline-flex; align-items: center; justify-content: center; min-height: 30px; min-width: 32px; }
.thread-email-search input { width: min(170px, 100%); padding: 5px 8px; border: 1px solid var(--border, #cbd5e1); border-radius: 6px; font: inherit; color: inherit; background: var(--bg-card, #fff); }
.thread-email-search span { font-size: .75rem; }
</style>
