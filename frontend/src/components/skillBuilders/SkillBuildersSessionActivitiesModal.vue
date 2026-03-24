<template>
  <div v-if="show" class="sb-sa-modal-backdrop" role="dialog" aria-modal="true" @click.self="emit('close')">
    <div class="sb-sa-modal" @click.stop>
      <h4 class="sb-sa-modal-title">{{ isProgramLibraryMode ? 'Activities for this PDF' : 'Session activities' }}</h4>
      <p v-if="subtitleLine" class="muted small sb-sa-sub">{{ subtitleLine }}</p>
      <p class="muted small sb-sa-lead">
        <template v-if="isProgramLibraryMode">
          When this PDF is attached to a session, these labels appear as checkboxes in Clinical Aid (H2014). Only checked
          activities are sent to the note writer.
        </template>
        <template v-else>
          These labels appear as checkboxes in Clinical Aid (H2014). Only checked activities are sent to the note writer so it
          does not describe work that was not done.
        </template>
      </p>
      <div v-if="loading" class="muted">Loading…</div>
      <ul v-else class="sb-sa-list">
        <li v-for="a in rows" :key="a.id" class="sb-sa-li">
          <template v-if="editingId === a.id">
            <input v-model="editDraft" class="input input-sm sb-sa-edit-inp" maxlength="255" @keydown.enter.prevent="saveEdit" />
            <div class="sb-sa-edit-actions">
              <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="saveEdit">Save</button>
              <button type="button" class="btn btn-link btn-sm" @click="cancelEdit">Cancel</button>
            </div>
          </template>
          <template v-else>
            <span class="sb-sa-label">{{ a.label }}</span>
            <div v-if="canManage" class="sb-sa-row-actions">
              <button type="button" class="btn btn-link btn-sm" @click="startEdit(a)">Edit</button>
              <button
                type="button"
                class="btn btn-link btn-sm sb-sa-del"
                :disabled="deletingId === a.id"
                @click="remove(a)"
              >
                {{ deletingId === a.id ? '…' : 'Remove' }}
              </button>
            </div>
          </template>
        </li>
      </ul>
      <div v-if="canManage" class="sb-sa-add">
        <input
          v-model="newLabel"
          class="input"
          maxlength="255"
          placeholder="New activity label"
          @keyup.enter="add"
        />
        <button type="button" class="btn btn-primary btn-sm" :disabled="adding || !newLabel.trim()" @click="add">
          {{ adding ? 'Adding…' : 'Add' }}
        </button>
      </div>
      <div class="sb-sa-footer">
        <button type="button" class="btn btn-secondary btn-sm" @click="emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  show: { type: Boolean, default: false },
  agencyId: { type: Number, required: true },
  /** Session-scoped mode */
  eventId: { type: Number, default: 0 },
  sessionId: { type: Number, default: 0 },
  sessionLabel: { type: String, default: '' },
  /** Program library PDF mode (Step 1 list) */
  programOrganizationId: { type: Number, default: 0 },
  programDocumentId: { type: Number, default: 0 },
  documentLabel: { type: String, default: '' },
  canManage: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'updated']);

const isProgramLibraryMode = computed(
  () => Number(props.programDocumentId) > 0 && Number(props.programOrganizationId) > 0
);

const subtitleLine = computed(() => {
  if (isProgramLibraryMode.value) return props.documentLabel || '';
  return props.sessionLabel || '';
});

const loading = ref(false);
const rows = ref([]);
const newLabel = ref('');
const adding = ref(false);
const deletingId = ref(null);
const editingId = ref(null);
const editDraft = ref('');
const saving = ref(false);

async function load() {
  loading.value = true;
  try {
    if (isProgramLibraryMode.value) {
      const pid = Number(props.programOrganizationId);
      const did = Number(props.programDocumentId);
      const aid = Number(props.agencyId);
      if (!aid || !pid || !did) {
        rows.value = [];
        return;
      }
      const res = await api.get(
        `/skill-builders/program-organizations/${pid}/program-documents/${did}/activity-options`,
        { params: { agencyId: aid }, skipGlobalLoading: true }
      );
      rows.value = Array.isArray(res.data?.options) ? res.data.options : [];
      return;
    }
    if (!props.agencyId || !props.eventId || !props.sessionId) {
      rows.value = [];
      return;
    }
    const res = await api.get(`/skill-builders/events/${props.eventId}/activity-options`, {
      params: { agencyId: props.agencyId, sessionId: props.sessionId },
      skipGlobalLoading: true
    });
    rows.value = Array.isArray(res.data?.options) ? res.data.options : [];
  } catch {
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => [
    props.show,
    props.eventId,
    props.agencyId,
    props.sessionId,
    props.programOrganizationId,
    props.programDocumentId
  ],
  ([open]) => {
    if (open) {
      newLabel.value = '';
      editingId.value = null;
      void load();
    }
  },
  { immediate: true }
);

function startEdit(a) {
  editingId.value = Number(a.id);
  editDraft.value = String(a.label || '');
}

function cancelEdit() {
  editingId.value = null;
  editDraft.value = '';
}

async function saveEdit() {
  const id = editingId.value;
  const label = String(editDraft.value || '').trim();
  if (!id || !label || !props.agencyId) return;
  saving.value = true;
  try {
    if (isProgramLibraryMode.value) {
      await api.patch(
        `/skill-builders/program-organizations/${props.programOrganizationId}/program-documents/${props.programDocumentId}/activity-options/${id}`,
        { agencyId: props.agencyId, label }
      );
    } else {
      await api.patch(`/skill-builders/events/${props.eventId}/activity-options/${id}`, {
        agencyId: props.agencyId,
        label
      });
    }
    cancelEdit();
    await load();
    emit('updated');
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Update failed');
  } finally {
    saving.value = false;
  }
}

async function add() {
  const label = String(newLabel.value || '').trim();
  if (!label || !props.agencyId) return;
  if (isProgramLibraryMode.value) {
    if (!props.programOrganizationId || !props.programDocumentId) return;
  } else {
    if (!props.eventId || !props.sessionId) return;
  }
  adding.value = true;
  try {
    if (isProgramLibraryMode.value) {
      await api.post(
        `/skill-builders/program-organizations/${props.programOrganizationId}/program-documents/${props.programDocumentId}/activity-options`,
        { agencyId: props.agencyId, label }
      );
    } else {
      await api.post(`/skill-builders/events/${props.eventId}/activity-options`, {
        agencyId: props.agencyId,
        label,
        sessionId: props.sessionId
      });
    }
    newLabel.value = '';
    await load();
    emit('updated');
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed to add');
  } finally {
    adding.value = false;
  }
}

async function remove(a) {
  const id = Number(a?.id);
  if (!id || !props.agencyId) return;
  if (!window.confirm('Remove this activity?')) return;
  deletingId.value = id;
  try {
    if (isProgramLibraryMode.value) {
      await api.delete(
        `/skill-builders/program-organizations/${props.programOrganizationId}/program-documents/${props.programDocumentId}/activity-options/${id}`,
        { params: { agencyId: props.agencyId }, skipGlobalLoading: true }
      );
    } else {
      await api.delete(`/skill-builders/events/${props.eventId}/activity-options/${id}`, {
        params: { agencyId: props.agencyId },
        skipGlobalLoading: true
      });
    }
    await load();
    emit('updated');
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed to remove');
  } finally {
    deletingId.value = null;
  }
}
</script>

<style scoped>
.sb-sa-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 12050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.sb-sa-modal {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  max-width: 520px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}
.sb-sa-modal-title {
  margin: 0 0 6px;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--primary, #0f766e);
}
.sb-sa-sub {
  margin: 0 0 8px;
}
.sb-sa-lead {
  margin: 0 0 12px;
  line-height: 1.45;
}
.sb-sa-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  max-height: 280px;
  overflow: auto;
}
.sb-sa-li {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  font-size: 0.9rem;
}
.sb-sa-li:last-child {
  border-bottom: none;
}
.sb-sa-label {
  flex: 1;
  min-width: 0;
}
.sb-sa-row-actions {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
}
.sb-sa-del {
  color: #b91c1c;
}
.sb-sa-edit-inp {
  flex: 1;
  min-width: 0;
}
.sb-sa-edit-actions {
  display: flex;
  gap: 6px;
  width: 100%;
  margin-top: 6px;
}
.sb-sa-add {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.sb-sa-add .input {
  flex: 1;
  min-width: 160px;
}
.sb-sa-footer {
  display: flex;
  justify-content: flex-end;
}
.muted {
  color: var(--text-secondary, #64748b);
}
</style>
