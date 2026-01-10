<template>
  <div class="user-information-tab">
    <div class="tab-header">
      <h2>User Information</h2>
      <button @click="saveAll" class="btn btn-primary" :disabled="saving">
        {{ saving ? 'Saving...' : 'Save All' }}
      </button>
    </div>
    
    <div v-if="loading" class="loading">Loading user information...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else>
      <!-- Platform-Level Fields -->
      <div v-if="platformFields.length > 0" class="fields-section">
        <h3>Platform Information</h3>
        <div class="fields-grid">
          <div v-for="field in platformFields" :key="field.id" class="field-item">
            <label :for="`field-${field.id}`">
              {{ field.field_label }}
              <span v-if="field.is_required" class="required-asterisk">*</span>
            </label>
            <input
              v-if="field.field_type === 'text' || field.field_type === 'email' || field.field_type === 'phone'"
              :id="`field-${field.id}`"
              :type="field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'"
              :value="getFieldValue(field.id)"
              @input="updateFieldValue(field.id, $event.target.value)"
              :required="field.is_required"
            />
            <input
              v-else-if="field.field_type === 'number'"
              :id="`field-${field.id}`"
              type="number"
              :value="getFieldValue(field.id)"
              @input="updateFieldValue(field.id, $event.target.value)"
              :required="field.is_required"
            />
            <input
              v-else-if="field.field_type === 'date'"
              :id="`field-${field.id}`"
              type="date"
              :value="getFieldValue(field.id)"
              @input="updateFieldValue(field.id, $event.target.value)"
              :required="field.is_required"
            />
            <textarea
              v-else-if="field.field_type === 'textarea'"
              :id="`field-${field.id}`"
              :value="getFieldValue(field.id)"
              @input="updateFieldValue(field.id, $event.target.value)"
              :required="field.is_required"
            ></textarea>
            <select
              v-else-if="field.field_type === 'select'"
              :id="`field-${field.id}`"
              :value="getFieldValue(field.id)"
              @change="updateFieldValue(field.id, $event.target.value)"
              :required="field.is_required"
            >
              <option value="">Select an option</option>
              <option v-for="option in (field.options || [])" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
            <div v-else-if="field.field_type === 'boolean'" class="checkbox-wrapper">
              <input
                :id="`field-${field.id}`"
                type="checkbox"
                :checked="getFieldValue(field.id) === 'true' || getFieldValue(field.id) === true"
                @change="updateFieldValue(field.id, $event.target.checked ? 'true' : 'false')"
              />
              <label :for="`field-${field.id}`" class="checkbox-label">Yes</label>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Agency-Level Fields (grouped by agency) -->
      <div v-for="agency in agenciesWithFields" :key="agency.id" class="fields-section">
        <h3>{{ agency.name }} Information</h3>
        <div class="fields-grid">
          <div v-for="field in agency.fields" :key="field.id" class="field-item">
            <label :for="`field-${field.id}`">
              {{ field.field_label }}
              <span v-if="field.is_required" class="required-asterisk">*</span>
            </label>
            <input
              v-if="field.field_type === 'text' || field.field_type === 'email' || field.field_type === 'phone'"
              :id="`field-${field.id}`"
              :type="field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'"
              :value="getFieldValue(field.id)"
              @input="updateFieldValue(field.id, $event.target.value)"
              :required="field.is_required"
            />
            <input
              v-else-if="field.field_type === 'number'"
              :id="`field-${field.id}`"
              type="number"
              :value="getFieldValue(field.id)"
              @input="updateFieldValue(field.id, $event.target.value)"
              :required="field.is_required"
            />
            <input
              v-else-if="field.field_type === 'date'"
              :id="`field-${field.id}`"
              type="date"
              :value="getFieldValue(field.id)"
              @input="updateFieldValue(field.id, $event.target.value)"
              :required="field.is_required"
            />
            <textarea
              v-else-if="field.field_type === 'textarea'"
              :id="`field-${field.id}`"
              :value="getFieldValue(field.id)"
              @input="updateFieldValue(field.id, $event.target.value)"
              :required="field.is_required"
            ></textarea>
            <select
              v-else-if="field.field_type === 'select'"
              :id="`field-${field.id}`"
              :value="getFieldValue(field.id)"
              @change="updateFieldValue(field.id, $event.target.value)"
              :required="field.is_required"
            >
              <option value="">Select an option</option>
              <option v-for="option in (field.options || [])" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
            <div v-else-if="field.field_type === 'boolean'" class="checkbox-wrapper">
              <input
                :id="`field-${field.id}`"
                type="checkbox"
                :checked="getFieldValue(field.id) === 'true' || getFieldValue(field.id) === true"
                @change="updateFieldValue(field.id, $event.target.checked ? 'true' : 'false')"
              />
              <label :for="`field-${field.id}`" class="checkbox-label">Yes</label>
            </div>
          </div>
        </div>
      </div>
      
      <div v-if="platformFields.length === 0 && agenciesWithFields.length === 0" class="empty-state">
        <p>No information fields configured for this user.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  userId: {
    type: Number,
    required: true
  }
});

const loading = ref(true);
const error = ref('');
const fields = ref([]);
const fieldValues = ref({});
const saving = ref(false);

const platformFields = computed(() => {
  return fields.value.filter(f => f.is_platform_template && !f.agency_id);
});

const agenciesWithFields = computed(() => {
  const agenciesMap = new Map();
  
  fields.value
    .filter(f => f.agency_id)
    .forEach(field => {
      if (!agenciesMap.has(field.agency_id)) {
        agenciesMap.set(field.agency_id, {
          id: field.agency_id,
          name: field.agency_name || `Agency ${field.agency_id}`,
          fields: []
        });
      }
      agenciesMap.get(field.agency_id).fields.push(field);
    });
  
  return Array.from(agenciesMap.values());
});

const fetchUserInfo = async () => {
  try {
    loading.value = true;
    const response = await api.get(`/users/${props.userId}/user-info`);
    fields.value = response.data;
    
    // Build values map
    const valuesMap = {};
    fields.value.forEach(field => {
      valuesMap[field.id] = field.value || '';
    });
    fieldValues.value = valuesMap;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load user information';
  } finally {
    loading.value = false;
  }
};

const getFieldValue = (fieldId) => {
  return fieldValues.value[fieldId] || '';
};

const updateFieldValue = (fieldId, value) => {
  fieldValues.value[fieldId] = value;
};


const saveAll = async () => {
  try {
    saving.value = true;
    
    const values = Object.keys(fieldValues.value).map(fieldId => ({
      fieldDefinitionId: parseInt(fieldId),
      value: fieldValues.value[fieldId] || null
    }));
    
    await api.post(`/users/${props.userId}/user-info`, { values });
    
    // Show success message
    alert('User information saved successfully!');
    await fetchUserInfo();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to save user information';
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  fetchUserInfo();
});
</script>

<style scoped>
.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.tab-header h2 {
  margin: 0;
  color: var(--text-primary);
}

.fields-section {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.fields-section:last-child {
  border-bottom: none;
}

.fields-section h3 {
  margin: 0 0 20px 0;
  color: var(--text-primary);
  font-size: 18px;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

.field-item {
  display: flex;
  flex-direction: column;
}

.field-item label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary);
}

.required-asterisk {
  color: #dc2626;
  margin-left: 4px;
}

.field-item input,
.field-item select,
.field-item textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
}

.field-item input[type="date"] {
  padding: 10px;
}

.field-item input[type="checkbox"] {
  width: auto;
  margin-top: 4px;
}

.field-item textarea {
  resize: vertical;
  min-height: 100px;
}

.field-item select {
  cursor: pointer;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-wrapper input[type="checkbox"] {
  width: auto;
  margin: 0;
}

.checkbox-label {
  margin: 0;
  font-weight: normal;
  cursor: pointer;
}
</style>

