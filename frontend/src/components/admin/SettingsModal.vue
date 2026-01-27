<template>
  <div :class="embedded ? 'settings-embedded' : 'settings-modal-overlay'" @click.self="embedded ? null : closeModal">
    <div :class="embedded ? 'settings-modal settings-modal-embedded' : 'settings-modal'">
      <div v-if="!embedded" class="modal-header">
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
            <button
              type="button"
              class="category-header"
              :class="{ open: isCategoryOpen(category.id) }"
              @click="toggleCategory(category.id)"
            >
              <span class="category-label">{{ category.label }}</span>
              <span class="category-caret">{{ isCategoryOpen(category.id) ? '▾' : '▸' }}</span>
            </button>
            <div v-show="isCategoryOpen(category.id)" class="category-items">
              <button
                v-for="item in category.items"
                :key="item.id"
                @click="selectItem(category.id, item.id)"
                :class="['category-item', { active: selectedCategory === category.id && selectedItem === item.id }]"
                :disabled="!item.visible"
              >
                <span class="item-icon">
                  <img 
                    v-if="getSettingsIconUrl(item.id)" 
                    :src="getSettingsIconUrl(item.id)" 
                    :alt="item.label"
                    class="icon-image"
                  />
                  <span v-else class="icon-emoji">{{ item.icon }}</span>
                </span>
                <span class="item-label">{{ item.label }}</span>
              </button>
            </div>
          </div>
        </div>
        
        <div class="settings-content">
          <div v-if="selectedComponent" class="component-wrapper">
            <div v-if="selectedItemRequiresAgency" class="agency-context-bar">
              <div class="agency-context-left">
                <label class="agency-context-label">Agency</label>

                <div v-if="!isSuperAdmin && selectableAgencies.length === 1" class="agency-context-single">
                  {{ selectableAgencies[0].name }}
                </div>

                <select
                  v-else
                  v-model="selectedAgencyId"
                  class="agency-context-select"
                  @change="handleAgencySelection"
                >
                  <option v-if="isSuperAdmin" value="">Select an agency…</option>
                  <option v-for="a in selectableAgencies" :key="a.id" :value="String(a.id)">
                    {{ a.name }}
                  </option>
                </select>

                <small v-if="isSuperAdmin" class="agency-context-help">
                  Super Admin accounts must select which agency to manage for agency-scoped settings.
                </small>
              </div>
            </div>

            <div v-if="selectedItemRequiresAgency && !agencyStore.currentAgency" class="empty-state" style="margin-top: 12px;">
              <p>Select an agency to continue.</p>
            </div>

            <component v-else :is="selectedComponent" v-bind="componentProps" />
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
import { useBrandingStore } from '../../store/branding';
import { useAgencyStore } from '../../store/agency';
import { isSupervisor } from '../../utils/helpers.js';
import api from '../../services/api';

// Import all existing components
import AgencyManagement from './AgencyManagement.vue';
import BrandingConfig from './BrandingConfig.vue';
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
import ClientCatalogManagement from './ClientCatalogManagement.vue';
import SchoolCatalogManagement from './SchoolCatalogManagement.vue';
import ProviderCatalogManagement from './ProviderCatalogManagement.vue';
import ProviderSchedulingManagement from './ProviderSchedulingManagement.vue';
import AvailabilityIntakeManagement from './AvailabilityIntakeManagement.vue';
import ViewportPreviewSettings from './ViewportPreviewSettings.vue';
import PayrollScheduleSettings from './PayrollScheduleSettings.vue';

// Import placeholder components
import TeamRolesManagement from './TeamRolesManagement.vue';
import BillingManagement from './BillingManagement.vue';
import IntegrationsManagement from './IntegrationsManagement.vue';

const props = defineProps({
  embedded: { type: Boolean, default: false }
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();

const selectedCategory = ref(null);
const selectedItem = ref(null);
const selectedAgencyId = ref(agencyStore.currentAgency?.id ? String(agencyStore.currentAgency.id) : '');

// Sidebar accordion state
const expandedCategoryIds = ref(new Set());

const isCategoryOpen = (categoryId) => {
  return expandedCategoryIds.value.has(String(categoryId));
};

const toggleCategory = (categoryId) => {
  const id = String(categoryId);
  const next = new Set(expandedCategoryIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedCategoryIds.value = next;
};

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
        id: 'client-settings',
        label: 'Client Settings',
        icon: '🧾',
        component: 'ClientCatalogManagement',
        requiresAgency: true,
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'school-settings',
        label: 'School Settings',
        icon: '🏫',
        component: 'SchoolCatalogManagement',
        requiresAgency: true,
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'provider-settings',
        label: 'Provider Settings',
        icon: '🧑‍⚕️',
        component: 'ProviderCatalogManagement',
        requiresAgency: true,
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'provider-scheduling',
        label: 'Provider Scheduling',
        icon: '🗓️',
        component: 'ProviderSchedulingManagement',
        requiresAgency: true,
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'availability-intake',
        label: 'Availability Intake',
        icon: '🧭',
        component: 'AvailabilityIntakeManagement',
        requiresAgency: true,
        roles: ['super_admin', 'admin', 'support', 'clinical_practice_assistant', 'staff'],
        excludeSupervisor: true
      },
      {
        id: 'payroll-schedule',
        label: 'Payroll',
        icon: '💰',
        component: 'PayrollScheduleSettings',
        requiresAgency: true,
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
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
        id: 'branding-config',
        label: 'Branding Configuration',
        icon: '✨',
        component: 'BrandingConfig',
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
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
        id: 'viewport-preview',
        label: 'Viewport Preview',
        icon: '📱',
        component: 'ViewportPreviewSettings',
        roles: ['super_admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
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
  BrandingConfig,
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
  ClientCatalogManagement,
  SchoolCatalogManagement,
  ProviderCatalogManagement,
  ProviderSchedulingManagement,
  AvailabilityIntakeManagement,
  ViewportPreviewSettings,
  PayrollScheduleSettings,
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

const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');

const selectableAgencies = computed(() => {
  const list = isSuperAdmin.value ? (agencyStore.agencies || []) : (agencyStore.userAgencies || agencyStore.agencies || []);
  return [...list].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});

const selectedItemRequiresAgency = computed(() => {
  if (!selectedCategory.value || !selectedItem.value) return false;
  const category = allCategories.find(c => c.id === selectedCategory.value);
  const item = category?.items?.find(i => i.id === selectedItem.value);
  return !!item?.requiresAgency;
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

const handleAgencySelection = () => {
  const id = selectedAgencyId.value ? parseInt(selectedAgencyId.value, 10) : null;
  const agency = selectableAgencies.value.find(a => a.id === id);
  if (agency) {
    agencyStore.setCurrentAgency(agency);
  } else if (isSuperAdmin.value) {
    // allow placeholder "no selection" for super_admin
    agencyStore.setCurrentAgency(null);
  }
};

const selectItem = (categoryId, itemId) => {
  selectedCategory.value = categoryId;
  selectedItem.value = itemId;

  // Auto-collapse to only the active category (still user-toggleable via header click).
  expandedCategoryIds.value = new Set([String(categoryId)]);
  
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
onMounted(async () => {
  const iconsPromise = loadIconsIndex();
  const userRole = authStore.user?.role;
  
  // Redirect CPAs and supervisors away from settings
  if (userRole === 'clinical_practice_assistant' || userRole === 'supervisor') {
    router.push('/admin');
    return;
  }
  
  // Fetch platform branding to get settings icons
  await brandingStore.fetchPlatformBranding();

  // Load agency options for agency-scoped settings
  // - super_admin: all agencies
  // - admin: assigned agencies (auto-select if 1)
  if (isSuperAdmin.value) {
    await agencyStore.fetchAgencies();
  } else {
    await agencyStore.fetchUserAgencies();
    const list = selectableAgencies.value || [];
    if (!agencyStore.currentAgency && list.length === 1) {
      agencyStore.setCurrentAgency(list[0]);
    } else if (!agencyStore.currentAgency && list.length > 0) {
      agencyStore.setCurrentAgency(list[0]);
    }
  }

  // Optional deep-link agency selection (used by other pages/modals)
  const agencyIdParam = route.query.agencyId;
  if (agencyIdParam) {
    const id = parseInt(String(agencyIdParam), 10);
    if (!Number.isNaN(id)) {
      const target = selectableAgencies.value.find((a) => Number(a?.id) === Number(id));
      if (target) {
        agencyStore.setCurrentAgency(target);
      }
    }
  }

  selectedAgencyId.value = agencyStore.currentAgency?.id ? String(agencyStore.currentAgency.id) : '';
  
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
        expandedCategoryIds.value = new Set([String(categoryParam)]);
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
      expandedCategoryIds.value = new Set([String(firstCategory.id)]);
    }
  }

  await iconsPromise;
});

watch(() => agencyStore.currentAgency, (a) => {
  selectedAgencyId.value = a?.id ? String(a.id) : '';
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

  // Support deep-linking to an agency context
  if (newQuery.agencyId) {
    const id = parseInt(String(newQuery.agencyId), 10);
    if (!Number.isNaN(id)) {
      const target = selectableAgencies.value.find((a) => Number(a?.id) === Number(id));
      if (target) agencyStore.setCurrentAgency(target);
    }
  }
}, { immediate: true });

// Map settings item IDs to platform branding icon field names
const settingsIconMap = {
  'company-profile': { idField: 'company_profile_icon_id', pathField: 'company_profile_icon_path' },
  'team-roles': { idField: 'team_roles_icon_id', pathField: 'team_roles_icon_path' },
  'billing': { idField: 'billing_icon_id', pathField: 'billing_icon_path' },
  'packages': { idField: 'packages_icon_id', pathField: 'packages_icon_path' },
  'checklist-items': { idField: 'checklist_items_icon_id', pathField: 'checklist_items_icon_path' },
  'checklist-items-agency': { idField: 'checklist_items_icon_id', pathField: 'checklist_items_icon_path' },
  'field-definitions': { idField: 'field_definitions_icon_id', pathField: 'field_definitions_icon_path' },
  'field-definitions-agency': { idField: 'field_definitions_icon_id', pathField: 'field_definitions_icon_path' },
  'branding-templates': { idField: 'branding_templates_icon_id', pathField: 'branding_templates_icon_path' },
  'assets': { idField: 'assets_icon_id', pathField: 'assets_icon_path' },
  'communications': { idField: 'communications_icon_id', pathField: 'communications_icon_path' },
  'integrations': { idField: 'integrations_icon_id', pathField: 'integrations_icon_path' },
  'platform-security': { idField: 'platform_settings_icon_id', pathField: 'platform_settings_icon_path' },
  'archive': { idField: 'archive_icon_id', pathField: 'archive_icon_path' }
};

const iconsById = ref({});

const getIconUrlFromFilePath = (filePath) => {
  if (!filePath) return null;
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';

  let cleanPath = String(filePath);
  if (cleanPath.startsWith('/uploads/')) {
    cleanPath = cleanPath.substring('/uploads/'.length);
  } else if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.substring(1);
  }

  if (!cleanPath.startsWith('uploads/') && !cleanPath.startsWith('icons/')) {
    cleanPath = `uploads/${cleanPath}`;
  } else if (cleanPath.startsWith('icons/')) {
    cleanPath = `uploads/${cleanPath}`;
  }

  return `${apiBase}/${cleanPath}`;
};

const loadIconsIndex = async () => {
  try {
    const res = await api.get('/icons');
    const rows = Array.isArray(res.data) ? res.data : [];
    const map = {};
    for (const i of rows) {
      if (i && i.id != null) map[String(i.id)] = i;
    }
    iconsById.value = map;
  } catch {
    // best effort
    iconsById.value = {};
  }
};

// Get icon URL for a settings item
const getSettingsIconUrl = (itemId) => {
  const meta = settingsIconMap[itemId];
  if (!meta) return null;

  // 1) Agency override (if present)
  const agency = agencyStore.currentAgency;
  const agencyIconId = agency && meta.idField ? agency[meta.idField] : null;
  if (agencyIconId && iconsById.value[String(agencyIconId)]?.file_path) {
    return getIconUrlFromFilePath(iconsById.value[String(agencyIconId)].file_path);
  }

  // 2) Platform default
  const platformBranding = brandingStore.platformBranding;
  if (!platformBranding) return null;

  const platformPath = meta.pathField ? platformBranding[meta.pathField] : null;
  if (platformPath) return getIconUrlFromFilePath(platformPath);

  const platformIconId = meta.idField ? platformBranding[meta.idField] : null;
  if (platformIconId && iconsById.value[String(platformIconId)]?.file_path) {
    return getIconUrlFromFilePath(iconsById.value[String(platformIconId)].file_path);
  }

  return null;
};
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

.settings-embedded {
  position: relative;
  background: transparent;
  padding: 0;
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

.settings-modal-embedded {
  width: 100%;
  max-width: none;
  height: auto;
  max-height: none;
  border-radius: 0;
  box-shadow: none;
  animation: none;
}

.settings-modal-embedded .modal-body {
  height: auto;
  max-height: none;
}

@media (max-width: 1200px) {
  .settings-modal.settings-modal-embedded {
    width: 100%;
    max-width: none;
  }
}

@media (max-width: 992px) {
  .settings-modal.settings-modal-embedded {
    width: 100%;
    max-width: none;
    height: auto;
    max-height: none;
  }
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

.category-header {
  width: calc(100% - 48px);
  margin: 0 24px 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
  text-align: left;
}

.category-header:hover {
  background: rgba(255, 255, 255, 0.85);
}

.category-header.open {
  background: rgba(255, 255, 255, 0.95);
}

.category-header .category-label {
  padding: 0;
  margin: 0;
}

.category-caret {
  color: var(--text-secondary);
  font-size: 12px;
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

/* Category labels are now rendered inside `.category-header` */
.category-section > .category-label {
  display: none;
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
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  flex-shrink: 0;
}

.item-icon .icon-image {
  width: 24px;
  height: 24px;
  max-width: 24px;
  max-height: 24px;
  object-fit: contain;
  display: block;
}

.item-icon .icon-emoji {
  font-size: 22px;
  line-height: 1;
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

.agency-context-bar {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 14px;
}

.agency-context-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 520px;
}

.agency-context-label {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 13px;
}

.agency-context-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
  font-size: 14px;
}

.agency-context-single {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #f8fafc;
  font-weight: 700;
}

.agency-context-help {
  color: var(--text-secondary);
  font-size: 12px;
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

/* Responsive design for smaller windows */
@media (max-width: 1200px) {
  .settings-modal {
    width: 98%;
    max-width: 98%;
  }
  
  .settings-sidebar {
    width: 240px;
  }
  
  .settings-content {
    padding: 24px;
  }
}

@media (max-width: 992px) {
  .settings-modal {
    width: 95%;
    height: 85vh;
    max-height: 85vh;
  }
  
  .settings-sidebar {
    width: 200px;
  }
  
  .modal-header {
    padding: 20px 24px;
  }
  
  .modal-header h1 {
    font-size: 24px;
  }
  
  .settings-content {
    padding: 20px;
  }
  
  .category-item {
    padding: 10px 20px;
    font-size: 14px;
  }
  
  .item-icon {
    width: 26px;
    height: 26px;
  }
  
  .item-icon .icon-image {
    width: 22px;
    height: 22px;
  }
}

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
    padding: 16px 0;
  }
  
  .modal-body {
    flex-direction: column;
  }
  
  .modal-header {
    padding: 16px 20px;
  }
  
  .modal-header h1 {
    font-size: 20px;
  }
  
  .category-label {
    padding: 0 16px;
    font-size: 10px;
  }
  
  .category-items {
    flex-direction: row;
    overflow-x: auto;
    padding: 0 12px;
    gap: 8px;
  }
  
  .category-item {
    min-width: 140px;
    white-space: nowrap;
    padding: 10px 16px;
    border-radius: 8px;
  }
  
  .category-item.active {
    border-right: none;
    border-bottom: 3px solid var(--primary);
  }
  
  .settings-content {
    padding: 16px;
    overflow-y: auto;
  }
  
  .item-icon {
    width: 24px;
    height: 24px;
  }
  
  .item-icon .icon-image {
    width: 20px;
    height: 20px;
  }
  
  .item-icon .icon-emoji {
    font-size: 20px;
  }
}

@media (max-width: 480px) {
  .category-item {
    min-width: 120px;
    padding: 8px 12px;
    font-size: 13px;
  }
  
  .item-label {
    font-size: 13px;
  }
}

/* Ensure modal is scrollable on small screens */
@media (max-height: 700px) {
  .settings-modal {
    height: 95vh;
    max-height: 95vh;
  }
  
  .settings-content {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
}

/* Better scrolling for sidebar on medium screens */
@media (max-width: 992px) and (min-width: 769px) {
  .settings-sidebar {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
