<template>
  <div class="template-parameter-helper">
    <div class="helper-header">
      <h3>Available Parameters</h3>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search parameters..."
        class="search-input"
      />
    </div>
    <div class="parameters-list">
      <div
        v-for="category in groupedParameters"
        :key="category.name"
        class="parameter-category"
      >
        <h4 class="category-title">{{ category.label }}</h4>
        <div class="parameter-items">
          <div
            v-for="param in category.parameters"
            :key="param.name"
            class="parameter-item"
            :class="{ 'used': isParameterUsed(param.name) }"
            @click="insertParameter(param.name)"
            :title="param.description"
          >
            <div class="parameter-name" v-text="'{{' + param.name + '}}'"></div>
            <div class="parameter-description">{{ param.description }}</div>
            <div class="parameter-example">Example: {{ param.example }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  usedParameters: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['insert']);

const searchQuery = ref('');

const availableParameters = [
  { name: 'FIRST_NAME', description: "User's first name", category: 'user', example: 'John' },
  { name: 'LAST_NAME', description: "User's last name", category: 'user', example: 'Doe' },
  { name: 'USERNAME', description: "User's email/username", category: 'user', example: 'john.doe@example.com' },
  { name: 'TEMP_PASSWORD', description: 'Generated temporary password', category: 'user', example: 'Xk9mP2qR7vN4wL8t' },
  { name: 'AGENCY_NAME', description: 'Name of the agency', category: 'agency', example: 'IT Solutions Co' },
  { name: 'TERMINOLOGY_SETTINGS', description: 'Agency-specific terminology', category: 'agency', example: 'People Operations' },
  { name: 'PEOPLE_OPS_EMAIL', description: 'Onboarding team/People Ops email address', category: 'agency', example: 'onboarding@agency.com' },
  { name: 'PORTAL_URL', description: 'Portal subdomain URL', category: 'links', example: 'itsco.app.plottwistco.com' },
  { name: 'PORTAL_LOGIN_LINK', description: 'Full URL to portal login page', category: 'links', example: 'https://itsco.app.plottwistco.com/login' },
  { name: 'RESET_TOKEN_LINK', description: 'Passwordless login link', category: 'links', example: 'https://itsco.app.plottwistco.com/passwordless-login/abc123' },
  { name: 'DOCUMENT_DEADLINE', description: 'Document completion deadline', category: 'deadlines', example: 'January 15, 2024' },
  { name: 'TRAINING_DEADLINE', description: 'Training completion deadline', category: 'deadlines', example: 'January 20, 2024' },
  { name: 'SENDER_NAME', description: 'Name of the person/system generating the email', category: 'system', example: 'Admin User' }
];

const categoryLabels = {
  user: 'User Information',
  agency: 'Agency Information',
  links: 'Links',
  deadlines: 'Deadlines',
  system: 'System'
};

const filteredParameters = computed(() => {
  if (!searchQuery.value) {
    return availableParameters;
  }
  
  const query = searchQuery.value.toLowerCase();
  return availableParameters.filter(param => 
    param.name.toLowerCase().includes(query) ||
    param.description.toLowerCase().includes(query)
  );
});

const groupedParameters = computed(() => {
  const grouped = {};
  
  filteredParameters.value.forEach(param => {
    if (!grouped[param.category]) {
      grouped[param.category] = [];
    }
    grouped[param.category].push(param);
  });
  
  return Object.keys(grouped).map(category => ({
    name: category,
    label: categoryLabels[category] || category,
    parameters: grouped[category]
  }));
});

const isParameterUsed = (paramName) => {
  return props.usedParameters.some(used => 
    used.includes(`{{${paramName}}}`) || used.includes(`{{ ${paramName} }}`)
  );
};

const insertParameter = (paramName) => {
  emit('insert', `{{${paramName}}}`);
};
</script>

<style scoped>
.template-parameter-helper {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  background: var(--bg-secondary);
  max-height: 500px;
  overflow-y: auto;
}

.helper-header {
  margin-bottom: 16px;
}

.helper-header h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.parameters-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.parameter-category {
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;
}

.parameter-category:last-child {
  border-bottom: none;
}

.category-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.parameter-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.parameter-item {
  padding: 12px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.parameter-item:hover {
  border-color: var(--primary);
  background: var(--bg-primary);
  transform: translateX(4px);
}

.parameter-item.used {
  border-color: var(--success);
  background: #f0fdf4;
}

.parameter-name {
  font-family: 'Courier New', monospace;
  font-weight: 600;
  color: var(--primary);
  margin-bottom: 4px;
  font-size: 14px;
}

.parameter-description {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.parameter-example {
  font-size: 12px;
  color: var(--text-tertiary);
  font-style: italic;
}
</style>
