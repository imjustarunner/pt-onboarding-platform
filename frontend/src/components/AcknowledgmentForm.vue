<template>
  <div class="acknowledgment-form">
    <div v-if="!acknowledged" class="acknowledgment-content">
      <h3>{{ content.title || 'Acknowledgment Required' }}</h3>
      <p v-if="content.description" class="acknowledgment-description">
        {{ content.description }}
      </p>
      <div class="acknowledgment-checkbox">
        <label>
          <input
            type="checkbox"
            v-model="checked"
            :disabled="saving"
          />
          <span>{{ content.checkboxText || 'I acknowledge and understand the information provided.' }}</span>
        </label>
      </div>
      <button
        @click="submitAcknowledgment"
        class="btn btn-primary"
        :disabled="!checked || saving"
      >
        {{ saving ? 'Saving...' : 'Acknowledge' }}
      </button>
    </div>
    <div v-else class="acknowledgment-complete">
      <div class="success-icon">✓</div>
      <p>Acknowledged on {{ formatDate(acknowledgmentDate) }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../services/api';

const props = defineProps({
  moduleId: {
    type: [String, Number],
    required: true
  },
  content: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['acknowledged']);

const checked = ref(false);
const acknowledged = ref(false);
const saving = ref(false);
const acknowledgmentDate = ref(null);

const checkAcknowledgment = async () => {
  try {
    const response = await api.get(`/acknowledgments/${props.moduleId}`);
    if (response.data.acknowledged) {
      acknowledged.value = true;
      // Get full details
      const detailsResponse = await api.get(`/acknowledgments/${props.moduleId}/details`);
      acknowledgmentDate.value = detailsResponse.data.acknowledged_at;
      emit('acknowledged');
    }
  } catch (error) {
    // Not acknowledged yet
  }
};

const submitAcknowledgment = async () => {
  if (!checked.value) return;
  
  try {
    saving.value = true;
    await api.post('/acknowledgments', {
      moduleId: parseInt(props.moduleId)
    });
    acknowledged.value = true;
    acknowledgmentDate.value = new Date().toISOString();
    emit('acknowledged');
  } catch (error) {
    alert(error.response?.data?.error?.message || 'Failed to save acknowledgment');
  } finally {
    saving.value = false;
  }
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString();
};

onMounted(() => {
  checkAcknowledgment();
});
</script>

<style scoped>
.acknowledgment-form {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.acknowledgment-content h3 {
  margin-bottom: 15px;
  color: #1e293b;
}

.acknowledgment-description {
  margin-bottom: 20px;
  color: #64748b;
  line-height: 1.6;
}

.acknowledgment-checkbox {
  margin-bottom: 20px;
  padding: 15px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.acknowledgment-checkbox label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}

.acknowledgment-checkbox input[type="checkbox"] {
  margin-top: 3px;
  cursor: pointer;
}

.acknowledgment-checkbox span {
  flex: 1;
  line-height: 1.6;
}

.acknowledgment-complete {
  text-align: center;
  padding: 20px;
}

.success-icon {
  font-size: 48px;
  color: #10b981;
  margin-bottom: 10px;
}

.acknowledgment-complete p {
  color: #64748b;
  margin: 0;
}
</style>

