<template>
  <div class="settings-modal-overlay" @click.self="closeModal">
    <div class="settings-modal">
      <div class="modal-header">
        <h1>Settings</h1>
        <button @click="closeModal" class="btn-close" aria-label="Close settings">×</button>
      </div>
      
      <div class="modal-body">
        <div class="settings-sidebar">
          <div
            v-for="category in visibleCategories"
            :key="category.id"
            class="category-section"
          >
            <h2 class="category-label">{{ category.label }}</h2>
            <div class="category-items">
              <button
                v-for="item in category.items"
                :key="item.id"
                @click="selectItem(category.id, item.id)"
                :class="['category-item', { active: selectedCategory === category.id && selectedItem === item.id }]"
                :disabled="!item.visible"
              >
                <span class="item-icon">{{ item.icon }}</span>
                <span class="item-label">{{ item.label }}</span>
              </button>
            </div>
          </div>
        </div>
        
        <div class="settings-content">
          <div v-if="selectedComponent" class="component-wrapper">
            <component
              :is="selectedComponent"
              v-bind="componentProps"
            />
          </div>
          <div v-else class="empty-state">
            <p>Select a setting category to get started</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { isSupervisor } from '../../utils/helpers.js';

// Import all existing components
import AgencyManagement from './AgencyManagement.vue';
import BrandingTemplatesManagement from './BrandingTemplatesManagement.vue';
import EmailTemplateManagement from './EmailTemplateManagement.vue';
import PlatformSettings from './PlatformSettings.vue';
import UserInfoFieldManagement from './UserInfoFieldManagement.vue';
import AgencyUserInfoFields from './AgencyUserInfoFields.vue';
import CustomChecklistItemManagement from './CustomChecklistItemManagement.vue';
import AgencyCustomChecklistItems from './AgencyCustomChecklistItems.vue';
import AssetsManagement from './AssetsManagement.vue';
import OnboardingPackageManagement from './OnboardingPackageManagement.vue';
import ArchiveManagement from './ArchiveManagement.vue';

// Import placeholder components
import TeamRolesManagement from './TeamRolesManagement.vue';
import BillingManagement from './BillingManagement.vue';
import IntegrationsManagement from './IntegrationsManagement.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const selectedCategory = ref(null);
const selectedItem = ref(null);

// Define all settings categories and items
const allCategories = [
  {
    id: 'general',
    label: 'GENERAL',
    items: [
      {
        id: 'company-profile',
        label: 'Company Profile',
        icon: '🏢',
        component: 'AgencyManagement',
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'team-roles',
        label: 'Team & Roles',
        icon: '👥',
        component: 'TeamRolesManagement',
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'billing',
        label: 'Billing',
        icon: '💳',
        component: 'BillingManagement',
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      }
    ]
  },
  {
    id: 'workflow',
    label: 'WORKFLOW',
    items: [
      {
        id: 'packages',
        label: 'Packages',
        icon: '📦',
        component: 'OnboardingPackageManagement',
        roles: ['super_admin', 'admin', 'support'],
        excludeRoles: ['clinical_practice_assistant'],
        excludeSupervisor: true,
        props: { readOnly: false }
      },
      {
        id: 'checklist-items',
        label: 'Checklist Items',
        icon: '📋',
        component: 'CustomChecklistItemManagement',
        roles: ['super_admin'],
        excludeRoles: ['clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'checklist-items-agency',
        label: 'Checklist Items',
        icon: '📋',
        component: 'AgencyCustomChecklistItems',
        roles: ['admin', 'support'],
        excludeRoles: ['clinical_practice_assistant'],
        excludeSupervisor: true,
        props: { assignOnly: false }
      },
      {
        id: 'field-definitions',
        label: 'Field Definitions',
        icon: '📝',
        component: 'UserInfoFieldManagement',
        roles: ['super_admin'],
        excludeRoles: ['clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'field-definitions-agency',
        label: 'Field Definitions',
        icon: '📝',
        component: 'AgencyUserInfoFields',
        roles: ['admin'],
        excludeRoles: ['clinical_practice_assistant'],
        excludeSupervisor: true
      }
    ]
  },
  {
    id: 'theming',
    label: 'THEMING',
    items: [
      {
        id: 'branding-templates',
        label: 'Branding & Templates',
        icon: '🎨',
        component: 'BrandingTemplatesManagement',
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'assets',
        label: 'Assets (Icons/Fonts)',
        icon: '🖼️',
        component: 'AssetsManagement',
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      }
    ]
  },
  {
    id: 'system',
    label: 'SYSTEM',
    items: [
      {
        id: 'communications',
        label: 'Communications',
        icon: '💬',
        component: 'EmailTemplateManagement',
        roles: ['super_admin', 'admin', 'support'],
        excludeRoles: ['clinical_practice_assistant'],
        excludeSupervisor: true,
        props: { readOnly: false }
      },
      {
        id: 'integrations',
        label: 'Integrations',
        icon: '🔌',
        component: 'IntegrationsManagement',
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'platform-security',
        label: 'Platform & Security',
        icon: '🔐',
        component: 'PlatformSettings',
        roles: ['super_admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'archive',
        label: 'Archive',
        icon: '🗑️',
        component: 'ArchiveManagement',
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      }
    ]
  }
];

// Filter categories and items based on user role
const visibleCategories = computed(() => {
  const userRole = authStore.user?.role;
  const isUserSupervisor = isSupervisor(authStore.user);
  
  return allCategories.map(category => ({
    ...category,
    items: category.items
      .filter(item => {
        // Check role inclusion
        if (item.roles && !item.roles.includes(userRole)) {
          return false;
        }
        
        // Check role exclusion
        if (item.excludeRoles && item.excludeRoles.includes(userRole)) {
          return false;
        }
        
        // Check supervisor exclusion
        if (item.excludeSupervisor && isUserSupervisor) {
          return false;
        }
        
        // Special handling for support users
        if (userRole === 'support') {
          // Support users can only see specific items
          const supportAllowedItems = ['packages', 'checklist-items-agency', 'communications'];
          if (!supportAllowedItems.includes(item.id)) {
            return false;
          }
          // Update props for support users
          if (item.id === 'packages' || item.id === 'communications') {
            item.props = { readOnly: true };
          }
          if (item.id === 'checklist-items-agency') {
            item.props = { assignOnly: true };
          }
        }
        
        return true;
      })
      .map(item => ({
        ...item,
        visible: true
      }))
  })).filter(category => category.items.length > 0);
});

// Component mapping
const componentMap = {
  AgencyManagement,
  BrandingTemplatesManagement,
  EmailTemplateManagement,
  PlatformSettings,
  UserInfoFieldManagement,
  AgencyUserInfoFields,
  CustomChecklistItemManagement,
  AgencyCustomChecklistItems,
  AssetsManagement,
  OnboardingPackageManagement,
  ArchiveManagement,
  TeamRolesManagement,
  BillingManagement,
  IntegrationsManagement
};

const selectedComponent = computed(() => {
  if (!selectedCategory.value || !selectedItem.value) {
    return null;
  }
  
  const category = allCategories.find(c => c.id === selectedCategory.value);
  if (!category) return null;
  
  const item = category.items.find(i => i.id === selectedItem.value);
  if (!item) return null;
  
  return componentMap[item.component] || null;
});

const componentProps = computed(() => {
  if (!selectedCategory.value || !selectedItem.value) {
    return {};
  }
  
  const category = allCategories.find(c => c.id === selectedCategory.value);
  if (!category) return {};
  
  const item = category.items.find(i => i.id === selectedItem.value);
  if (!item) return {};
  
  return item.props || {};
});

const selectItem = (categoryId, itemId) => {
  selectedCategory.value = categoryId;
  selectedItem.value = itemId;
  
  // Update URL for deep linking
  router.replace({
    query: {
      ...route.query,
      category: categoryId,
      item: itemId
    }
  });
};

const closeModal = () => {
  router.push('/admin');
};

// Initialize from URL query parameters
onMounted(() => {
  const userRole = authStore.user?.role;
  
  // Redirect CPAs and supervisors away from settings
  if (userRole === 'clinical_practice_assistant' || userRole === 'supervisor') {
    router.push('/admin');
    return;
  }
  
  // Check for deep link parameters
  const categoryParam = route.query.category;
  const itemParam = route.query.item;
  
  if (categoryParam && itemParam) {
    // Validate that the category and item are visible for this user
    const category = visibleCategories.value.find(c => c.id === categoryParam);
    if (category) {
      const item = category.items.find(i => i.id === itemParam);
      if (item) {
        selectedCategory.value = categoryParam;
        selectedItem.value = itemParam;
        return;
      }
    }
  }
  
  // Default to first visible category and item
  if (visibleCategories.value.length > 0) {
    const firstCategory = visibleCategories.value[0];
    if (firstCategory.items.length > 0) {
      selectedCategory.value = firstCategory.id;
      selectedItem.value = firstCategory.items[0].id;
    }
  }
});

// Watch for route changes (for browser back/forward)
watch(() => route.query, (newQuery) => {
  if (newQuery.category && newQuery.item) {
    const category = visibleCategories.value.find(c => c.id === newQuery.category);
    if (category) {
      const item = category.items.find(i => i.id === newQuery.item);
      if (item) {
        selectedCategory.value = newQuery.category;
        selectedItem.value = newQuery.item;
      }
    }
  }
}, { immediate: true });
</script>

<style scoped>
.settings-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.settings-modal {
  background: white;
  border-radius: 12px;
  width: 95%;
  max-width: 1400px;
  height: 90vh;
  max-height: 900px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  border-bottom: 2px solid var(--border);
}

.modal-header h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 700;
}

.btn-close {
  background: none;
  border: none;
  font-size: 32px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: var(--bg-alt);
  color: var(--text-primary);
}

.modal-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.settings-sidebar {
  width: 280px;
  border-right: 2px solid var(--border);
  overflow-y: auto;
  background: var(--bg-alt);
  padding: 24px 0;
}

.category-section {
  margin-bottom: 32px;
}

.category-section:last-child {
  margin-bottom: 0;
}

.category-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
  padding: 0 24px;
  margin: 0 0 12px 0;
}

.category-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 500;
  width: 100%;
}

.category-item:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
}

.category-item.active {
  background: white;
  color: var(--primary);
  font-weight: 600;
  border-right: 3px solid var(--primary);
}

.category-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.item-icon {
  font-size: 20px;
  line-height: 1;
  flex-shrink: 0;
}

.item-label {
  flex: 1;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
  background: white;
}

.component-wrapper {
  width: 100%;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 16px;
}

/* Responsive design */
@media (max-width: 768px) {
  .settings-modal {
    width: 100%;
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
  }
  
  .settings-sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 2px solid var(--border);
    max-height: 200px;
    overflow-y: auto;
  }
  
  .modal-body {
    flex-direction: column;
  }
  
  .category-items {
    flex-direction: row;
    overflow-x: auto;
    padding: 0 12px;
  }
  
  .category-item {
    min-width: 150px;
    white-space: nowrap;
  }
}
</style>
