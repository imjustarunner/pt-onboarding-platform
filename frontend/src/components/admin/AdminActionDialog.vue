<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <h2>{{ actionTitle }}</h2>
      <div class="action-details">
        <p><strong>User:</strong> {{ user.firstName }} {{ user.lastName }} ({{ user.email }})</p>
        <p v-if="track"><strong>Track:</strong> {{ track.trackName }}</p>
        <p v-if="module"><strong>Module:</strong> {{ module.moduleTitle }}</p>
      </div>

      <div class="warning-box" v-if="isDestructive">
        <strong>⚠️ Warning:</strong> This action will {{ actionDescription }}. This cannot be undone.
      </div>

      <div class="info-box" v-else>
        <strong>ℹ️ Info:</strong> {{ actionDescription }}
      </div>

      <div v-if="affectedItems.length > 0" class="affected-items">
        <h4>This will affect:</h4>
        <ul>
          <li v-for="item in affectedItems" :key="item.id">{{ item.name }}</li>
        </ul>
      </div>

      <div class="modal-actions">
        <button type="button" @click="$emit('close')" class="btn btn-secondary">Cancel</button>
        <button 
          type="button" 
          @click="handleConfirm" 
          class="btn" 
          :class="isDestructive ? 'btn-danger' : 'btn-success'"
          :disabled="processing"
        >
          {{ processing ? 'Processing...' : confirmButtonText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  action: {
    type: String,
    required: true
  },
  user: {
    type: Object,
    required: true
  },
  track: {
    type: Object,
    default: null
  },
  module: {
    type: Object,
    default: null
  },
  agencyId: {
    type: Number,
    required: true
  }
});

const emit = defineEmits(['confirm', 'close']);

const processing = ref(false);

const actionTitle = computed(() => {
  const titles = {
    'reset-module': 'Reset Module',
    'reset-track': 'Reset Track',
    'mark-module-complete': 'Mark Module Complete',
    'mark-track-complete': 'Mark Track Complete'
  };
  return titles[props.action] || 'Admin Action';
});

const actionDescription = computed(() => {
  const descriptions = {
    'reset-module': 'reset this module\'s progress, clear all quiz attempts, and reset time spent',
    'reset-track': 'reset all modules in this track, clear all quiz attempts, and reset time spent',
    'mark-module-complete': 'manually mark this module as complete',
    'mark-track-complete': 'manually mark all modules in this track as complete'
  };
  return descriptions[props.action] || 'perform this action';
});

const isDestructive = computed(() => {
  return props.action.startsWith('reset');
});

const confirmButtonText = computed(() => {
  if (props.action === 'reset-module') return 'Reset Module';
  if (props.action === 'reset-track') return 'Reset Track';
  if (props.action === 'mark-module-complete') return 'Mark Complete';
  if (props.action === 'mark-track-complete') return 'Mark Track Complete';
  return 'Confirm';
});

const affectedItems = computed(() => {
  const items = [];
  if (props.module) {
    items.push({ id: props.module.moduleId, name: props.module.moduleTitle });
  }
  if (props.track && props.track.modules) {
    if (props.action === 'reset-track' || props.action === 'mark-track-complete') {
      props.track.modules.forEach(m => {
        items.push({ id: m.moduleId, name: m.moduleTitle });
      });
    }
  }
  return items;
});

const handleConfirm = async () => {
  try {
    processing.value = true;
    
    let endpoint = '';
    let payload = {
      userId: props.user.id,
      agencyId: props.agencyId
    };

    if (props.action === 'reset-module') {
      endpoint = '/admin-actions/reset-module';
      payload.moduleId = props.module.moduleId;
    } else if (props.action === 'reset-track') {
      endpoint = '/admin-actions/reset-track';
      payload.trackId = props.track.trackId;
    } else if (props.action === 'mark-module-complete') {
      endpoint = '/admin-actions/mark-module-complete';
      payload.moduleId = props.module.moduleId;
    } else if (props.action === 'mark-track-complete') {
      endpoint = '/admin-actions/mark-track-complete';
      payload.trackId = props.track.trackId;
    }

    await api.post(endpoint, payload);
    emit('confirm');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to perform action');
  } finally {
    processing.value = false;
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  box-shadow: var(--shadow-lg);
}

.modal-content h2 {
  margin-top: 0;
  margin-bottom: 20px;
  color: var(--text-primary);
}

.action-details {
  margin-bottom: 20px;
  padding: 15px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.action-details p {
  margin: 8px 0;
  color: var(--text-primary);
}

.warning-box {
  background: #fee2e2;
  border: 2px solid #fca5a5;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
  color: #991b1b;
}

.info-box {
  background: #dbeafe;
  border: 2px solid #93c5fd;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
  color: #1e40af;
}

.affected-items {
  margin-bottom: 20px;
  padding: 15px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.affected-items h4 {
  margin-top: 0;
  margin-bottom: 10px;
  color: var(--text-primary);
}

.affected-items ul {
  margin: 0;
  padding-left: 20px;
  color: var(--text-secondary);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}
</style>

