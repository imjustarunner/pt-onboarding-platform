<template>
  <div :class="embedded ? 'settings-embedded' : 'settings-modal-overlay'" @click.self="embedded ? null : closeModal">
    <div :class="embedded ? 'settings-modal settings-modal-embedded' : 'settings-modal'">
      <div v-if="!embedded" class="modal-header">
        <h1>Settings</h1>
        <button @click="closeModal" class="btn-close" aria-label="Close settings">×</button>
      </div>
      
      <div v-if="showTenantEntryGate" class="settings-tenant-entry-gate">
        <div class="tenant-entry-gate-header">
          <h2 class="tenant-entry-title">Choose a tenant</h2>
          <p class="tenant-entry-subtitle">
            Pick a top-level agency to work in. You can switch anytime from the bar below. Or continue to platform-only tools (no tenant).
          </p>
          <input
            v-model="tenantPickerSearch"
            type="search"
            class="tenant-picker-search tenant-picker-search-wide"
            placeholder="Search tenants by name or slug…"
            aria-label="Search tenants"
          />
        </div>
        <div class="tenant-logo-grid" role="list">
          <button
            type="button"
            class="tenant-logo-card tenant-logo-card-platform"
            role="listitem"
            @click="enterPlatformToolsOnly"
          >
            <div class="tenant-logo-wrap tenant-logo-fallback">
              <img
                v-if="getSettingsIconUrl('platform-settings')"
                :src="getSettingsIconUrl('platform-settings')"
                alt=""
                class="tenant-entry-platform-icon"
              />
              <span v-else aria-hidden="true">⚙</span>
            </div>
            <span class="tenant-logo-name">{{ globalToolsLabel }}</span>
            <span class="tenant-logo-slug muted">No tenant — global settings</span>
          </button>
          <button
            v-for="a in filteredTopLevelTenants"
            :key="a.id"
            type="button"
            class="tenant-logo-card"
            :class="{ 'tenant-logo-card-active': isPickerTenantActive(a) }"
            role="listitem"
            :style="{ '--tenant-chip-tint': `hsl(${tenantHueFromId(a.id)} 40% 44%)` }"
            @click="selectTenantFromPicker(a)"
          >
            <div class="tenant-logo-wrap" :style="tenantLogoUrl(a) ? undefined : tenantAvatarWrapStyle(a)">
              <img v-if="tenantLogoUrl(a)" :src="tenantLogoUrl(a)" :alt="''" class="tenant-logo-img" />
              <span v-else class="tenant-logo-initials tenant-logo-initials-on-avatar">{{ tenantInitials(a) }}</span>
            </div>
            <span class="tenant-logo-name">{{ a.name }}</span>
            <span class="tenant-logo-slug muted">{{ a.slug || '—' }}</span>
          </button>
        </div>
      </div>

      <div
        v-else
        class="modal-body"
        :class="{ 'modal-body-with-tenant-shell': showTenantPickerShell }"
      >
        <div v-if="showTenantPickerShell" class="settings-tenant-picker-shell">
          <div class="tenant-picker-shell-head">
            <div class="tenant-picker-shell-title">
              {{ isSuperAdmin ? 'Tenant' : 'Agency' }} context
            </div>
            <input
              v-model="tenantPickerSearch"
              type="search"
              class="tenant-picker-search"
              placeholder="Search tenants…"
              aria-label="Search tenants"
            />
            <div v-if="agencyStore.currentAgency" class="tenant-picker-active-pill">
              <div
                class="tenant-picker-active-logo"
                :style="tenantLogoUrl(agencyStore.currentAgency) ? undefined : tenantAvatarWrapStyle(agencyStore.currentAgency)"
              >
                <img
                  v-if="tenantLogoUrl(agencyStore.currentAgency)"
                  :src="tenantLogoUrl(agencyStore.currentAgency)"
                  alt=""
                  class="tenant-logo-img-sm"
                />
                <span v-else class="tenant-logo-initials-sm tenant-logo-initials-on-avatar">{{
                  tenantInitials(agencyStore.currentAgency)
                }}</span>
              </div>
              <div class="tenant-picker-active-text">
                <span class="tenant-picker-active-name">{{ agencyStore.currentAgency.name }}</span>
                <span class="tenant-picker-active-meta muted">{{ agencyStore.currentAgency.slug }}</span>
              </div>
            </div>
            <p v-else-if="isSuperAdmin && agencyStore.platformMode" class="tenant-picker-hint muted">
              Platform mode — tenant-scoped items will ask you to select a tenant first.
            </p>
            <p v-else-if="!agencyStore.currentAgency" class="tenant-picker-hint muted">
              Select a tenant below for Company Profile, billing, and other tenant settings.
            </p>
          </div>
          <div v-if="showTenantPickerShell && isSuperAdmin && !platformSettingsCardHubActive" class="tenant-mode-toggle-row" role="group" aria-label="Workspace mode">
            <button
              type="button"
              class="tenant-mode-toggle-btn"
              :class="{ 'tenant-mode-toggle-btn--active': agencyStore.platformMode && !agencyStore.currentAgency }"
              @click="enterPlatformToolsOnly"
            >
              {{ globalToolsLabel }}
            </button>
            <button
              type="button"
              class="tenant-mode-toggle-btn"
              :class="{ 'tenant-mode-toggle-btn--active': !!agencyStore.currentAgency }"
              :disabled="!agencyStore.currentAgency"
              @click="agencyStore.currentAgency && selectItem('platform', 'tenant-ws-home')"
            >
              {{
                agencyStore.currentAgency
                  ? `Tenant: ${agencyStore.currentAgency.name}`
                  : 'Tenant workspace'
              }}
            </button>
          </div>
          <div
            v-if="showTenantPickerShell && tenantSettingsCardHubActive"
            class="tenant-workspace-quick-links"
          >
            <button type="button" class="btn btn-link tenant-quick-link" @click="selectItem('platform', 'tenant-ws-home')">
              Hub home
            </button>
            <button
              v-if="agencyStore.currentAgency"
              type="button"
              class="btn btn-link tenant-quick-link"
              @click="selectItem('platform', 'tenant-ws-org-directory')"
            >
              Organizations / Affiliations / Programs / Schools
            </button>
            <button
              v-if="isSuperAdmin && agencyStore.currentAgency"
              type="button"
              class="btn btn-link tenant-quick-link"
              @click="selectItem('platform', 'tenant-ws-global-platform')"
            >
              Platform-wide defaults
            </button>
          </div>
          <div class="tenant-logo-scroller" role="list">
            <button
              v-if="isSuperAdmin"
              type="button"
              class="tenant-logo-chip"
              :class="{ 'tenant-logo-chip-active': agencyStore.platformMode && !agencyStore.currentAgency }"
              role="listitem"
              @click="enterPlatformToolsOnly"
            >
              <div class="tenant-logo-wrap tenant-logo-wrap-sm tenant-logo-fallback">
                <img
                  v-if="getSettingsIconUrl('platform-settings')"
                  :src="getSettingsIconUrl('platform-settings')"
                  alt=""
                  class="tenant-chip-platform-icon"
                />
                <span v-else aria-hidden="true">⚙</span>
              </div>
              <span class="tenant-chip-label">{{ globalToolsLabel }}</span>
            </button>
            <button
              v-for="a in filteredTopLevelTenants"
              :key="`chip-${a.id}`"
              type="button"
              class="tenant-logo-chip"
              :class="{ 'tenant-logo-chip-active': isPickerTenantActive(a) }"
              role="listitem"
              :style="{ '--tenant-chip-tint': `hsl(${tenantHueFromId(a.id)} 40% 44%)` }"
              @click="selectTenantFromPicker(a)"
            >
              <div
                class="tenant-logo-wrap tenant-logo-wrap-sm"
                :style="tenantLogoUrl(a) ? undefined : tenantAvatarWrapStyle(a)"
              >
                <img v-if="tenantLogoUrl(a)" :src="tenantLogoUrl(a)" :alt="''" class="tenant-logo-img" />
                <span v-else class="tenant-logo-initials-sm tenant-logo-initials-on-avatar">{{ tenantInitials(a) }}</span>
              </div>
              <span class="tenant-chip-label">{{ a.name }}</span>
            </button>
          </div>
        </div>

        <div
          class="settings-main-row"
          :class="{
            'settings-main-row--solo-hub': platformSettingsCardHubActive,
            'settings-main-row--no-sidebar': tenantSettingsCardHubActive || platformSettingsCardHubActive
          }"
        >
        <div v-if="!platformSettingsCardHubActive && !tenantSettingsCardHubActive" class="settings-sidebar">
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
        
        <div class="settings-content" :class="{ 'settings-content--solo-hub': platformSettingsCardHubActive }">
          <div v-if="tenantHubDrillInActive" class="tenant-hub-back-row">
            <button type="button" class="btn btn-link tenant-hub-back-btn" @click="selectItem('platform', 'tenant-ws-home')">
              ← Tenant home
            </button>
          </div>
          <div v-if="platformHubDrillInActive" class="tenant-hub-back-row">
            <button type="button" class="btn btn-link tenant-hub-back-btn" @click="selectItem('platform', 'platform-ws-home')">
              ← Platform home
            </button>
          </div>
          <div v-if="selectedComponent" class="component-wrapper">
            <div
              v-if="selectedItemRequiresAgency && (!showTenantContextUi || isChallengeManagement || !showTenantPickerShell)"
              class="agency-context-bar"
            >
              <div class="agency-context-left">
                <label class="agency-context-label">{{ agencyContextLabel }}</label>

                <div v-if="lockAgencyContext" class="agency-context-single">
                  {{ lockedAgencyLabel }}
                </div>

                <div v-else-if="!isSuperAdmin && selectableAgencies.length === 1" class="agency-context-single">
                  {{ selectableAgencies[0].name }}
                </div>

                <select
                  v-else-if="!lockAgencyContext"
                  v-model="selectedAgencyId"
                  class="agency-context-select"
                  @change="handleAgencySelection"
                >
                  <option v-if="isSuperAdmin" value="">{{ agencyContextPlaceholder }}</option>
                  <option v-for="a in selectableAgencies" :key="a.id" :value="String(a.id)">
                    {{ a.name }}
                  </option>
                </select>

                <small v-if="isSuperAdmin && !lockAgencyContext" class="agency-context-help">
                  Super Admin accounts must select which tenant to manage for tenant-scoped settings.
                </small>
                <small v-else-if="isChallengeManagement && selectableAgencies.length === 0" class="agency-context-help">
                  No Learning or Affiliation organizations found. Create one in Company Profile first.
                </small>
              </div>
            </div>

            <div v-if="selectedItemRequiresAgency && !agencyStore.currentAgency" class="empty-state" style="margin-top: 12px;">
              <p>{{ agencyContextEmptyMessage }}</p>
            </div>

            <div v-else-if="selectedItemAgencyOnly && !selectedAgencyIsAgencyOrg" class="empty-state" style="margin-top: 12px;">
              <p>Payroll settings are only available for agency organizations (not schools/programs).</p>
            </div>

            <component v-else :is="selectedComponent" v-bind="componentProps" :key="`${selectedCategory}-${selectedItem}`" />
          </div>
          <div v-else class="empty-state">
            <p>Select a setting category to get started</p>
          </div>
        </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import { useAgencyStore } from '../../store/agency';
import { useOrganizationStore } from '../../store/organization';
import { isSupervisor } from '../../utils/helpers.js';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { trackPromise } from '../../utils/pageLoader';
import { preloadImages } from '../../utils/preloadImages';

// Import all existing components
import AgencyManagement from './AgencyManagement.vue';
import AgencyManagementTeamConfig from './AgencyManagementTeamConfig.vue';
import BrandingConfig from './BrandingConfig.vue';
import BrandingTemplatesManagement from './BrandingTemplatesManagement.vue';
import EmailTemplateManagement from './EmailTemplateManagement.vue';
import EmailSettingsPanel from './EmailSettingsPanel.vue';
import PlatformSettings from './PlatformSettings.vue';
import PlatformBillingManagement from './PlatformBillingManagement.vue';
import AgencyPlatformManagement from './AgencyPlatformManagement.vue';
import SuperadminTenantHub from './SuperadminTenantHub.vue';
import TenantSettingsCardHub from './TenantSettingsCardHub.vue';
import PlatformSettingsCardHub from './PlatformSettingsCardHub.vue';
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
import AgencyDepartmentsManagement from './AgencyDepartmentsManagement.vue';
import NoteAidKnowledgeBaseSettings from './NoteAidKnowledgeBaseSettings.vue';
import SmsNumbersManagement from './SmsNumbersManagement.vue';
import IntakeLinksView from '../../views/admin/IntakeLinksView.vue';
import ChallengeManagement from './ChallengeManagement.vue';
import ShiftProgramManagement from './ShiftProgramManagement.vue';
import AuditCenterSettingsLink from './AuditCenterSettingsLink.vue';

// Import placeholder components
import TeamRolesManagement from './TeamRolesManagement.vue';
import BillingManagement from './BillingManagement.vue';
import TenantFeaturesManagement from './TenantFeaturesManagement.vue';
import IntegrationsManagement from './IntegrationsManagement.vue';

const props = defineProps({
  embedded: { type: Boolean, default: false },
  // Optional initial selection (useful for embedded/portal contexts).
  initialCategoryId: { type: String, default: null },
  initialItemId: { type: String, default: null },
  // Optional initial agency selection and locked-agency context.
  initialAgencyId: { type: [String, Number], default: null },
  lockAgencyContext: { type: Boolean, default: false },
  // Prevent route query syncing (important for embedded usage inside other pages).
  disableRouteSync: { type: Boolean, default: false },
  // Optional school id (used by School Settings to preselect a school).
  initialSchoolId: { type: [String, Number], default: null },
  // null = follow `embedded` (hide tenant shell when embedded). true = show logo picker + URL sync even in embedded page layout (e.g. /admin/settings).
  showTenantContext: { type: Boolean, default: null }
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();
const organizationStore = useOrganizationStore();
const normalizeSettingsSlug = (value) => String(value || '').trim().toLowerCase();
const pickOrgSettingsSlug = (org) => normalizeSettingsSlug(org?.portal_url || org?.portalUrl || org?.slug || '');
const currentRouteSettingsSlug = computed(() => normalizeSettingsSlug(route.params?.organizationSlug));

const showTenantContextUi = computed(() => {
  if (props.lockAgencyContext) return false;
  if (props.showTenantContext === true) return true;
  if (props.showTenantContext === false) return false;
  return !props.embedded;
});

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
};

const isTruthyFlag = (v) => {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};

const selectedCategory = ref(null);
const selectedItem = ref(null);
const selectedAgencyId = ref(agencyStore.currentAgency?.id ? String(agencyStore.currentAgency.id) : '');
const tenantPickerSearch = ref('');

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
// PLATFORM: Super Admin only - platform-wide settings that agencies can override
// GENERAL, WORKFLOW, etc.: Agency-scoped or mixed
const allCategories = [
  {
    id: 'platform',
    label: 'PLATFORM',
    items: [
      {
        id: 'platform-ws-home',
        label: 'Platform home',
        icon: '🏠',
        component: 'PlatformSettingsCardHub',
        roles: ['super_admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'tenant-ws-home',
        label: 'Tenant home',
        icon: '🏠',
        component: 'TenantSettingsCardHub',
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'tenant-ws-org-directory',
        label: 'Tenant organizations',
        icon: '📂',
        component: 'AgencyManagement',
        roles: ['super_admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'tenant-ws-global-platform',
        label: 'Platform-wide defaults',
        icon: '🔐',
        component: 'PlatformSettings',
        roles: ['super_admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'platform-settings',
        label: 'Platform Settings',
        icon: '🔐',
        component: 'PlatformSettings',
        roles: ['super_admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'platform-billing',
        label: 'Platform Billing',
        icon: '💳',
        component: 'PlatformBillingManagement',
        roles: ['super_admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'platform-all-agencies',
        label: 'All organizations',
        icon: '🗂️',
        component: 'AgencyManagement',
        roles: ['super_admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'agency-platform',
        label: 'Tenant identity',
        icon: '🏛️',
        component: 'AgencyPlatformManagement',
        roles: ['super_admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true,
        requiresAgency: true
      },
      {
        id: 'tenant-overview',
        label: 'Overview',
        icon: '📋',
        component: 'SuperadminTenantHub',
        roles: ['super_admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true,
        requiresAgency: true
      }
    ]
  },
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
        id: 'tenant-features',
        label: 'Features',
        icon: '🎛️',
        component: 'TenantFeaturesManagement',
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
        roles: ['super_admin', 'admin', 'staff'],
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
        label: 'Provider Management',
        icon: '🧭',
        component: 'AvailabilityIntakeManagement',
        agencyOnly: true,
        requiresAgency: true,
        roles: ['super_admin', 'admin', 'support', 'clinical_practice_assistant', 'provider_plus', 'staff'],
        excludeSupervisor: true
      },
      {
        id: 'shift-programs',
        label: 'Shift Programs',
        icon: '⏱️',
        component: 'ShiftProgramManagement',
        requiresAgency: true,
        requiresShiftProgramsEnabled: true,
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'payroll-schedule',
        label: 'Payroll',
        icon: '💰',
        component: 'PayrollScheduleSettings',
        agencyOnly: true,
        requiresAgency: true,
        requiresPayrollEnabled: true,
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'departments',
        label: 'Departments',
        icon: '🏛️',
        component: 'AgencyDepartmentsManagement',
        agencyOnly: true,
        requiresAgency: true,
        requiresBudgetManagementEnabled: true,
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'packages',
        label: 'Packages',
        icon: '📦',
        component: 'OnboardingPackageManagement',
        requiresAgency: true,
        requiresOnboardingTrainingEnabled: true,
        roles: ['super_admin', 'admin', 'support'],
        excludeRoles: ['clinical_practice_assistant'],
        excludeSupervisor: true,
        props: { readOnly: false }
      },
      {
        id: 'digital-forms',
        label: 'Digital Forms',
        icon: '🔗',
        component: 'IntakeLinksView',
        requiresAgency: true,
        requiresOnboardingTrainingEnabled: true,
        roles: ['super_admin', 'admin', 'support', 'staff'],
        excludeRoles: ['clinical_practice_assistant'],
        excludeSupervisor: true
      },
      {
        id: 'challenge-management',
        label: 'Seasons & weekly challenges',
        icon: '🏆',
        component: 'ChallengeManagement',
        requiresAgency: true,
        requiresLearningOrAffiliation: true,
        roles: ['super_admin', 'admin', 'support', 'staff', 'provider_plus'],
        excludeRoles: ['clinical_practice_assistant'],
        excludeSupervisor: true
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
        requiresOnboardingTrainingEnabled: true,
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
        requiresOnboardingTrainingEnabled: true,
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
    id: 'ai',
    label: 'AI TOOLS',
    items: [
      {
        id: 'note-aid-kb',
        label: 'Note Aid KB',
        icon: '🧠',
        component: 'NoteAidKnowledgeBaseSettings',
        roles: ['super_admin', 'admin'],
        excludeSupervisor: true,
        requiresAgency: true,
        requiresNoteAidEnabled: true
      }
    ]
  },
  {
    id: 'system',
    label: 'SYSTEM',
    items: [
      {
        id: 'audit-center',
        label: 'Audit Center',
        icon: '🛡️',
        component: 'AuditCenterSettingsLink',
        roles: ['super_admin', 'admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true
      },
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
        id: 'sms-numbers',
        label: 'Texting Numbers',
        icon: '📱',
        component: 'SmsNumbersManagement',
        roles: ['super_admin', 'admin', 'support'],
        excludeRoles: ['clinical_practice_assistant'],
        excludeSupervisor: true,
        requiresAgency: true
      },
      {
        id: 'email-settings',
        label: 'Email Settings',
        icon: '✉️',
        component: 'EmailSettingsPanel',
        roles: ['super_admin', 'admin'],
        excludeRoles: ['clinical_practice_assistant'],
        excludeSupervisor: true
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
        id: 'management-team-config',
        label: 'Management Team',
        icon: '👥',
        component: 'AgencyManagementTeamConfig',
        roles: ['super_admin'],
        excludeRoles: ['support', 'clinical_practice_assistant'],
        excludeSupervisor: true,
        requiresAgency: true,
        agencyOnly: true
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

const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');

/** Full sidebar tree for the signed-in user; tenant workspace hub items are excluded here so they only appear in the slim hub sidebar. */
const roleFilteredCategories = computed(() => {
  const userRole = authStore.user?.role;
  const userRoleNorm = String(userRole || '').toLowerCase();
  const isUserSupervisor = isSupervisor(authStore.user);
  const shouldApplySupervisorExclusion =
    isUserSupervisor &&
    ['supervisor', 'clinical_practice_assistant', 'provider_plus'].includes(userRoleNorm);
  const flags = parseFeatureFlags(agencyStore.currentAgency?.feature_flags);
  const noteAidEnabled = isTruthyFlag(flags?.noteAidEnabled);
  const shiftProgramsEnabled = isTruthyFlag(flags?.shiftProgramsEnabled);
  const payrollEnabled = isTruthyFlag(flags?.payrollEnabled);
  const onboardingTrainingEnabled = isTruthyFlag(flags?.onboardingTrainingEnabled);

  return allCategories
    .map((category) => ({
      ...category,
      items: category.items
        .filter((item) => {
          if (String(item.id || '').startsWith('tenant-ws-')) return false;
          if (String(item.id || '').startsWith('platform-ws-')) return false;
          if (item.id === 'platform-all-agencies') return false;

          if (item.roles && !item.roles.includes(userRole)) {
            return false;
          }

          if (item.excludeRoles && item.excludeRoles.includes(userRole)) {
            return false;
          }

          if (item.excludeSupervisor && shouldApplySupervisorExclusion) {
            return false;
          }

          if (userRole === 'support') {
            const supportAllowedItems = ['packages', 'checklist-items-agency', 'communications', 'sms-numbers'];
            if (!supportAllowedItems.includes(item.id)) {
              return false;
            }
            if (item.id === 'packages' || item.id === 'communications') {
              item.props = { readOnly: true };
            }
            if (item.id === 'checklist-items-agency') {
              item.props = { assignOnly: true };
            }
          }

          if (item.requiresNoteAidEnabled && !noteAidEnabled) {
            return false;
          }
          if (item.requiresShiftProgramsEnabled && !shiftProgramsEnabled) {
            return false;
          }
          if (item.requiresBudgetManagementEnabled) {
            const budgetEnabled = isTruthyFlag(flags?.budgetManagementEnabled);
            if (!budgetEnabled) return false;
          }
          if (item.requiresPayrollEnabled && !payrollEnabled) {
            return false;
          }
          if (item.requiresOnboardingTrainingEnabled && !onboardingTrainingEnabled) {
            return false;
          }
          if (
            item.id === 'platform-settings' &&
            userRoleNorm === 'super_admin' &&
            agencyStore.currentAgency
          ) {
            return false;
          }
          if (item.id === 'challenge-management') {
            const a = agencyStore.currentAgency;
            if (!a?.id) return false;
            const ot = String(a.organization_type || a.organizationType || '').toLowerCase();
            if (ot !== 'agency') return false;
            const key = String(a.slug || a.portal_url || a.portalUrl || '').trim().toLowerCase();
            if (key !== 'sstc') return false;
          }
          return true;
        })
        .map((item) => {
          let label = item.label;
          if (item.id === 'tenant-overview' && agencyStore.currentAgency?.name) {
            label = `${agencyStore.currentAgency.name} Overview`;
          }
          return { ...item, label, visible: true };
        })
    }))
    .filter((category) => category.items.length > 0);
});

/** Card hub + slim sidebar for super_admin and admin when a tenant is selected (not Platform chip). */
const tenantSettingsCardHubActive = computed(() => {
  if (!showTenantContextUi.value) return false;
  if (agencyStore.platformMode) return false;
  if (!agencyStore.currentAgency?.id) return false;
  const r = String(authStore.user?.role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin';
});

/** When tenant card hub is active, embedded settings screens should lock to this agency id. */
const settingsScopedAgencyId = computed(() => {
  if (!tenantSettingsCardHubActive.value) return null;
  const id = Number(agencyStore.currentAgency?.id || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
});

const globalToolsLabel = computed(() => {
  const n = String(brandingStore.platformBranding?.organization_name || '').trim();
  return n ? `Global (${n})` : 'Global tools';
});

const tenantHubSidebarCategory = computed(() => {
  const cat = allCategories.find((c) => c.id === 'platform');
  const pick = (id) => cat?.items?.find((i) => i.id === id);
  const items = [];
  const home = pick('tenant-ws-home');
  if (home) items.push({ ...home, visible: true });
  if (isSuperAdmin.value) {
    const dir = pick('tenant-ws-org-directory');
    const glob = pick('tenant-ws-global-platform');
    if (dir) items.push({ ...dir, visible: true });
    if (glob) items.push({ ...glob, visible: true });
  }
  return {
    id: 'platform',
    label: isSuperAdmin.value ? 'PLATFORM' : 'HOME',
    items
  };
});

const tenantHubSecondaryBlocks = computed(() => {
  if (!tenantSettingsCardHubActive.value) return [];
  const blocks = [];
  const pushBlock = (title, catId) => {
    const c = roleFilteredCategories.value.find((x) => x.id === catId);
    if (!c?.items?.length) return;
    blocks.push({
      title,
      items: c.items.map((i) => ({
        category: c.id,
        item: i.id,
        label: i.label,
        icon: i.icon,
        description: PLATFORM_HUB_CARD_DESC[i.id] || '',
        superadminOnly: !!(i.roles?.length === 1 && i.roles[0] === 'super_admin')
      }))
    });
  };
  pushBlock('Workflow', 'workflow');
  pushBlock('Theming', 'theming');
  pushBlock('AI tools', 'ai');
  pushBlock('System & communications', 'system');
  return blocks;
});

/** Card-only layout for superadmin in Platform mode (no tenant) — replaces the left settings rail. */
const platformSettingsCardHubActive = computed(() => {
  if (!showTenantContextUi.value) return false;
  if (!isSuperAdmin.value) return false;
  if (!agencyStore.platformMode) return false;
  if (agencyStore.currentAgency?.id) return false;
  return true;
});

const PLATFORM_HUB_CARD_DESC = {
  'client-settings': 'Programs, paths, and client catalog — pick a tenant first.',
  'school-settings': 'School catalog and portal links — tenant-scoped.',
  'provider-settings': 'Provider records and catalog — tenant-scoped.',
  'provider-scheduling': 'Scheduling templates and rules — tenant-scoped.',
  'availability-intake': 'Provider availability and intake — agency tenants.',
  'shift-programs': 'Shift programs and publishing — needs tenant + feature flag.',
  'payroll-schedule': 'Pay schedules and payroll — agency tenants with Payroll enabled.',
  'departments': 'Org departments — tenant with budget management.',
  packages: 'Onboarding packages — requires Onboarding & Training for this tenant.',
  'digital-forms': 'Intake and digital form links — requires Onboarding & Training.',
  'challenge-management': 'Seasons and challenges — Learning or Affiliation orgs.',
  'checklist-items':
    'Platform-wide checklist templates (superadmin). Affects defaults for all tenants unless a tenant overrides.',
  'checklist-items-agency': 'Tenant checklist assignments — requires Onboarding & Training.',
  'field-definitions':
    'Platform-wide profile field catalog (superadmin). Shared field definitions across tenants.',
  'branding-config': 'Colors, fonts, logos — usually edited per tenant.',
  'branding-templates': 'Email and document templates.',
  assets: 'Icons, fonts, and shared creative assets.',
  'note-aid-kb': 'Note Aid knowledge base — tenant with Note Aid enabled.',
  communications: 'Transactional email templates.',
  'sms-numbers': 'Texting numbers — tenant-scoped.',
  'email-settings': 'SMTP and platform email defaults.',
  integrations: 'Third-party connections and API-related settings.',
  'management-team-config': 'Executive visibility — agency tenants.',
  archive: 'Soft-deleted records and restore tools.'
};

const platformHubSecondaryBlocks = computed(() => {
  if (!platformSettingsCardHubActive.value) return [];
  const blocks = [];
  const pushBlock = (title, hint, catId, excludeIds = []) => {
    const c = roleFilteredCategories.value.find((x) => x.id === catId);
    if (!c?.items?.length) return;
    const items = c.items
      .filter((i) => !excludeIds.includes(i.id))
      .map((i) => ({
        category: c.id,
        item: i.id,
        label: i.label,
        icon: i.icon,
        description: PLATFORM_HUB_CARD_DESC[i.id] || '',
        superadminOnly: !!(i.roles?.length === 1 && i.roles[0] === 'super_admin')
      }));
    if (!items.length) return;
    blocks.push({ title, hint, items });
  };
  pushBlock(
    'Workflow',
    'Most tools here need an active tenant — select one above, or use the selector inside the screen.',
    'workflow'
  );
  pushBlock(
    'Theming & assets',
    'Brand and creative assets are applied per tenant after you choose one above.',
    'theming'
  );
  pushBlock('AI tools', 'Options appear when platform and tenant flags allow Note Aid and related features.', 'ai');
  pushBlock(
    'System & communications',
    'Email, texting, integrations, and archive. Audit and viewport live under Platform home.',
    'system',
    ['audit-center', 'viewport-preview']
  );
  return blocks;
});

const visibleCategories = computed(() => {
  if (platformSettingsCardHubActive.value) {
    return [];
  }
  if (tenantSettingsCardHubActive.value) {
    return [];
  }
  return roleFilteredCategories.value;
});

const tenantHubDrillInActive = computed(() => {
  if (!tenantSettingsCardHubActive.value) return false;
  const id = selectedItem.value;
  if (!id) return false;
  return !['tenant-ws-home', 'tenant-ws-org-directory', 'tenant-ws-global-platform'].includes(id);
});

const platformHubDrillInActive = computed(() => {
  if (!platformSettingsCardHubActive.value) return false;
  const id = selectedItem.value;
  if (!id) return false;
  return id !== 'platform-ws-home';
});

// Component mapping
const componentMap = {
  AgencyManagement,
  AgencyPlatformManagement,
  SuperadminTenantHub,
  TenantSettingsCardHub,
  PlatformSettingsCardHub,
  AgencyManagementTeamConfig,
  BrandingConfig,
  BrandingTemplatesManagement,
  EmailTemplateManagement,
  EmailSettingsPanel,
  PlatformSettings,
  PlatformBillingManagement,
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
  ShiftProgramManagement,
  ViewportPreviewSettings,
  PayrollScheduleSettings,
  AgencyDepartmentsManagement,
  NoteAidKnowledgeBaseSettings,
  SmsNumbersManagement,
  TeamRolesManagement,
  BillingManagement,
  TenantFeaturesManagement,
  IntegrationsManagement,
  IntakeLinksView,
  ChallengeManagement,
  AuditCenterSettingsLink
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

const isAgencyOrg = (o) => String(o?.organization_type || 'agency').toLowerCase() === 'agency';

const selectableAgencies = computed(() => {
  const list = isSuperAdmin.value ? (agencyStore.agencies || []) : (agencyStore.userAgencies || agencyStore.agencies || []);
  const activeCategory = selectedCategory.value;
  const activeItem = selectedItem.value;
  const activeIsPayroll = activeCategory === 'workflow' && activeItem === 'payroll-schedule';
  const activeIsManagementTeam = activeItem === 'management-team-config';
  const activeIsAvailabilityIntake = activeCategory === 'workflow' && activeItem === 'availability-intake';
  const activeIsDepartments = activeCategory === 'workflow' && activeItem === 'departments';
  const activeIsChallengeManagement = activeCategory === 'workflow' && activeItem === 'challenge-management';
  const needsAgencyOnly = activeIsPayroll || activeIsManagementTeam || activeIsAvailabilityIntake || activeIsDepartments;
  const isLearningOrAffiliation = (o) => ['learning', 'affiliation'].includes(String(o?.organization_type || '').toLowerCase());
  let filtered = needsAgencyOnly ? (list || []).filter(isAgencyOrg) : (list || []);
  if (activeIsChallengeManagement) filtered = (list || []).filter(isLearningOrAffiliation);
  return [...filtered].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
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
  
  const base = item.props || {};
  const scopedId = settingsScopedAgencyId.value;
  const withScoped = (obj) => {
    if (!obj || typeof obj !== 'object') return scopedId != null ? { scopedAgencyId: scopedId } : {};
    return scopedId != null ? { ...obj, scopedAgencyId: scopedId } : { ...obj };
  };
  const resolveItemIcon = (id) => getSettingsIconUrl(id);

  if (selectedCategory.value === 'workflow' && selectedItem.value === 'school-settings' && props.initialSchoolId) {
    return withScoped({ ...base, initialSchoolId: props.initialSchoolId });
  }
  if (selectedCategory.value === 'platform' && selectedItem.value === 'platform-ws-home') {
    return withScoped({
      ...base,
      secondaryBlocks: platformHubSecondaryBlocks.value,
      onOpenArea: openPlatformHubArea,
      resolveItemIcon
    });
  }
  if (selectedCategory.value === 'platform' && selectedItem.value === 'tenant-ws-home') {
    return withScoped({
      ...base,
      isSuperAdmin: isSuperAdmin.value,
      secondaryBlocks: tenantHubSecondaryBlocks.value,
      onOpenArea: openTenantHubArea,
      resolveItemIcon
    });
  }
  if (selectedCategory.value === 'platform' && selectedItem.value === 'tenant-ws-org-directory') {
    const tid = agencyStore.currentAgency?.id;
    return withScoped({
      ...base,
      embeddedOrgId: null,
      embeddedTab: 'general',
      organizationDirectoryTenantId: tid != null && tid !== '' ? tid : null
    });
  }
  if (selectedCategory.value === 'general' && selectedItem.value === 'company-profile') {
    const agencyId =
      tenantSettingsCardHubActive.value && agencyStore.currentAgency?.id
        ? String(agencyStore.currentAgency.id)
        : route.query.agencyId;
    const agencyTab = route.query.agencyTab || 'general';
    if (agencyId) {
      return withScoped({ ...base, embeddedOrgId: agencyId, embeddedTab: agencyTab });
    }
  }
  return withScoped({ ...base });
});

const selectedItemAgencyOnly = computed(() => {
  if (!selectedCategory.value || !selectedItem.value) return false;
  const category = allCategories.find(c => c.id === selectedCategory.value);
  const item = category?.items?.find(i => i.id === selectedItem.value);
  return !!item?.agencyOnly;
});

const isChallengeManagement = computed(() => selectedCategory.value === 'workflow' && selectedItem.value === 'challenge-management');

const agencyContextLabel = computed(() => {
  if (isChallengeManagement.value) return 'Organization';
  return isSuperAdmin.value ? 'Tenant' : 'Agency';
});

const agencyContextPlaceholder = computed(() => {
  if (isChallengeManagement.value) return 'Select a Learning or Affiliation organization…';
  return isSuperAdmin.value ? 'Select a tenant…' : 'Select an agency…';
});

const agencyContextEmptyMessage = computed(() => {
  if (isChallengeManagement.value) return 'Select a Learning or Affiliation organization to manage seasons and weekly challenges.';
  if (isSuperAdmin.value && !agencyStore.currentAgency && agencyStore.platformMode) {
    return 'Select a tenant from the logo bar above to use this screen.';
  }
  return isSuperAdmin.value ? 'Select a tenant to continue.' : 'Select an agency to continue.';
});

const selectedAgencyIsAgencyOrg = computed(() => {
  const cur = agencyStore.currentAgency;
  return isAgencyOrg(cur);
});

const topLevelTenantsForPicker = computed(() => {
  const list = isSuperAdmin.value
    ? (agencyStore.agencies || [])
    : (agencyStore.userAgencies || agencyStore.agencies || []);
  const filtered = (list || []).filter(isAgencyOrg);
  const byId = new Map();
  for (const a of filtered) {
    if (a?.id != null) byId.set(Number(a.id), a);
  }
  return [...byId.values()].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});

const isMultiTenantAdmin = computed(
  () => String(authStore.user?.role || '').toLowerCase() === 'admin' && topLevelTenantsForPicker.value.length > 1
);

const filteredTopLevelTenants = computed(() => {
  const q = String(tenantPickerSearch.value || '').trim().toLowerCase();
  const list = topLevelTenantsForPicker.value;
  if (!q) return list;
  return list.filter((a) => {
    const hay = `${String(a?.name || '').toLowerCase()} ${String(a?.slug || '').toLowerCase()} ${String(
      a?.official_name || a?.officialName || ''
    ).toLowerCase()}`;
    return hay.includes(q);
  });
});

const showTenantPickerShell = computed(() => {
  if (!showTenantContextUi.value) return false;
  if (isSuperAdmin.value) return true;
  return isMultiTenantAdmin.value;
});

const showTenantEntryGate = computed(() => {
  if (!showTenantContextUi.value) return false;
  if (!isSuperAdmin.value) return false;
  if (agencyStore.currentAgency) return false;
  if (agencyStore.platformMode) return false;
  if (route.query.agencyId) return false;
  return true;
});

const resolveTenantAssetUrl = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return toUploadsUrl(s);
};

const tenantLogoUrl = (a) => {
  if (!a) return null;

  const fromLogoUrl = resolveTenantAssetUrl(a.logo_url ?? a.logoUrl);
  if (fromLogoUrl) return fromLogoUrl;

  const fromLogoPath = resolveTenantAssetUrl(a.logo_path ?? a.logoPath);
  if (fromLogoPath) return fromLogoPath;

  const fromOrgLogoUrl = resolveTenantAssetUrl(a.organization_logo_url ?? a.organizationLogoUrl);
  if (fromOrgLogoUrl) return fromOrgLogoUrl;

  const fromOrgLogoPath = resolveTenantAssetUrl(a.organization_logo_path ?? a.organizationLogoPath);
  if (fromOrgLogoPath) return fromOrgLogoPath;

  const orgLogoIconId = a.organization_logo_icon_id ?? a.organizationLogoIconId;
  if (orgLogoIconId) {
    const u = brandingStore.iconUrlById(orgLogoIconId);
    if (u) return u;
  }

  const fromIconFile = resolveTenantAssetUrl(a.icon_file_path ?? a.iconFilePath);
  if (fromIconFile) return fromIconFile;

  const iconId = a.icon_id ?? a.iconId;
  if (iconId) {
    const u = brandingStore.iconUrlById(iconId);
    if (u) return u;
  }
  return null;
};

/** Stable hue for tenant avatars / accents (0–359). */
const tenantHueFromId = (rawId) => {
  const id = Number(rawId);
  const n = Number.isFinite(id) ? id : String(rawId || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return Math.abs((n * 7919 + n * 104729) % 360);
};

const tenantAvatarWrapStyle = (a) => {
  if (!a) return {};
  const h = tenantHueFromId(a.id);
  const h2 = (h + 42) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${h} 52% 42%) 0%, hsl(${h2} 48% 34%) 100%)`,
    borderColor: `hsla(${h}, 40%, 20%, 0.4)`
  };
};

const tenantInitials = (a) => {
  const raw = String(a?.name || 'T').trim();
  const tokens = raw.split(/\s+/).filter(Boolean);
  const firstLetter = (word) => {
    const m = String(word || '').match(/[A-Za-z\u00C0-\u024F]/);
    return m ? m[0] : '';
  };
  if (tokens.length >= 2) {
    const a0 = firstLetter(tokens[0]);
    const a1 = firstLetter(tokens[1]);
    if (a0 && a1) return `${a0}${a1}`.toUpperCase().slice(0, 2);
  }
  const w0 = tokens[0] || raw;
  let letters = '';
  for (let i = 0; i < w0.length && letters.length < 2; i += 1) {
    const ch = w0[i];
    if (/[A-Za-z\u00C0-\u024F]/.test(ch)) letters += ch;
  }
  if (letters.length >= 2) return letters.toUpperCase().slice(0, 2);
  if (letters.length === 1) return `${letters}${letters}`.toUpperCase().slice(0, 2);
  const alnum = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return (alnum.slice(0, 2) || 'T').slice(0, 2);
};

const isPickerTenantActive = (a) => Number(agencyStore.currentAgency?.id) === Number(a?.id);

const findSelectableAgencyBySettingsSlug = (slug) => {
  const target = normalizeSettingsSlug(slug);
  if (!target) return null;
  const sources = [
    selectableAgencies?.value,
    agencyStore.agencies,
    agencyStore.userAgencies
  ];
  for (const list of sources) {
    if (!Array.isArray(list)) continue;
    const match = list.find((org) => pickOrgSettingsSlug(org) === target);
    if (match) return match;
  }
  return null;
};

const buildSettingsLocation = ({ org = null, category = 'platform', item = null } = {}) => {
  const slug = pickOrgSettingsSlug(org);
  const path = slug ? `/${slug}/admin/settings` : '/admin/settings';
  const params = new URLSearchParams();
  if (category) params.set('category', String(category));
  if (item) params.set('item', String(item));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

const navigateToSettingsLocation = ({ org = null, category = 'platform', item = null } = {}) => {
  const target = buildSettingsLocation({ org, category, item });
  if (typeof window !== 'undefined' && window.location?.assign) {
    window.location.assign(target);
    return;
  }
  router.push(target);
};

const syncAgencyIdToRoute = () => {
  if (props.disableRouteSync || !showTenantContextUi.value) return;
  const q = { ...route.query };
  const raw = String(selectedAgencyId.value || '').trim();
  if (raw) q.agencyId = raw;
  else delete q.agencyId;
  router.replace({ query: q });
};

const syncAgencyContextFromRouteSlug = async () => {
  const routeSlug = currentRouteSettingsSlug.value;
  if (!routeSlug) {
    if (isSuperAdmin.value && showTenantContextUi.value && !route.query?.agencyId) {
      agencyStore.setPlatformMode();
      void brandingStore.syncDocumentThemeFromPlatformBranding();
    }
    return;
  }

  let target = findSelectableAgencyBySettingsSlug(routeSlug);
  if (!target) {
    target = await organizationStore.fetchBySlug(routeSlug);
  }
  if (!target?.id) return;

  const currentId = Number(agencyStore.currentAgency?.id || 0);
  const currentSlug = pickOrgSettingsSlug(agencyStore.currentAgency);
  if (currentId !== Number(target.id) || currentSlug !== routeSlug) {
    agencyStore.setCurrentAgency(target);
  }
  selectedAgencyId.value = String(target.id);
  brandingStore.syncDocumentThemeFromSelectedAgency({ skipRouteSlugGuard: true });
};

/** After picking a tenant, leave global Platform Settings and open the card hub (superadmin + admin). */
const navigateToTenantWorkspaceAfterPick = () => {
  if (agencyStore.platformMode || !agencyStore.currentAgency) return;
  if (!showTenantContextUi.value) return;
  const r = String(authStore.user?.role || '').toLowerCase();
  if (r !== 'super_admin' && r !== 'admin') return;
  if (selectedCategory.value === 'platform' && selectedItem.value === 'platform-settings') {
    nextTick(() => selectItem('platform', 'tenant-ws-home'));
  }
};

const selectTenantFromPicker = (a) => {
  if (!a?.id) return;
  const pickId = Number(a.id);
  /** True when re-selecting the tenant that was already active before this handler runs. */
  const wasAlreadyThisTenant = Number(agencyStore.currentAgency?.id) === pickId;
  const routeSlug = currentRouteSettingsSlug.value;
  const targetSlug = pickOrgSettingsSlug(a);
  const shouldHardNavigate =
    showTenantContextUi.value &&
    !props.disableRouteSync &&
    ['super_admin', 'admin'].includes(String(authStore.user?.role || '').toLowerCase());

  if (shouldHardNavigate) {
    if (wasAlreadyThisTenant && routeSlug === targetSlug) {
      const refsOnTenantHub =
        selectedCategory.value === 'platform' && selectedItem.value === 'tenant-ws-home';
      if (refsOnTenantHub) return;
    }
    agencyStore.setCurrentAgency(a);
    selectedAgencyId.value = String(a.id);
    brandingStore.syncDocumentThemeFromSelectedAgency({ skipRouteSlugGuard: true });
    navigateToSettingsLocation({ org: a, category: 'platform', item: 'tenant-ws-home' });
    return;
  }

  agencyStore.setCurrentAgency(a);
  selectedAgencyId.value = String(a.id);
  const r = String(authStore.user?.role || '').toLowerCase();
  if (showTenantContextUi.value && (r === 'super_admin' || r === 'admin')) {
    const nextQuery = {
      ...route.query,
      agencyId: String(a.id),
      category: 'platform',
      item: 'tenant-ws-home'
    };
    if (!props.disableRouteSync) {
      router.replace({ query: nextQuery });
    }

    const refsOnTenantHub =
      selectedCategory.value === 'platform' && selectedItem.value === 'tenant-ws-home';

    // Second click same chip: don’t call selectItem again — its two-phase null reset races with this path
    // and can leave category/item null → empty pane + broken branding until refresh.
    if (wasAlreadyThisTenant && refsOnTenantHub) {
      return;
    }

    // Same tenant again but pane is empty (refs cleared mid-flight or desynced from route).
    if (wasAlreadyThisTenant && (!selectedCategory.value || !selectedItem.value)) {
      selectedCategory.value = 'platform';
      selectedItem.value = 'tenant-ws-home';
      expandedCategoryIds.value = new Set(['platform']);
      return;
    }

    nextTick(() => selectItem('platform', 'tenant-ws-home'));
    return;
  }
  syncAgencyIdToRoute();
  navigateToTenantWorkspaceAfterPick();
};

const enterPlatformToolsOnly = ({ item = 'platform-ws-home' } = {}) => {
  const shouldHardNavigate =
    showTenantContextUi.value &&
    !props.disableRouteSync &&
    isSuperAdmin.value;
  if (shouldHardNavigate) {
    agencyStore.setPlatformMode();
    void brandingStore.syncDocumentThemeFromPlatformBranding();
    navigateToSettingsLocation({ org: null, category: 'platform', item });
    return;
  }

  agencyStore.setPlatformMode();
  selectedAgencyId.value = '';
  const q = buildSettingsReplaceQuery('platform', item);
  if (!props.disableRouteSync && showTenantContextUi.value) {
    router.replace({ query: q });
  } else {
    syncAgencyIdToRoute();
  }
  // Avoid selectItem’s second replace racing with a stale route.query that still had agencyId.
  selectedCategory.value = null;
  selectedItem.value = null;
  nextTick(() => {
    selectedCategory.value = 'platform';
    selectedItem.value = item;
    expandedCategoryIds.value = new Set(['platform']);
  });
};

const applySelectedAgencyFromIdString = async (raw) => {
  const id = raw ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(id) || id < 1) {
    if (isSuperAdmin.value) agencyStore.setPlatformMode();
    return;
  }
  let agency =
    selectableAgencies.value.find((a) => a.id === id) ||
    (agencyStore.agencies || []).find((a) => a.id === id) ||
    (agencyStore.userAgencies || []).find((a) => a.id === id);
  if (agency) {
    agencyStore.setCurrentAgency(agency);
    return;
  }
  if (isSuperAdmin.value) {
    const hydrated = await agencyStore.hydrateAgencyById(id);
    if (hydrated) agencyStore.setCurrentAgency(hydrated);
  }
};

const handleAgencySelection = async () => {
  await applySelectedAgencyFromIdString(selectedAgencyId.value);
  if (!props.disableRouteSync && showTenantContextUi.value && (isSuperAdmin.value || showTenantPickerShell.value)) {
    syncAgencyIdToRoute();
  }
};

/** Platform settings screens that are never scoped to a tenant — URL must not carry agencyId or the route watch will restore the tenant and break platform mode + branding. */
const PLATFORM_SOLO_ROUTE_ITEMS = new Set(['platform-ws-home', 'platform-settings', 'platform-billing', 'platform-all-agencies']);

const buildSettingsReplaceQuery = (categoryId, itemId) => {
  const q = { ...route.query, category: categoryId, item: itemId };
  if (categoryId === 'platform' && PLATFORM_SOLO_ROUTE_ITEMS.has(itemId)) {
    delete q.agencyId;
  }
  // After choosing Platform chip, route.query can still contain agencyId for a tick — always strip while platform-only.
  if (isSuperAdmin.value && agencyStore.platformMode && !agencyStore.currentAgency?.id) {
    delete q.agencyId;
  }
  return q;
};

const selectItem = (categoryId, itemId) => {
  // Two-phase update: clear first, then set new selection on next tick.
  // Avoids Vue patch race (emitsOptions / __vnode errors when switching dynamic components).
  const prevCategory = selectedCategory.value;
  const prevItem = selectedItem.value;
  if (prevCategory === categoryId && prevItem === itemId) return;

  selectedCategory.value = null;
  selectedItem.value = null;

  nextTick(() => {
    selectedCategory.value = categoryId;
    selectedItem.value = itemId;
    expandedCategoryIds.value = new Set([String(categoryId)]);
    if (!props.disableRouteSync && showTenantContextUi.value) {
      router.replace({
        query: buildSettingsReplaceQuery(categoryId, itemId)
      });
    }
  });
};

const openTenantHubArea = ({ category, item, agencyTab }) => {
  const id = agencyStore.currentAgency?.id;
  if (!id) return;
  const q = { ...route.query, category, item, agencyId: String(id) };
  if (agencyTab) q.agencyTab = agencyTab;
  else delete q.agencyTab;
  if (!props.disableRouteSync && showTenantContextUi.value) {
    router.replace({ query: q });
  }
  selectItem(category, item);
};

/** Platform hub navigation: no tenant in context — clear agencyId from the URL when jumping between areas. */
const openPlatformHubArea = ({ category, item, agencyTab }) => {
  const q = { ...route.query, category, item };
  delete q.agencyId;
  if (agencyTab) q.agencyTab = agencyTab;
  else delete q.agencyTab;
  if (!props.disableRouteSync && showTenantContextUi.value) {
    router.replace({ query: q });
  }
  selectItem(category, item);
};

const closeModal = () => {
  router.push('/admin');
};

const lockedAgencyLabel = computed(() => {
  const cur = agencyStore.currentAgency;
  if (cur?.name) return cur.name;
  return 'Locked';
});

const applyInitialAgencySelection = async () => {
  const raw = props.initialAgencyId;
  const id = raw !== null && raw !== undefined && raw !== '' ? parseInt(String(raw), 10) : NaN;
  if (Number.isNaN(id)) return;

  const inList = selectableAgencies.value.find((a) => Number(a?.id) === Number(id));
  if (inList) {
    agencyStore.setCurrentAgency(inList);
    return;
  }

  // Super admins can hydrate agencies by id even if not in-memory yet.
  if (isSuperAdmin.value) {
    const hydrated = await agencyStore.hydrateAgencyById(id);
    if (hydrated) agencyStore.setCurrentAgency(hydrated);
  }
};

// Initialize from URL query parameters
onMounted(async () => {
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

  await syncAgencyContextFromRouteSlug();

  // Optional deep-link agency selection (used by other pages/modals)
  if (!props.disableRouteSync && showTenantContextUi.value && !currentRouteSettingsSlug.value) {
    const agencyIdParam = route.query.agencyId;
    if (agencyIdParam) {
      const id = parseInt(String(agencyIdParam), 10);
      if (!Number.isNaN(id)) {
        const target =
          selectableAgencies.value.find((a) => Number(a?.id) === Number(id)) ||
          (agencyStore.agencies || []).find((a) => Number(a?.id) === Number(id)) ||
          (agencyStore.userAgencies || []).find((a) => Number(a?.id) === Number(id));
        if (target) {
          agencyStore.setCurrentAgency(target);
        } else if (isSuperAdmin.value) {
          const hydrated = await agencyStore.hydrateAgencyById(id);
          if (hydrated) agencyStore.setCurrentAgency(hydrated);
        }
      }
    }
  }

  // Optional initial agency selection (for embedded/portal contexts)
  await applyInitialAgencySelection();

  selectedAgencyId.value = agencyStore.currentAgency?.id ? String(agencyStore.currentAgency.id) : '';
  
  // Initial selection: props > route query (when route sync is enabled) > default
  const trySetSelection = (categoryId, itemId) => {
    if (!categoryId || !itemId) return false;
    const cat = allCategories.find((c) => c.id === categoryId);
    const itemMeta = cat?.items?.find((i) => i.id === itemId);
    if (!itemMeta) return false;
    const hubIds = ['tenant-ws-home', 'tenant-ws-org-directory', 'tenant-ws-global-platform'];
    const hubOk =
      tenantSettingsCardHubActive.value && categoryId === 'platform' && hubIds.includes(itemId);
    const platformHubOk =
      platformSettingsCardHubActive.value &&
      categoryId === 'platform' &&
      (itemId === 'platform-ws-home' ||
        itemId === 'platform-billing' ||
        itemId === 'platform-all-agencies' ||
        itemId === 'platform-settings' ||
        itemId === 'tenant-ws-global-platform');
    const navOk = roleFilteredCategories.value.some(
      (c) => c.id === categoryId && c.items.some((i) => i.id === itemId)
    );
    if (!hubOk && !navOk && !platformHubOk) return false;
    selectedCategory.value = categoryId;
    selectedItem.value = itemId;
    expandedCategoryIds.value = new Set([String(categoryId)]);
    return true;
  };

  if (trySetSelection(props.initialCategoryId, props.initialItemId)) {
    // selection set
  } else if (!props.disableRouteSync && showTenantContextUi.value) {
    const categoryParam = route.query.category;
    const itemParam = route.query.item;
    if (categoryParam && itemParam && trySetSelection(categoryParam, itemParam)) {
      // selection set
    }
  }
  
  // Default to first visible category and item (only if no selection was established)
  if (!selectedCategory.value || !selectedItem.value) {
    if (platformSettingsCardHubActive.value) {
      selectedCategory.value = 'platform';
      selectedItem.value = 'platform-ws-home';
      expandedCategoryIds.value = new Set(['platform']);
    } else if (tenantSettingsCardHubActive.value) {
      selectedCategory.value = 'platform';
      selectedItem.value = 'tenant-ws-home';
      expandedCategoryIds.value = new Set(['platform']);
    } else if (visibleCategories.value.length > 0) {
      const firstCategory = visibleCategories.value[0];
      if (firstCategory.items.length > 0) {
        selectedCategory.value = firstCategory.id;
        selectedItem.value = firstCategory.items[0].id;
        expandedCategoryIds.value = new Set([String(firstCategory.id)]);
      }
    }
  }

  if (
    isSuperAdmin.value &&
    agencyStore.currentAgency?.id &&
    selectedCategory.value === 'platform' &&
    selectedItem.value === 'platform-settings'
  ) {
    nextTick(() => selectItem('platform', 'tenant-ws-home'));
  }

  // Ensure icon IDs referenced by agency/platform can be resolved and preloaded.
  await trackPromise(prefetchSettingsSidebarIcons(), 'Loading…');
});

watch(() => agencyStore.currentAgency, (a) => {
  selectedAgencyId.value = a?.id ? String(a.id) : '';
  // Prefetch in background only: awaiting + trackPromise here ran the global loader and image preloads
  // on every chip click, so rapid tenant switches felt stuck until the last slow prefetch finished.
  void prefetchSettingsSidebarIcons();
  const r = String(authStore.user?.role || '').toLowerCase();
  if (
    (r === 'super_admin' || r === 'admin') &&
    a?.id &&
    selectedCategory.value === 'platform' &&
    selectedItem.value === 'platform-settings'
  ) {
    nextTick(() => selectItem('platform', 'tenant-ws-home'));
  }
});

// Watch for route changes (for browser back/forward)
watch(() => route.query, (newQuery) => {
  if (props.disableRouteSync || !showTenantContextUi.value) return;

  // Stale agencyId + platform-only item would re-hydrate a tenant, clear platformMode, and break theme + branding.
  if (
    isSuperAdmin.value &&
    newQuery.category === 'platform' &&
    PLATFORM_SOLO_ROUTE_ITEMS.has(String(newQuery.item || '')) &&
    newQuery.agencyId
  ) {
    agencyStore.setPlatformMode();
    const q = { ...newQuery };
    delete q.agencyId;
    router.replace({ query: q });
    return;
  }

  if (
    tenantSettingsCardHubActive.value &&
    newQuery.category === 'platform' &&
    newQuery.item === 'platform-settings' &&
    newQuery.agencyId
  ) {
    router.replace({
      query: { ...newQuery, category: 'platform', item: 'tenant-ws-home' }
    });
    return;
  }
  if (newQuery.category && newQuery.item) {
    if (
      platformSettingsCardHubActive.value &&
      newQuery.category === 'platform' &&
      ['tenant-ws-home', 'tenant-ws-org-directory', 'agency-platform', 'tenant-overview'].includes(
        newQuery.item
      )
    ) {
      const q = { ...newQuery, category: 'platform', item: 'platform-ws-home' };
      delete q.agencyId;
      router.replace({ query: q });
      return;
    }
    const hubIds = ['tenant-ws-home', 'tenant-ws-org-directory', 'tenant-ws-global-platform'];
    const inHubSidebar =
      tenantSettingsCardHubActive.value &&
      newQuery.category === 'platform' &&
      hubIds.includes(newQuery.item);
    const inFullNav = roleFilteredCategories.value.some(
      (c) => c.id === newQuery.category && c.items.some((i) => i.id === newQuery.item)
    );
    const inPlatformHubHome =
      platformSettingsCardHubActive.value &&
      newQuery.category === 'platform' &&
      ['platform-ws-home', 'platform-all-agencies', 'platform-settings', 'platform-billing', 'tenant-ws-global-platform'].includes(
        newQuery.item
      );
    const categoryFromNav = roleFilteredCategories.value.find((c) => c.id === newQuery.category);
    const itemFromNav = categoryFromNav?.items?.find((i) => i.id === newQuery.item);
    if (inHubSidebar || inFullNav || itemFromNav || inPlatformHubHome) {
      selectedCategory.value = newQuery.category;
      selectedItem.value = newQuery.item;
      expandedCategoryIds.value = new Set([String(newQuery.category)]);
    }
  }

  // Support deep-linking to an agency context (skip if URL already matches store — avoids double setCurrentAgency + duplicate work per chip click)
  if (newQuery.agencyId) {
    const id = parseInt(String(newQuery.agencyId), 10);
    if (!Number.isNaN(id) && Number(agencyStore.currentAgency?.id) !== id) {
      const target =
        selectableAgencies.value.find((a) => Number(a?.id) === Number(id)) ||
        (agencyStore.agencies || []).find((a) => Number(a?.id) === Number(id)) ||
        (agencyStore.userAgencies || []).find((a) => Number(a?.id) === Number(id));
      if (target) {
        agencyStore.setCurrentAgency(target);
      } else if (isSuperAdmin.value) {
        agencyStore.hydrateAgencyById(id).then((h) => {
          if (h) agencyStore.setCurrentAgency(h);
        });
      }
    }
  }
}, { immediate: true });

watch(
  () => [selectedCategory.value, selectedItem.value],
  ([cat, item]) => {
    if (cat !== 'platform' || item !== 'tenant-ws-global-platform') return;
    if (!isSuperAdmin.value) return;
    enterPlatformToolsOnly({ item: 'platform-settings' });
    nextTick(() => selectItem('platform', 'platform-settings'));
  }
);

watch(
  () => currentRouteSettingsSlug.value,
  () => {
    void syncAgencyContextFromRouteSlug();
  }
);

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
  'platform-settings': { idField: 'platform_settings_icon_id', pathField: 'platform_settings_icon_path' },
  'platform-billing': { idField: 'billing_icon_id', pathField: 'billing_icon_path' },
  'archive': { idField: 'archive_icon_id', pathField: 'archive_icon_path' }
};

// Get icon URL for a settings item
const getSettingsIconUrl = (itemId) => {
  const meta = settingsIconMap[itemId];
  if (!meta) return null;

  // 1) Agency override (if present)
  const agency = agencyStore.currentAgency;
  const agencyIconId = agency && meta.idField ? agency[meta.idField] : null;
  if (agencyIconId) {
    const url = brandingStore.iconUrlById(agencyIconId);
    if (url) return url;
  }

  // 2) Platform default
  const platformBranding = brandingStore.platformBranding;
  if (!platformBranding) return null;

  const platformPath = meta.pathField ? platformBranding[meta.pathField] : null;
  if (platformPath) return toUploadsUrl(String(platformPath));

  const platformIconId = meta.idField ? platformBranding[meta.idField] : null;
  if (platformIconId) {
    const url = brandingStore.iconUrlById(platformIconId);
    if (url) return url;
  }

  return null;
};

/** Bumped on each prefetch start; stale async work exits early so rapid tenant switches don’t queue. */
let settingsSidebarPrefetchGeneration = 0;

const prefetchSettingsSidebarIcons = async () => {
  const gen = ++settingsSidebarPrefetchGeneration;
  const pb = brandingStore.platformBranding || null;
  const a = agencyStore.currentAgency || null;
  const ids = [];
  for (const meta of Object.values(settingsIconMap)) {
    if (!meta?.idField) continue;
    if (a?.[meta.idField]) ids.push(a[meta.idField]);
    if (pb?.[meta.idField]) ids.push(pb[meta.idField]);
  }
  await brandingStore.prefetchIconIds(ids);
  if (gen !== settingsSidebarPrefetchGeneration) return;

  // Preload the images for the visible sidebar entries so the page feels "done" when the loader disappears.
  const urls = [];
  const preloadCats =
    platformSettingsCardHubActive.value || tenantSettingsCardHubActive.value
      ? roleFilteredCategories.value
      : visibleCategories.value;
  for (const cat of preloadCats || []) {
    for (const item of cat.items || []) {
      const u = getSettingsIconUrl(item.id);
      if (u) urls.push(u);
    }
  }
  await preloadImages(urls, { concurrency: 6, timeoutMs: 8000 });
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

.modal-body-with-tenant-shell {
  flex-direction: column;
}

.settings-main-row {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.settings-main-row--solo-hub .settings-content {
  background: var(--bg-alt, #f8fafc);
}

.settings-main-row--no-sidebar .settings-content {
  width: 100%;
  max-width: none;
}

.settings-tenant-entry-gate {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 32px 40px;
  background: var(--bg-alt);
}

.tenant-entry-gate-header {
  max-width: 720px;
  margin-bottom: 24px;
}

.tenant-entry-title {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.tenant-entry-subtitle {
  margin: 0 0 16px 0;
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.tenant-logo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
  max-width: 1100px;
}

.tenant-logo-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 16px 12px;
  border: 2px solid var(--tenant-chip-tint, var(--border));
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.12s;
  font: inherit;
  color: inherit;
}

.tenant-logo-card:hover {
  border-color: var(--text-secondary);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

.tenant-logo-card-active {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.06);
}

.tenant-logo-card-platform {
  background: linear-gradient(180deg, #fff 0%, var(--bg-alt) 100%);
}

.tenant-logo-wrap {
  width: 72px;
  height: 72px;
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  font-size: 28px;
}

.tenant-logo-wrap-sm {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  font-size: 18px;
}

.tenant-logo-fallback {
  background: rgba(0, 0, 0, 0.06);
}

.tenant-logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  padding: 4px;
  box-sizing: border-box;
}

.tenant-logo-img-sm {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  padding: 3px;
  box-sizing: border-box;
}

.tenant-logo-initials {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-secondary);
}

.tenant-logo-initials-sm {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-secondary);
}

.tenant-logo-initials-on-avatar {
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
}

.tenant-logo-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tenant-logo-slug {
  font-size: 11px;
  line-height: 1.2;
}

.settings-tenant-picker-shell {
  flex-shrink: 0;
  border-bottom: 2px solid var(--border);
  background: var(--bg-alt);
  padding: 14px 20px 16px;
}

.tenant-picker-shell-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  margin-bottom: 12px;
}

.tenant-picker-shell-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.tenant-picker-search {
  min-width: 160px;
  flex: 1 1 220px;
  max-width: 320px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}

.tenant-picker-search-wide {
  max-width: none;
  width: 100%;
}

.tenant-picker-active-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.85);
}

.tenant-picker-active-logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-alt);
  flex-shrink: 0;
}

.tenant-picker-active-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tenant-picker-active-name {
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tenant-picker-active-meta {
  font-size: 12px;
}

.tenant-picker-hint {
  flex: 1 1 100%;
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
}

.tenant-picker-hint.muted {
  color: var(--text-secondary);
}

.tenant-mode-toggle-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 10px 0 6px 0;
}

.tenant-mode-toggle-btn {
  flex: 1 1 160px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt, #f8fafc);
  font: inherit;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  text-align: center;
  color: var(--text-primary);
}

.tenant-mode-toggle-btn:hover:not(:disabled) {
  border-color: var(--accent, var(--primary));
}

.tenant-mode-toggle-btn--active {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
  background: #fff;
}

.tenant-mode-toggle-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.tenant-workspace-quick-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  margin: 6px 0 12px 0;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

.tenant-quick-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 8px 14px !important;
  border: 1px solid color-mix(in srgb, var(--primary) 35%, #ffffff 65%);
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary) 6%, #ffffff 94%);
  color: var(--primary) !important;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  text-decoration: none !important;
}

.tenant-quick-link:hover,
.tenant-quick-link:focus-visible {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 12%, #ffffff 88%);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 20%, #ffffff 80%);
}

.tenant-chip-platform-icon,
.tenant-entry-platform-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
  display: block;
}

.tenant-logo-scroller {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
}

.tenant-logo-chip {
  flex: 0 0 auto;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 88px;
  padding: 8px 6px;
  border: 2px solid var(--tenant-chip-tint, var(--border));
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: border-color 0.15s, background 0.15s;
}

.tenant-logo-chip:hover {
  border-color: var(--text-secondary);
}

.tenant-logo-chip-active {
  border-color: var(--text-primary);
  background: rgba(255, 255, 255, 0.95);
}

.tenant-chip-label {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 100%;
}

.muted {
  color: var(--text-secondary);
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

.settings-content--solo-hub {
  padding: 28px 32px 36px;
}

.tenant-hub-back-row {
  margin: -8px 0 16px 0;
}

.tenant-hub-back-btn {
  padding: 0;
  font-weight: 600;
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
