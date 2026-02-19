<template>
  <section v-if="count > 0" class="notes-to-sign-section" aria-label="Notes to sign">
    <h2 class="section-title">
      Notes to sign
      <span class="section-badge">{{ count }}</span>
    </h2>
    <p class="section-hint">Clinical notes from your supervisees awaiting your sign-off.</p>
    <div v-if="loading" class="notes-loading">Loading...</div>
    <ul v-else-if="notes.length > 0" class="notes-list">
      <li
        v-for="note in notes"
        :key="note.id"
        class="note-item"
      >
        <span class="note-provider">{{ note.provider_first_name }} {{ note.provider_last_name }}</span>
        <span class="note-meta">Submitted {{ formatDate(note.provider_signed_at) }}</span>
        <button
          type="button"
          class="note-sign-btn"
          disabled
          title="Sign-off UI coming in Phase 3"
        >
          Sign
        </button>
      </li>
    </ul>
    <p v-else class="notes-empty">No notes pending. Count will refresh shortly.</p>
  </section>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  count: { type: Number, default: 0 }
});

const notes = ref([]);
const loading = ref(false);

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const fetchNotes = async () => {
  if (props.count === 0) {
    notes.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await api.get('/me/notes-to-sign');
    notes.value = res?.data?.notes ?? [];
  } catch {
    notes.value = [];
  } finally {
    loading.value = false;
  }
};

watch(() => props.count, (n) => {
  if (n > 0) fetchNotes();
  else notes.value = [];
});

onMounted(() => {
  if (props.count > 0) fetchNotes();
});
</script>

<style scoped>
.notes-to-sign-section {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  padding: 16px 20px;
}

.section-title {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-badge {
  padding: 2px 8px;
  background: #059669;
  color: white;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.section-hint {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #166534;
}

.notes-loading,
.notes-empty {
  margin: 0;
  font-size: 14px;
  color: #166534;
}

.notes-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.note-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #bbf7d0;
}

.note-item:last-child {
  border-bottom: none;
}

.note-provider {
  font-weight: 500;
  flex: 1;
}

.note-meta {
  font-size: 12px;
  color: #166534;
}

.note-sign-btn {
  padding: 6px 12px;
  background: #059669;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.note-sign-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
