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
      <div v-if="categoryOptions.length > 1" class="category-tabs">
        <button
          v-for="cat in categoryOptions"
          :key="cat.key"
          @click="activeCategoryKey = cat.key"
          :class="['category-tab', { active: activeCategoryKey === cat.key }]"
        >
          {{ cat.label }}
        </button>
      </div>

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
            <div v-else-if="field.field_type === 'multi_select'" class="multi-select">
              <label v-for="option in (field.options || [])" :key="option" class="multi-select-option">
                <input
                  type="checkbox"
                  :checked="Array.isArray(getFieldValue(field.id)) ? getFieldValue(field.id).includes(option) : false"
                  @change="toggleMultiSelect(field.id, option)"
                />
                <span>{{ option }}</span>
              </label>
            </div>
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
            <div v-else-if="field.field_type === 'multi_select'" class="multi-select">
              <label v-for="option in (field.options || [])" :key="option" class="multi-select-option">
                <input
                  type="checkbox"
                  :checked="Array.isArray(getFieldValue(field.id)) ? getFieldValue(field.id).includes(option) : false"
                  @change="toggleMultiSelect(field.id, option)"
                />
                <span>{{ option }}</span>
              </label>
            </div>
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
        <p>No information fields found for this category.</p>
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
const categories = ref([]);
const activeCategoryKey = ref('__all');

const normalizeMultiSelectValue = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
};

const toggleMultiSelect = (fieldId, option) => {
  const current = normalizeMultiSelectValue(fieldValues.value[fieldId]);
  const exists = current.includes(option);
  const next = exists ? current.filter((x) => x !== option) : [...current, option];
  fieldValues.value[fieldId] = next;
};

const categoryOptions = computed(() => {
  const byKey = new Map((categories.value || []).map((c) => [c.category_key, c]));
  const keysFromFields = new Set((fields.value || []).map((f) => f.category_key || '__uncategorized'));

  const options = [
    { key: '__all', label: 'All' },
    ...Array.from(keysFromFields)
      .filter((k) => k !== '__all')
      .map((k) => {
        if (k === '__uncategorized') return { key: k, label: 'Uncategorized', order: 999999 };
        const c = byKey.get(k);
        return { key: k, label: c?.category_label || k, order: c?.order_index ?? 0 };
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.label).localeCompare(String(b.label)))
  ];

  return options;
});

const filteredFields = computed(() => {
  if (activeCategoryKey.value === '__all') return fields.value;
  if (activeCategoryKey.value === '__uncategorized') {
    return fields.value.filter((f) => !f.category_key);
  }
  return fields.value.filter((f) => f.category_key === activeCategoryKey.value);
});

const platformFields = computed(() => {
  return filteredFields.value.filter(f => f.is_platform_template && !f.agency_id);
});

const agenciesWithFields = computed(() => {
  const agenciesMap = new Map();
  
  filteredFields.value
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
    const [response, cats] = await Promise.all([
      api.get(`/users/${props.userId}/user-info`),
      api.get('/user-info-categories')
    ]);
    fields.value = response.data;
    categories.value = cats.data || [];
    
    // Build values map
    const valuesMap = {};
    fields.value.forEach(field => {
      if (field.field_type === 'multi_select') {
        valuesMap[field.id] = normalizeMultiSelectValue(field.value);
      } else {
        valuesMap[field.id] = field.value || '';
      }
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
      value: Array.isArray(fieldValues.value[fieldId]) ? JSON.stringify(fieldValues.value[fieldId]) : (fieldValues.value[fieldId] || null)
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

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 18px 0;
}

.category-tab {
  border: 1px solid var(--border);
  background: white;
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-secondary);
}

.category-tab.active {
  background: #e3f2fd;
  border-color: #90caf9;
  color: #1e3a8a;
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

.multi-select {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  background: #fafbfc;
}

.multi-select-option {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>

