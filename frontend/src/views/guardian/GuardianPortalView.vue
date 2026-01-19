<template>
  <div class="guardian-portal">
    <div class="portal-header">
      <div class="portal-title">
        <div class="portal-name">Guardian Portal</div>
        <div class="portal-subtitle">
          Non-clinical access to docs, links, program materials, and progress.
        </div>
      </div>
      <div class="portal-actions">
        <button class="btn btn-secondary btn-sm" type="button" @click="refreshAll" :disabled="loadingClients">
          Refresh
        </button>
      </div>
    </div>

    <div class="portal-tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="tab-button"
        :class="{ active: activeTab === t.id }"
        type="button"
        @click="activeTab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <div class="portal-body">
      <div v-if="activeTab === 'clients'" class="panel">
        <div v-if="clientsError" class="error">{{ clientsError }}</div>
        <div v-else-if="loadingClients" class="loading">Loading clients…</div>
        <div v-else-if="clients.length === 0" class="empty-state">
          <p>No clients are linked to this guardian account yet.</p>
          <p class="hint">Ask your organization to add you as a guardian on the client record.</p>
        </div>
        <div v-else class="client-cards">
          <div v-for="c in clients" :key="c.client_id" class="client-card">
            <div class="client-title">
              <div class="client-initials">{{ c.initials }}</div>
              <div class="client-meta">
                <div class="client-org">{{ c.organization_name }}</div>
                <div class="client-rel">{{ c.relationship_title }}</div>
              </div>
            </div>
            <div class="client-tags">
              <span class="tag">Status: {{ formatClientStatus(c.status) }}</span>
              <span class="tag">Docs: {{ formatDocStatus(c.document_status) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'links'" class="panel">
        <UnifiedChecklistTab />
      </div>

      <div v-if="activeTab === 'documents'" class="panel">
        <DocumentsTab />
      </div>

      <div v-if="activeTab === 'progress'" class="panel">
        <TrainingFocusTab />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';
import TrainingFocusTab from '../../components/dashboard/TrainingFocusTab.vue';
import DocumentsTab from '../../components/dashboard/DocumentsTab.vue';
import UnifiedChecklistTab from '../../components/dashboard/UnifiedChecklistTab.vue';

const activeTab = ref('clients');
const tabs = [
  { id: 'clients', label: 'Clients' },
  { id: 'links', label: 'Links & Tasks' },
  { id: 'documents', label: 'Documents' },
  { id: 'progress', label: 'Progress' }
];

const clients = ref([]);
const loadingClients = ref(false);
const clientsError = ref('');

const formatDocStatus = (s) => {
  const m = { NONE: 'None', UPLOADED: 'Uploaded', APPROVED: 'Approved', REJECTED: 'Rejected' };
  return m[s] || s || '-';
};

const formatClientStatus = (s) => {
  const m = {
    PENDING_REVIEW: 'Pending review',
    ACTIVE: 'Active',
    ON_HOLD: 'On hold',
    DECLINED: 'Declined',
    ARCHIVED: 'Archived'
  };
  return m[s] || s || '-';
};

const fetchClients = async () => {
  try {
    loadingClients.value = true;
    clientsError.value = '';
    const resp = await api.get('/guardian-portal/clients');
    clients.value = resp.data || [];
  } catch (err) {
    clientsError.value = err.response?.data?.error?.message || 'Failed to load clients';
    clients.value = [];
  } finally {
    loadingClients.value = false;
  }
};

const refreshAll = async () => {
  await fetchClients();
};

onMounted(async () => {
  await fetchClients();
});
</script>

<style scoped>
.guardian-portal {
  padding: 20px;
}

.portal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.portal-name {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.portal-subtitle {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.portal-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.tab-button {
  padding: 10px 14px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.tab-button.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.portal-body .panel {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--shadow-sm);
}

.loading {
  color: var(--text-secondary);
}

.error {
  color: #b91c1c;
}

.empty-state {
  color: var(--text-secondary);
}

.hint {
  font-size: 13px;
}

.client-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.client-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-alt);
}

.client-title {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.client-initials {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: white;
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 0.5px;
}

.client-org {
  font-weight: 700;
  color: var(--text-primary);
}

.client-rel {
  font-size: 12px;
  color: var(--text-secondary);
}

.client-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag {
  font-size: 12px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 8px;
  color: var(--text-secondary);
}
</style>

