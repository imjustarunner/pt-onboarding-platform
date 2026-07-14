<template>
  <div class="insurance-definitions-panel">
    <div class="panel-header">
      <div>
        <h3>Payer Credentialing</h3>
        <p class="hint" style="margin: 4px 0 0;">
          Configure payers agency-wide: logo, contacts, and call history. Each payer can be attached to a provider with Create credential.
        </p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="fetchDefinitions">
        Refresh
      </button>
    </div>

    <div v-if="!agencyId" class="muted" style="margin-top: 12px;">Select an agency to manage payer credentialing.</div>
    <div v-else-if="loading" class="loading" style="margin-top: 12px;">Loading payers…</div>
    <div v-else-if="error" class="error" style="margin-top: 12px;">{{ error }}</div>

    <template v-else-if="agencyId">
      <form class="add-form" @submit.prevent="addDefinition">
        <div class="form-group" style="margin: 0;">
          <label for="new-insurance-name">Add payer</label>
          <div class="add-row">
            <input
              id="new-insurance-name"
              v-model.trim="newName"
              type="text"
              placeholder="e.g. Aetna, Medicaid, First Health"
              :disabled="adding"
            />
            <button class="btn btn-primary btn-sm" type="submit" :disabled="adding || !newName">
              {{ adding ? 'Adding…' : 'Add' }}
            </button>
          </div>
        </div>
        <div v-if="addError" class="error" style="margin-top: 8px;">{{ addError }}</div>
      </form>

      <div v-if="definitions.length === 0" class="empty-state muted" style="margin-top: 14px;">
        No payers yet. Add one above to enable per-provider credentialing.
      </div>

      <div v-else class="definition-list">
        <details
          v-for="def in definitions"
          :key="def.id"
          class="definition-item"
          :open="expandedId === def.id"
          @toggle="onToggle(def, $event)"
        >
          <summary class="definition-summary">
            <img v-if="logoUrl(def)" :src="logoUrl(def)" :alt="def.name" class="summary-logo" />
            <span v-else class="summary-logo summary-logo--placeholder">{{ def.name.slice(0, 1) }}</span>
            <span class="definition-name">{{ def.name }}</span>
            <div class="item-actions" @click.stop>
              <button class="btn btn-secondary btn-sm" type="button" @click="startEdit(def)">Rename</button>
              <button class="btn btn-danger btn-sm" type="button" :disabled="deletingId === def.id" @click="removeDefinition(def)">
                {{ deletingId === def.id ? 'Removing…' : 'Remove' }}
              </button>
            </div>
          </summary>
          <div v-if="editingId === def.id" class="rename-row">
            <input v-model.trim="editName" type="text" class="edit-input" :disabled="savingId === def.id" />
            <button class="btn btn-primary btn-sm" type="button" :disabled="savingId === def.id || !editName" @click="saveEdit(def)">Save</button>
            <button class="btn btn-secondary btn-sm" type="button" :disabled="savingId === def.id" @click="cancelEdit">Cancel</button>
          </div>
          <div v-if="itemErrors[def.id]" class="error" style="margin: 6px 0;">{{ itemErrors[def.id] }}</div>
          <InsuranceDefinitionDetail
            v-if="expandedId === def.id"
            :agency-id="agencyId"
            :definition="def"
            @updated="fetchDefinitions"
          />
        </details>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import InsuranceDefinitionDetail from './InsuranceDefinitionDetail.vue';

const props = defineProps({
  agencyId: { type: Number, default: null }
});

const emit = defineEmits(['changed']);

const definitions = ref([]);
const loading = ref(false);
const error = ref('');
const newName = ref('');
const adding = ref(false);
const addError = ref('');
const editingId = ref(null);
const editName = ref('');
const savingId = ref(null);
const deletingId = ref(null);
const itemErrors = ref({});
const expandedId = ref(null);

const logoUrl = (def) => (def?.logo_path ? toUploadsUrl(def.logo_path) : '');

const onToggle = (def, event) => {
  expandedId.value = event.target.open ? def.id : null;
};

const fetchDefinitions = async () => {
  if (!props.agencyId) {
    definitions.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/agencies/${props.agencyId}/credentialing/insurances`);
    definitions.value = res.data?.insurances || [];
    emit('changed', definitions.value);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load insurance definitions';
    definitions.value = [];
  } finally {
    loading.value = false;
  }
};

const addDefinition = async () => {
  if (!props.agencyId || !newName.value) return;
  adding.value = true;
  addError.value = '';
  try {
    await api.post(`/agencies/${props.agencyId}/credentialing/insurances`, { name: newName.value });
    newName.value = '';
    await fetchDefinitions();
  } catch (e) {
    addError.value = e.response?.data?.error?.message || 'Failed to add insurance definition';
  } finally {
    adding.value = false;
  }
};

const startEdit = (def) => {
  editingId.value = def.id;
  editName.value = def.name || '';
  itemErrors.value = { ...itemErrors.value, [def.id]: '' };
};

const cancelEdit = () => {
  editingId.value = null;
  editName.value = '';
};

const saveEdit = async (def) => {
  if (!props.agencyId || !def?.id || !editName.value) return;
  savingId.value = def.id;
  itemErrors.value = { ...itemErrors.value, [def.id]: '' };
  try {
    await api.patch(`/agencies/${props.agencyId}/credentialing/insurances/${def.id}`, { name: editName.value });
    editingId.value = null;
    editName.value = '';
    await fetchDefinitions();
  } catch (e) {
    itemErrors.value = {
      ...itemErrors.value,
      [def.id]: e.response?.data?.error?.message || 'Failed to save insurance definition'
    };
  } finally {
    savingId.value = null;
  }
};

const removeDefinition = async (def) => {
  if (!props.agencyId || !def?.id) return;
  if (!confirm(`Remove "${def.name}"? Existing provider credentialing rows for this insurance will also be removed.`)) return;
  deletingId.value = def.id;
  itemErrors.value = { ...itemErrors.value, [def.id]: '' };
  try {
    await api.delete(`/agencies/${props.agencyId}/credentialing/insurances/${def.id}`);
    if (editingId.value === def.id) cancelEdit();
    if (expandedId.value === def.id) expandedId.value = null;
    await fetchDefinitions();
  } catch (e) {
    itemErrors.value = {
      ...itemErrors.value,
      [def.id]: e.response?.data?.error?.message || 'Failed to remove insurance definition'
    };
  } finally {
    deletingId.value = null;
  }
};

watch(() => props.agencyId, () => fetchDefinitions(), { immediate: true });
</script>

<style scoped>
.insurance-definitions-panel {
  padding: 4px 0 0;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.panel-header h3 {
  margin: 0;
  font-size: 1rem;
}
.add-form {
  margin-top: 14px;
}
.add-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.add-row input {
  flex: 1 1 220px;
  min-width: 180px;
}
.definition-list {
  margin: 14px 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.definition-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-alt, #fafafa);
  padding: 0 12px 12px;
}
.definition-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  cursor: pointer;
  list-style: none;
}
.definition-summary::-webkit-details-marker {
  display: none;
}
.summary-logo {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: contain;
  border: 1px solid var(--border);
  background: #fff;
  flex-shrink: 0;
}
.summary-logo--placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: var(--text-secondary);
}
.definition-name {
  font-weight: 600;
  flex: 1;
}
.item-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.rename-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.edit-input {
  flex: 1 1 220px;
  min-width: 180px;
}
</style>
