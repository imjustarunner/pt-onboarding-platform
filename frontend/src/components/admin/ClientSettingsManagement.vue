<template>
  <div class="catalog-wrap">
    <div class="header-row">
      <div>
        <h2 style="margin:0;">Client Settings</h2>
        <p class="hint">These lists are agency-scoped and drive validation, imports, and filtering.</p>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <button
          class="btn btn-secondary"
          type="button"
          @click="showJobsModal = true"
          :disabled="!currentAgencyId"
          title="View and rollback recent preview jobs"
        >
          Recent preview jobs…
        </button>
        <div class="agency-pill" v-if="currentAgencyName">
          {{ currentAgencyName }}
        </div>
      </div>
    </div>

    <div class="tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        class="tab"
        :class="{ active: activeTab === t.id }"
        @click="activeTab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="error" class="error-message">{{ error }}</div>

    <div v-if="loading" class="loading">Loading…</div>

    <div v-else class="panel">
      <div class="add-row">
        <input v-model="newItem.display_name" placeholder="New name" />
        <input v-model="newItem.description" placeholder="Description (optional)" />
        <button class="btn btn-primary" type="button" @click="createItem" :disabled="saving || !newItem.display_name">
          Add
        </button>
      </div>

      <div class="table">
        <div class="thead">
          <div>Name</div>
          <div>Description</div>
          <div style="text-align:center;">Active</div>
          <div></div>
        </div>
        <div v-for="item in items" :key="item.id" class="trow">
          <div>
            <input v-model="item.display_name" />
          </div>
          <div>
            <input v-model="item.description" placeholder="(none)" />
          </div>
          <div style="text-align:center;">
            <input type="checkbox" v-model="item.is_active" />
          </div>
          <div style="text-align:right;">
            <button class="btn btn-secondary" type="button" @click="saveItem(item)" :disabled="saving">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>

    <RecentBulkImportJobsModal
      v-if="showJobsModal && currentAgencyId"
      :agency-id="currentAgencyId"
      :agency-name="currentAgencyName"
      @close="showJobsModal = false"
      @rolled-back="() => {}"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import RecentBulkImportJobsModal from './RecentBulkImportJobsModal.vue';

const agencyStore = useAgencyStore();
const loading = ref(false);
const saving = ref(false);
const error = ref('');

const tabs = [
  { id: 'client_statuses', label: 'Client Statuses' },
  { id: 'paperwork_statuses', label: 'Paperwork Statuses' },
  { id: 'paperwork_deliveries', label: 'Paperwork Delivery' },
  { id: 'insurances', label: 'Insurance Options' }
];

const activeTab = ref('client_statuses');
const items = ref([]);
const newItem = ref({ display_name: '', description: '' });
const showJobsModal = ref(false);

const currentAgencyId = computed(() => agencyStore.currentAgency?.id || null);
const currentAgencyName = computed(() => agencyStore.currentAgency?.name || '');

const load = async () => {
  if (!currentAgencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/settings-catalogs/${currentAgencyId.value}/${activeTab.value}`);
    items.value = (resp.data || []).map(r => ({
      ...r,
      is_active: !!r.is_active
    }));
  } catch (e) {
    console.error(e);
    error.value = e.response?.data?.error?.message || 'Failed to load settings catalog';
  } finally {
    loading.value = false;
  }
};

const createItem = async () => {
  if (!currentAgencyId.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/settings-catalogs/${currentAgencyId.value}/${activeTab.value}`, {
      display_name: newItem.value.display_name,
      description: newItem.value.description,
      is_active: true
    });
    newItem.value = { display_name: '', description: '' };
    await load();
  } catch (e) {
    console.error(e);
    error.value = e.response?.data?.error?.message || 'Failed to create item';
  } finally {
    saving.value = false;
  }
};

const saveItem = async (item) => {
  if (!currentAgencyId.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.put(`/settings-catalogs/${currentAgencyId.value}/${activeTab.value}/${item.id}`, {
      display_name: item.display_name,
      description: item.description,
      is_active: !!item.is_active
    });
  } catch (e) {
    console.error(e);
    error.value = e.response?.data?.error?.message || 'Failed to save item';
  } finally {
    saving.value = false;
  }
};

onMounted(load);
watch([activeTab, currentAgencyId], load);
</script>

<style scoped>
.catalog-wrap {
  width: 100%;
}
.header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.hint {
  margin: 6px 0 0;
  color: var(--text-secondary);
}
.agency-pill {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  padding: 6px 10px;
  border-radius: 999px;
  color: var(--text-secondary);
  font-weight: 600;
}
.tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0 16px;
}
.tab {
  border: 1px solid var(--border);
  background: white;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-primary);
}
.tab.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(0,0,0,0.03);
}
.panel {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.add-row {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
}
input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
}
.table {
  display: grid;
  gap: 8px;
}
.thead, .trow {
  display: grid;
  grid-template-columns: 1fr 2fr 100px 120px;
  gap: 10px;
  align-items: center;
}
.thead {
  font-weight: 700;
  color: var(--text-secondary);
  padding: 0 6px 8px;
}
.trow {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
}
.loading {
  color: var(--text-secondary);
}
.error-message {
  background: #fee;
  color: #c33;
  padding: 12px 16px;
  border-radius: 8px;
  margin: 12px 0;
  border: 1px solid #fcc;
}
.btn {
  padding: 10px 14px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
}
.btn-primary {
  background: var(--primary);
  color: white;
}
.btn-secondary {
  background: white;
  border: 1px solid var(--border);
  color: var(--text-primary);
}
</style>

