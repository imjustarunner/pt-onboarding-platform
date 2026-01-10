<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <h2>Version History: {{ template.name }}</h2>
      
      <div v-if="loading" class="loading">Loading versions...</div>
      <div v-else-if="versions.length === 0" class="empty-state">No versions found</div>
      <div v-else class="versions-list">
        <div
          v-for="version in versions"
          :key="version.id"
          class="version-item"
          :class="{ active: version.is_active }"
        >
          <div class="version-header">
            <span class="version-number">Version {{ version.version }}</span>
            <span v-if="version.is_active" class="badge badge-success">Active</span>
            <span v-else class="badge badge-secondary">Inactive</span>
          </div>
          <div class="version-meta">
            <span>Created: {{ formatDate(version.created_at) }}</span>
            <span v-if="version.created_by_user_id">By User ID: {{ version.created_by_user_id }}</span>
          </div>
          <div class="version-description">
            {{ version.description || 'No description' }}
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button @click="$emit('close')" class="btn btn-secondary">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  template: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['close']);

const versions = ref([]);
const loading = ref(true);

const fetchVersions = async () => {
  try {
    loading.value = true;
    // Fetch all versions for this template name and agency
    const params = new URLSearchParams({
      name: props.template.name
    });
    
    // Include agency_id if it's not null (platform templates have agency_id = null)
    if (props.template.agency_id !== null && props.template.agency_id !== undefined) {
      params.append('agencyId', props.template.agency_id);
    } else {
      params.append('agencyId', 'null');
    }
    
    const response = await api.get(`/document-templates/versions/history?${params.toString()}`);
    versions.value = response.data || [];
    
    // If no versions found, at least show the current template
    if (versions.value.length === 0) {
      versions.value = [{
        id: props.template.id,
        version: props.template.version,
        is_active: props.template.is_active !== false && props.template.is_active !== 0,
        created_at: props.template.created_at,
        created_by_user_id: props.template.created_by_user_id,
        description: props.template.description
      }];
    }
  } catch (err) {
    console.error('Failed to fetch versions:', err);
    // Fallback to showing just the current template
    versions.value = [{
      id: props.template.id,
      version: props.template.version,
      is_active: props.template.is_active !== false && props.template.is_active !== 0,
      created_at: props.template.created_at,
      created_by_user_id: props.template.created_by_user_id,
      description: props.template.description
    }];
  } finally {
    loading.value = false;
  }
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString();
};

onMounted(() => {
  fetchVersions();
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 700px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.versions-list {
  margin: 24px 0;
}

.version-item {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 12px;
  background: white;
}

.version-item.active {
  border-color: var(--primary);
  background: #f0f8ff;
}

.version-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.version-number {
  font-weight: 600;
  color: var(--text-primary);
}

.version-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.version-description {
  color: var(--text-secondary);
  font-size: 14px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>

