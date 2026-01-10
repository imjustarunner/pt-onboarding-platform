<template>
  <div v-if="show" class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <h2>Mark as Reviewed and Activate</h2>
      <p>Enter the work email that will be used as the username for {{ user?.first_name }} {{ user?.last_name }}:</p>
      <div class="form-group">
        <label>Work Email (Username) *</label>
        <input
          v-model="workEmail"
          type="email"
          required
          placeholder="user@example.com"
          class="form-input"
        />
        <small class="form-help">This email will be used as the username for login</small>
      </div>
      <div class="form-group">
        <label>Personal Email (Optional)</label>
        <input
          v-model="personalEmail"
          type="email"
          placeholder="personal@example.com"
          class="form-input"
        />
        <small class="form-help">Personal email for storage purposes only</small>
      </div>
      <div class="form-group">
        <label>Email Template</label>
        <select
          v-model="selectedTemplateId"
          class="form-input"
        >
          <option value="">Use Default Template</option>
          <option v-for="template in welcomeTemplates" :key="template.id" :value="template.id">
            {{ template.name }} {{ getTemplateScopeLabel(template) }}
          </option>
        </select>
        <small class="form-help">Select a welcome email template to use, or leave as default</small>
      </div>
      <div class="modal-actions">
        <button @click="$emit('close')" class="btn btn-secondary">Cancel</button>
        <button @click="handleConfirm" class="btn btn-primary" :disabled="loading || !workEmail.trim()">
          {{ loading ? 'Processing...' : 'Mark as Reviewed and Activate' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  user: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['close', 'confirm']);

const workEmail = ref('');
const personalEmail = ref('');
const selectedTemplateId = ref('');
const welcomeTemplates = ref([]);
const loading = ref(false);

watch(() => props.user, (newUser) => {
  if (newUser) {
    workEmail.value = newUser.work_email || '';
    personalEmail.value = newUser.personal_email || '';
  }
}, { immediate: true });

const fetchWelcomeTemplates = async () => {
  try {
    // Fetch both user_welcome and welcome_active templates
    const [userWelcomeResponse, welcomeActiveResponse] = await Promise.all([
      api.get('/email-templates', { params: { templateType: 'user_welcome' } }),
      api.get('/email-templates', { params: { templateType: 'welcome_active' } })
    ]);
    
    // Combine both types, removing duplicates by ID
    const allTemplates = [
      ...(userWelcomeResponse.data || []),
      ...(welcomeActiveResponse.data || [])
    ];
    const uniqueTemplates = allTemplates.filter((template, index, self) =>
      index === self.findIndex(t => t.id === template.id)
    );
    
    // Sort: platform templates first (agency_id is null), then by name
    uniqueTemplates.sort((a, b) => {
      const aIsPlatform = !a.agency_id;
      const bIsPlatform = !b.agency_id;
      if (aIsPlatform && !bIsPlatform) return -1;
      if (!aIsPlatform && bIsPlatform) return 1;
      return a.name.localeCompare(b.name);
    });
    
    welcomeTemplates.value = uniqueTemplates;
    console.log('Fetched welcome templates:', uniqueTemplates.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type,
      agency_id: t.agency_id,
      platform_branding_id: t.platform_branding_id,
      scope: getTemplateScopeLabel(t)
    })));
  } catch (error) {
    console.error('Error fetching welcome templates:', error);
    welcomeTemplates.value = [];
  }
};

watch(() => props.show, (newShow) => {
  if (newShow) {
    if (props.user) {
      workEmail.value = props.user.work_email || '';
      personalEmail.value = props.user.personal_email || '';
    }
    selectedTemplateId.value = '';
    fetchWelcomeTemplates();
  }
});

onMounted(() => {
  if (props.show) {
    fetchWelcomeTemplates();
  }
});

const getTemplateScopeLabel = (template) => {
  // Platform template: agency_id is null (with or without platform_branding_id)
  // If platform_branding_id exists, it's definitely platform
  // If agency_id is null but platform_branding_id is also null, it might still be platform (created before fix)
  if (!template.agency_id) {
    return '(Platform)';
  }
  // Agency template: has agency_id
  if (template.agency_id) {
    return `(${template.agency_name || 'Agency'})`;
  }
  // Fallback
  return '(Unknown Scope)';
};

const handleConfirm = () => {
  if (!workEmail.value || !workEmail.value.trim()) {
    alert('Work email is required');
    return;
  }
  emit('confirm', {
    workEmail: workEmail.value.trim(),
    personalEmail: personalEmail.value.trim() || null,
    templateId: selectedTemplateId.value || null
  });
};
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
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
}

.modal-content h2 {
  margin-top: 0;
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.form-help {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #666;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>
