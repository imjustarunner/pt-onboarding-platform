<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <div class="header-left">
          <div class="title-row">
            <strong>Waitlist note</strong>
            <span class="pill">Shared</span>
          </div>
          <div class="sub">
            <span class="muted">Client:</span>
            <span class="mono">{{ clientLabel }}</span>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('close')">Close</button>
      </div>

      <div class="modal-body">
        <div v-if="loading" class="muted">Loading…</div>
        <div v-else-if="error" class="error">{{ error }}</div>

        <div v-else class="content">
          <div class="meta-row">
            <div class="muted-small">
              <span v-if="note?.author_name">
                Last updated by <strong>{{ note.author_name }}</strong>
              </span>
              <span v-if="note?.created_at">
                <span v-if="note?.author_name">•</span>
                {{ formatWhen(note.created_at) }}
              </span>
            </div>
            <div class="meta-actions">
              <button
                v-if="!editing"
                class="btn btn-secondary btn-sm"
                type="button"
                @click="beginEdit"
              >
                Edit (overwrite)
              </button>
            </div>
          </div>

          <div v-if="!editing" class="read-panel">
            <div v-if="note?.message" class="read-text">{{ note.message }}</div>
            <div v-else class="muted">No waitlist note yet.</div>
          </div>

          <div v-else class="edit-panel">
            <div v-if="!unlocked" class="unlock">
              <div class="warn">
                This will overwrite the previous note. Type <code>edit</code> to continue.
              </div>
              <input
                v-model="unlockText"
                class="input"
                type="text"
                placeholder="Type edit to unlock"
                @keydown.enter.prevent="tryUnlock"
              />
              <div class="unlock-actions">
                <button class="btn btn-primary btn-sm" type="button" @click="tryUnlock" :disabled="unlockText.trim().toLowerCase() !== 'edit'">
                  Unlock editing
                </button>
                <button class="btn btn-secondary btn-sm" type="button" @click="cancelEdit">Cancel</button>
              </div>
            </div>

            <div v-else>
              <textarea
                v-model="draft"
                class="textarea"
                rows="7"
                placeholder="Add the reason this client is on the waitlist…"
              />
              <div class="edit-actions">
                <button class="btn btn-primary" type="button" @click="save" :disabled="saving || !draft.trim()">
                  {{ saving ? 'Saving…' : 'Save note' }}
                </button>
                <button class="btn btn-secondary" type="button" @click="cancelEdit" :disabled="saving">Cancel</button>
                <div v-if="saveError" class="error">{{ saveError }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  orgKey: { type: String, required: true }, // numeric id or slug
  client: { type: Object, required: true },
  clientLabelMode: { type: String, default: 'codes' } // 'codes' | 'initials'
});

const emit = defineEmits(['close', 'saved']);

const loading = ref(false);
const error = ref('');
const note = ref(null); // { id, message, created_at, author_name }

const editing = ref(false);
const unlocked = ref(false);
const unlockText = ref('');
const draft = ref('');
const saving = ref(false);
const saveError = ref('');

const clientLabel = computed(() => {
  const initials = String(props.client?.initials || '').replace(/\s+/g, '').toUpperCase();
  const code = String(props.client?.identifier_code || '').replace(/\s+/g, '').toUpperCase();
  if (props.clientLabelMode === 'initials') return initials || code || '—';
  return code || initials || '—';
});

const formatWhen = (ts) => {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || '');
  }
};

const load = async () => {
  const clientId = Number(props.client?.id || 0);
  if (!props.orgKey || !clientId) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get(`/school-portal/${encodeURIComponent(props.orgKey)}/clients/${clientId}/waitlist-note`);
    note.value = r.data?.note || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load waitlist note';
    note.value = null;
  } finally {
    loading.value = false;
  }
};

const beginEdit = () => {
  editing.value = true;
  unlocked.value = false;
  unlockText.value = '';
  draft.value = String(note.value?.message || '');
  saveError.value = '';
};

const cancelEdit = () => {
  editing.value = false;
  unlocked.value = false;
  unlockText.value = '';
  draft.value = '';
  saveError.value = '';
};

const tryUnlock = () => {
  if (String(unlockText.value || '').trim().toLowerCase() !== 'edit') return;
  unlocked.value = true;
};

const save = async () => {
  const clientId = Number(props.client?.id || 0);
  if (!props.orgKey || !clientId) return;
  const msg = String(draft.value || '').trim();
  if (!msg) return;
  saving.value = true;
  saveError.value = '';
  try {
    const r = await api.put(`/school-portal/${encodeURIComponent(props.orgKey)}/clients/${clientId}/waitlist-note`, {
      message: msg
    });
    note.value = r.data?.note || null;
    editing.value = false;
    unlocked.value = false;
    unlockText.value = '';
    draft.value = '';
    saveError.value = '';
    emit('saved', note.value);
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || 'Failed to save waitlist note';
  } finally {
    saving.value = false;
  }
};

watch(
  () => props.client?.id,
  () => {
    cancelEdit();
    load();
  }
);

onMounted(load);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.modal {
  width: 720px;
  max-width: 96vw;
  max-height: 92vh;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  font-size: 12px;
  color: var(--text-secondary);
}

.sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  gap: 6px;
  align-items: center;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-weight: 800;
}

.modal-body {
  flex: 1;
  min-height: 0;
  padding: 12px 14px;
  overflow: auto;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.read-panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg);
}

.read-text {
  white-space: pre-wrap;
  line-height: 1.35;
}

.edit-panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg);
}

.warn {
  font-weight: 800;
  margin-bottom: 10px;
}

.input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: white;
  color: var(--text-primary);
}

.unlock-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: white;
  color: var(--text-primary);
  resize: vertical;
}

.edit-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.muted {
  color: var(--text-secondary);
}
.muted-small {
  color: var(--text-secondary);
  font-size: 12px;
}
.error {
  color: #c33;
  font-weight: 700;
}
</style>

