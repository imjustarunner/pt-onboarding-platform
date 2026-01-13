<template>
  <div class="container">
    <h1>Settings</h1>
    
    <div class="settings-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="['tab-button', { active: activeTab === tab.id }]"
      >
        {{ tab.label }}
      </button>
    </div>
    
    <div class="settings-content">
      <AgencyManagement v-if="activeTab === 'agencies' && authStore.user?.role !== 'support' && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)" />
      <BrandingConfig v-if="activeTab === 'branding' && authStore.user?.role !== 'support' && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)" />
      <EmailTemplateManagement v-if="activeTab === 'communications' && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)" :readOnly="authStore.user?.role === 'support'" />
      <ApprovedEmployeeList v-if="activeTab === 'approved-employees' && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)" />
      <PlatformSettings v-if="activeTab === 'platform' && authStore.user?.role !== 'support' && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)" />
      <UserInfoFieldManagement v-if="activeTab === 'user-info-fields' && authStore.user?.role === 'super_admin'" />
      <AgencyUserInfoFields v-if="activeTab === 'user-info-fields' && authStore.user?.role === 'admin' && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)" />
      <CustomChecklistItemManagement v-if="activeTab === 'custom-checklist' && authStore.user?.role === 'super_admin'" />
      <AgencyCustomChecklistItems v-if="activeTab === 'custom-checklist' && (authStore.user?.role === 'admin' || authStore.user?.role === 'support') && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)" :assignOnly="authStore.user?.role === 'support'" />
      <IconLibraryView v-if="activeTab === 'icon-library' && (authStore.user?.role === 'super_admin' || authStore.user?.role === 'admin') && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)" />
      <OnboardingPackageManagement v-if="activeTab === 'onboarding-packages' && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)" :readOnly="authStore.user?.role === 'support'" />
      <BrandingTemplateManager v-if="activeTab === 'branding-templates' && (authStore.user?.role === 'super_admin' || authStore.user?.role === 'admin') && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)" />
      <FontManager v-if="activeTab === 'fonts' && (authStore.user?.role === 'super_admin' || authStore.user?.role === 'admin') && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)" />
      <ArchiveManagement v-if="activeTab === 'archive' && authStore.user?.role !== 'support' && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { isSupervisor } from '../../utils/helpers.js';
import AgencyManagement from '../../components/admin/AgencyManagement.vue';
import BrandingConfig from '../../components/admin/BrandingConfig.vue';
import EmailTemplateManagement from '../../components/admin/EmailTemplateManagement.vue';
import PlatformSettings from '../../components/admin/PlatformSettings.vue';
import UserInfoFieldManagement from '../../components/admin/UserInfoFieldManagement.vue';
import AgencyUserInfoFields from '../../components/admin/AgencyUserInfoFields.vue';
import CustomChecklistItemManagement from '../../components/admin/CustomChecklistItemManagement.vue';
import AgencyCustomChecklistItems from '../../components/admin/AgencyCustomChecklistItems.vue';
import ApprovedEmployeeList from '../../components/admin/ApprovedEmployeeList.vue';
import IconLibraryView from './IconLibraryView.vue';
import OnboardingPackageManagement from '../../components/admin/OnboardingPackageManagement.vue';
import BrandingTemplateManager from '../../components/admin/BrandingTemplateManager.vue';
import FontManager from '../../components/admin/FontManager.vue';
import ArchiveManagement from '../../components/admin/ArchiveManagement.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// Initialize activeTab from query parameter or default based on role
const defaultTab = authStore.user?.role === 'support' ? 'communications' : 'agencies';
const activeTab = ref(route.query.tab || defaultTab);

// Redirect CPAs and supervisors away from settings (they don't need it)
onMounted(() => {
  const userRole = authStore.user?.role;
  if (userRole === 'clinical_practice_assistant' || userRole === 'supervisor') {
    router.push('/admin');
  }
});

const tabs = computed(() => {
  const allTabs = [
    { id: 'agencies', label: 'Agencies' },
    { id: 'branding', label: 'Branding' },
    { id: 'communications', label: 'Communications' },
    { id: 'platform', label: 'Platform Settings' },
    { id: 'user-info-fields', label: 'User Info Fields' },
    { id: 'custom-checklist', label: 'Custom Checklist Items' },
    { id: 'approved-employees', label: 'Approved Employees' },
    { id: 'onboarding-packages', label: 'Onboarding Packages' },
    { id: 'icon-library', label: 'Icon Library' },
    { id: 'fonts', label: 'Font Library' },
    { id: 'branding-templates', label: 'Branding Templates' },
    { id: 'archive', label: 'Archive' }
  ];
  
  const userRole = authStore.user?.role;
  
  // Support users see limited tabs
  if (userRole === 'support') {
    return [
      { id: 'communications', label: 'Communications' },
      { id: 'approved-employees', label: 'Approved Employees' },
      { id: 'onboarding-packages', label: 'Onboarding Packages' },
      { id: 'custom-checklist', label: 'Custom Checklist Items' }
    ];
  }
  
  // CPAs and supervisors see no settings tabs (they don't need settings access)
  if (userRole === 'clinical_practice_assistant' || userRole === 'supervisor') {
    return [];
  }
  
  // Super admins see all tabs
  if (userRole === 'super_admin') {
    return allTabs;
  }
  
  // Regular admins see user info fields and icon library but not platform settings
  return allTabs.filter(tab => tab.id !== 'platform');
});
</script>

<style scoped>
h1 {
  margin-bottom: 32px;
  color: var(--text-primary);
}

.settings-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 32px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 0;
}

.tab-button {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.2s;
  margin-bottom: -2px;
}

.tab-button:hover {
  color: var(--text-primary);
}

.tab-button.active {
  color: var(--primary);
  border-bottom-color: var(--accent);
}

.settings-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}
</style>

