<template>
  <div class="container">
    <!-- Dashboard Header with Logo (shown in preview mode) -->
    <div v-if="previewMode" class="dashboard-header-preview">
      <div class="header-content">
        <BrandingLogo v-if="previewAgencyLogoUrl" size="large" class="dashboard-logo" :logo-url="previewAgencyLogoUrl" />
        <div>
          <h1>{{ isPending ? 'Pre-Hire Checklist' : 'My Dashboard' }}</h1>
        </div>
      </div>
    </div>
    <div v-else class="dashboard-header-user">
      <h1>{{ isPending ? 'Pre-Hire Checklist' : 'My Dashboard' }}</h1>
      <span class="badge badge-user">Personal</span>
      <span v-if="tierBadgeText" class="badge badge-tier" :class="tierBadgeKind">{{ tierBadgeText }}</span>
    </div>

    <!-- Agency announcement banner (Dashboard) -->
    <div v-if="!previewMode && dashboardBanner && dashboardBanner.message" class="agency-announcement-banner">
      <div class="agency-announcement-content">
        <strong>{{ dashboardBanner.message }}</strong>
      </div>
    </div>
    
    <!-- Pending Completion Button -->
    <div v-if="isPending && pendingCompletionStatus?.allComplete && !pendingCompletionStatus?.accessLocked && (userStatus === 'PREHIRE_OPEN' || userStatus === 'pending')" class="pending-completion-banner">
      <div class="completion-content">
        <strong>✓ All Items Complete</strong>
        <p>You have completed all required pre-hire tasks. Mark the hiring process as complete when you're ready.</p>
        <PendingCompletionButton v-if="!previewMode" @completed="handlePendingCompleted" />
      </div>
    </div>
    
    <!-- Ready for Review Banner -->
    <div v-if="userStatus === 'PREHIRE_REVIEW' || userStatus === 'ready_for_review'" class="ready-for-review-banner">
      <div class="review-content">
        <strong>✓ Pre-Hire Process Complete</strong>
        <p>You have completed all required pre-hire tasks. Your account is now ready for review by your administrator. You will be notified when your account is activated.</p>
        <p><em>Your access to this portal has been locked. An administrator will review your information and activate your account.</em></p>
      </div>
    </div>
    
    <!-- Onboarding Status Banner -->
    <div v-if="userStatus === 'ONBOARDING'" class="onboarding-banner">
      <div class="onboarding-content">
        <strong>📚 Onboarding in Progress</strong>
        <p>You are currently completing your onboarding training. Continue working through your assigned modules and documents.</p>
      </div>
    </div>
    
    <!-- Status Warning Banner (for legacy completed status) -->
    <div v-if="(userStatus === 'ACTIVE_EMPLOYEE' || userStatus === 'completed') && daysRemaining !== null" class="status-warning-banner">
      <div class="warning-content">
        <strong>⚠️ Onboarding Complete</strong>
        <p v-if="daysRemaining > 0">
          You have {{ daysRemaining }} day{{ daysRemaining !== 1 ? 's' : '' }} remaining to download your finalized onboarding document.
        </p>
        <p v-else>
          Your access has expired. Please contact your agency for assistance.
        </p>
        <p class="warning-note">
          Once your checklist is marked as completed, you will have approximately 7 days to download your finalized onboarding document, though it will be accessible via the agency's website.
        </p>
      </div>
      <button 
        v-if="daysRemaining > 0"
        @click="!previewMode && downloadOnboardingDocument()" 
        class="btn btn-primary"
        :disabled="downloading || previewMode"
      >
        {{ downloading ? 'Generating...' : 'Download Onboarding Document' }}
      </button>
    </div>
    
    <!-- Onboarding Checklist Card -->
    <div v-if="onboardingCompletion < 100" class="onboarding-card">
      <div class="onboarding-header">
        <h2>Onboarding Checklist</h2>
        <span class="completion-badge">{{ onboardingCompletion }}% Complete</span>
      </div>
      <div class="onboarding-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: onboardingCompletion + '%' }"></div>
        </div>
      </div>
      <p class="onboarding-description">Complete your onboarding tasks to get started.</p>
      <router-link v-if="!previewMode" to="/onboarding" class="btn btn-primary">View Checklist</router-link>
      <button v-else class="btn btn-primary" disabled>View Checklist</button>
    </div>
    
    <!-- Provider top summary card -->
    <div
      v-if="!previewMode && isOnboardingComplete && !isPending && !isSchoolStaff"
      class="top-snapshot-wrap"
    >
      <div class="top-snapshot-head">
        <div class="top-snapshot-title">My Snapshot</div>
        <button type="button" class="btn btn-secondary btn-sm" @click="toggleTopCardCollapsed">
          {{ topCardCollapsed ? 'Expand' : 'Collapse' }}
        </button>
      </div>
      <ProviderTopSummaryCard v-if="!topCardCollapsed" />
    </div>

    <!-- Dashboard Shell: left rail + right detail -->
    <div class="dashboard-shell">
      <div class="dashboard-rail" :class="{ disabled: previewMode }" role="navigation" aria-label="Dashboard sections">
        <button
          v-for="card in railCards"
          :key="card.id"
          type="button"
          class="rail-card"
          :class="{
            active: (card.kind === 'content' && activeTab === card.id),
            'rail-card-submit': card.id === 'submit'
          }"
          :aria-current="(card.kind === 'content' && activeTab === card.id) ? 'page' : undefined"
          :disabled="previewMode"
          @click="handleCardClick(card)"
        >
          <div class="rail-card-left">
            <div v-if="card.iconUrl" class="rail-card-icon">
              <img :src="card.iconUrl" :alt="`${card.label} icon`" class="rail-card-icon-img" />
            </div>
            <div class="rail-card-text">
              <div class="rail-card-title">{{ card.label }}</div>
            </div>
          </div>
          <div class="rail-card-meta">
            <span v-if="card.badgeCount > 0" class="rail-card-badge">{{ card.badgeCount }}</span>
            <span class="rail-card-cta">{{ card.kind === 'link' ? 'Open' : (card.kind === 'action' ? 'Open' : 'View') }}</span>
          </div>
        </button>
      </div>

      <div class="dashboard-detail">
        <!-- Card Content (for content cards) -->
        <div class="card-content">
          <TrainingFocusTab
            v-if="!previewMode"
            v-show="activeTab === 'training' && !isPending"
            @update-count="updateTrainingCount"
          />
          
          <DocumentsTab
            v-if="!previewMode"
            v-show="activeTab === 'documents'"
            @update-count="updateDocumentsCount"
          />
          
          <UnifiedChecklistTab
            v-if="!previewMode"
            v-show="activeTab === 'checklist'"
            @update-count="updateChecklistCount"
          />

          <!-- Submit (right panel) -->
          <div v-if="!previewMode && isOnboardingComplete && !isSchoolStaff" v-show="activeTab === 'submit'" class="my-panel">
            <div class="section-header">
              <h2 style="margin: 0;">Submit</h2>
              <button v-if="submitPanelView !== 'root'" type="button" class="btn btn-secondary btn-sm" @click="submitPanelView = 'root'">
                Back
              </button>
            </div>

            <div v-if="submitPanelView === 'root'">
              <div class="fields-grid" style="margin-top: 12px;">
                <button v-if="inSchoolEnabled && hasAssignedSchools" type="button" class="dash-card dash-card-submit" @click="openInSchoolClaims">
                  <div class="dash-card-title">In-School Claims</div>
                  <div class="dash-card-desc">School Mileage and Med Cancel.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button type="button" class="dash-card" @click="goToSubmission('mileage')">
                  <div class="dash-card-title">Mileage</div>
                  <div class="dash-card-desc">Submit other mileage.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button type="button" class="dash-card" @click="goToSubmission('reimbursement')">
                  <div class="dash-card-title">Reimbursement</div>
                  <div class="dash-card-desc">Upload a receipt and submit for approval.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button type="button" class="dash-card" @click="goToSubmission('pto')">
                  <div class="dash-card-title">PTO</div>
                  <div class="dash-card-desc">Request Sick Leave or Training PTO.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button
                  v-if="authStore.user?.companyCardEnabled"
                  type="button"
                  class="dash-card"
                  @click="goToSubmission('company_card_expense')"
                >
                  <div class="dash-card-title">Submit Expense (Company Card)</div>
                  <div class="dash-card-desc">Submit company card purchases for tracking/review.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button type="button" class="dash-card" @click="openTimeClaims">
                  <div class="dash-card-title">Time Claim</div>
                  <div class="dash-card-desc">Attendance, holiday/excess time, service corrections.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>
              </div>
            </div>

            <div v-else>
              <div class="hint" style="margin-top: 6px;">{{ submitPanelView === 'time' ? 'Time Claims' : 'In-School Claims' }}</div>
              <div class="submit-grid-2" style="margin-top: 12px;">
                <template v-if="submitPanelView === 'time'">
                  <button type="button" class="dash-card" @click="goToSubmission('time_meeting_training')">
                    <div class="dash-card-title">Meeting / Training Attendance</div>
                    <div class="dash-card-desc">Log meeting/training minutes.</div>
                    <div class="dash-card-meta">
                      <span class="dash-card-cta">Open</span>
                    </div>
                  </button>

                  <button type="button" class="dash-card" @click="goToSubmission('time_excess_holiday')">
                    <div class="dash-card-title">Excess / Holiday Time</div>
                    <div class="dash-card-desc">Submit direct/indirect minutes for review.</div>
                    <div class="dash-card-meta">
                      <span class="dash-card-cta">Open</span>
                    </div>
                  </button>

                  <button type="button" class="dash-card" @click="goToSubmission('time_service_correction')">
                    <div class="dash-card-title">Service Correction</div>
                    <div class="dash-card-desc">Request correction review for a service.</div>
                    <div class="dash-card-meta">
                      <span class="dash-card-cta">Open</span>
                    </div>
                  </button>

                  <button type="button" class="dash-card" @click="goToSubmission('time_overtime_evaluation')">
                    <div class="dash-card-title">Overtime Evaluation</div>
                    <div class="dash-card-desc">Submit overtime evaluation details.</div>
                    <div class="dash-card-meta">
                      <span class="dash-card-cta">Open</span>
                    </div>
                  </button>
                </template>

                <template v-else>
                  <button v-if="hasAssignedSchools" type="button" class="dash-card" @click="goToSubmission('school_mileage')">
                    <div class="dash-card-title">School Mileage</div>
                    <div class="dash-card-desc">Home ↔ School minus Home ↔ Office (auto).</div>
                    <div class="dash-card-meta">
                      <span class="dash-card-cta">Open</span>
                    </div>
                  </button>

                  <button
                    v-if="authStore.user?.medcancelEnabled && medcancelEnabledForAgency && hasAssignedSchools"
                    type="button"
                    class="dash-card"
                    @click="goToSubmission('medcancel')"
                  >
                    <div class="dash-card-title">Med Cancel</div>
                    <div class="dash-card-desc">Missed Medicaid sessions.</div>
                    <div class="dash-card-meta">
                      <span class="dash-card-cta">Open</span>
                    </div>
                  </button>
                </template>
              </div>
            </div>
          </div>

          <div v-if="!previewMode && isOnboardingComplete" v-show="activeTab === 'payroll'" class="my-panel">
            <MyPayrollTab />
          </div>

          <!-- On-Demand Training (right panel) -->
          <div v-if="!previewMode && isOnboardingComplete" v-show="activeTab === 'on_demand_training'" class="my-panel">
            <OnDemandTrainingLibraryView />
          </div>

          <!-- My Account (nested inside dashboard) -->
          <div
            v-if="!previewMode && isOnboardingComplete"
            v-show="activeTab === 'my'"
            class="my-panel"
          >
            <div class="my-subnav">
              <button
                type="button"
                class="subtab"
                :class="{ active: myTab === 'account' }"
                @click="setMyTab('account')"
              >
                Account Info
              </button>
              <button
                type="button"
                class="subtab"
                :class="{ active: myTab === 'credentials' }"
                @click="setMyTab('credentials')"
              >
                My Credentials
              </button>
              <button
                type="button"
                class="subtab"
                :class="{ active: myTab === 'preferences' }"
                @click="setMyTab('preferences')"
              >
                My Preferences
              </button>
              <button
                type="button"
                class="subtab"
                :class="{ active: myTab === 'payroll' }"
                @click="setMyTab('payroll')"
              >
                My Payroll
              </button>
              <button
                type="button"
                class="subtab"
                :class="{ active: myTab === 'compensation' }"
                @click="setMyTab('compensation')"
              >
                My Compensation
              </button>
            </div>

            <div v-show="myTab === 'account'">
              <AccountInfoView />
            </div>
            <div v-show="myTab === 'credentials'">
              <CredentialsView />
            </div>
            <div v-show="myTab === 'preferences'">
              <div class="preferences-header">
                <h1>My Preferences</h1>
                <p class="preferences-subtitle">Manage your personal settings and preferences</p>
              </div>
              <UserPreferencesHub v-if="authStore.user?.id" :userId="authStore.user.id" />
            </div>
            <div v-show="myTab === 'payroll'">
              <MyPayrollTab />
            </div>
            <div v-show="myTab === 'compensation'">
              <MyCompensationTab />
            </div>
          </div>
          
          <!-- Preview mode placeholder content -->
          <div v-if="previewMode" class="preview-tab-content">
            <p v-if="activeTab === 'checklist'" class="preview-text">Checklist content preview</p>
            <p v-if="activeTab === 'training'" class="preview-text">Training content preview</p>
            <p v-if="activeTab === 'documents'" class="preview-text">Documents content preview</p>
            <p v-if="activeTab === 'my'" class="preview-text">My account content preview</p>
            <p v-if="activeTab === 'submit'" class="preview-text">Submit content preview</p>
            <p v-if="activeTab === 'on_demand_training'" class="preview-text">On-demand training content preview</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useBrandingStore } from '../store/branding';
import api from '../services/api';
import TrainingFocusTab from '../components/dashboard/TrainingFocusTab.vue';
import DocumentsTab from '../components/dashboard/DocumentsTab.vue';
import UnifiedChecklistTab from '../components/dashboard/UnifiedChecklistTab.vue';
import ProviderTopSummaryCard from '../components/dashboard/ProviderTopSummaryCard.vue';
import PendingCompletionButton from '../components/PendingCompletionButton.vue';
import BrandingLogo from '../components/BrandingLogo.vue';
import UserPreferencesHub from '../components/UserPreferencesHub.vue';
import CredentialsView from './CredentialsView.vue';
import AccountInfoView from './AccountInfoView.vue';
import MyPayrollTab from '../components/dashboard/MyPayrollTab.vue';
import MyCompensationTab from '../components/dashboard/MyCompensationTab.vue';
import OnDemandTrainingLibraryView from './OnDemandTrainingLibraryView.vue';

const props = defineProps({
  previewMode: {
    type: Boolean,
    default: false
  },
  previewStatus: {
    type: String,
    default: null
  },
  previewData: {
    type: Object,
    default: null
  }
});

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const activeTab = ref('checklist');
const myTab = ref('account'); // 'account' | 'credentials' | 'preferences' | 'payroll'
const onboardingCompletion = ref(100);
const trainingCount = ref(0);
const documentsCount = ref(0);
const checklistCount = ref(0);
const userStatus = ref('active');
const daysRemaining = ref(null);
const downloading = ref(false);
const isPending = ref(false);
const pendingCompletionStatus = ref(null);
const tierBadgeText = ref('');
const tierBadgeKind = ref(''); // 'tier-current' | 'tier-grace' | 'tier-ooc'

const dashboardBannerLoading = ref(false);
const dashboardBannerError = ref('');
const dashboardBanner = ref(null); // { type, message, agencyId, names } | null

const currentAgencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const tabs = computed(() => [
  { id: 'checklist', label: 'Checklist', badgeCount: checklistCount.value },
  { id: 'training', label: 'Training', badgeCount: trainingCount.value },
  { id: 'documents', label: 'Documents', badgeCount: documentsCount.value }
]);

const isOnboardingComplete = computed(() => {
  // Privileged roles should always have access to the "My" area (account + payroll),
  // even if their lifecycle status doesn't match the employee workflow.
  const role = authStore.user?.role;
  if (role === 'super_admin' || role === 'admin' || role === 'support') return true;

  const st = userStatus.value;
  // Approved employees should always be able to access on-demand + prefs.
  if (authStore.user?.type === 'approved_employee') return true;
  const lower = String(st || '').toLowerCase();
  return (
    lower === 'active_employee' ||
    lower === 'active' ||
    lower === 'completed' ||
    lower === 'terminated_pending' ||
    lower === 'terminated'
  );
});

// Agency logo URL for preview mode
const previewAgencyLogoUrl = computed(() => {
  if (!props.previewMode) return null;
  return agencyStore.currentAgency?.logo_url || null;
});

const filteredTabs = computed(() => {
  // PREHIRE_OPEN, PREHIRE_REVIEW, and ONBOARDING users see limited tabs
  if (isPending.value || userStatus.value === 'PREHIRE_REVIEW' || userStatus.value === 'ONBOARDING' || 
      userStatus.value === 'ready_for_review') {
    // Pre-hire and onboarding users only see checklist and documents (no training tab)
    return tabs.value.filter(tab => tab.id !== 'training');
  }
  // ACTIVE_EMPLOYEE and TERMINATED_PENDING users see all tabs
  return tabs.value;
});

const isSchoolStaff = computed(() => String(authStore.user?.role || '').toLowerCase() === 'school_staff');

const dashboardCards = computed(() => {
  // Super admins on the main platform brand should see platform-level defaults
  // (ignore any selected/stale currentAgency).
  const cardIconOrgOverride = String(authStore.user?.role || '').toLowerCase() === 'super_admin' ? null : undefined;
  const cards = filteredTabs.value.map((t) => ({
    ...t,
    kind: 'content',
    iconUrl: brandingStore.getDashboardCardIconUrl(t.id, cardIconOrgOverride),
    description:
      t.id === 'checklist'
        ? 'Your required onboarding and checklist items.'
        : t.id === 'training'
          ? 'Assigned training modules and progress.'
          : 'Documents that need review or signature.'
  }));

  // Post-onboarding cards
  if (isOnboardingComplete.value) {
    // School staff should not see payroll/claims submission surfaces.
    if (!isSchoolStaff.value) {
      cards.push({
        id: 'submit',
        label: 'Submit',
        kind: 'content',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('submit', cardIconOrgOverride),
        description: 'Submit mileage, in-school claims, and more.'
      });
      cards.push({
        id: 'payroll',
        label: 'Payroll',
        kind: 'content',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('payroll', cardIconOrgOverride),
        description: 'Your payroll history by pay period.'
      });
    }
    cards.push({
      id: 'my',
      label: 'My Account',
      kind: 'content',
      badgeCount: 0,
      iconUrl: brandingStore.getDashboardCardIconUrl('my', cardIconOrgOverride),
      description: 'Account info, credentials, and personal preferences.'
    });
    cards.push({
      id: 'on_demand_training',
      label: 'On-Demand Training',
      kind: 'content',
      badgeCount: 0,
      iconUrl: brandingStore.getDashboardCardIconUrl('on_demand_training', cardIconOrgOverride),
      description: 'Always available after onboarding is complete.'
    });
  }

  return cards;
});

const railCards = computed(() => {
  const cards = (dashboardCards.value || []).slice();
  const hasMy = cards.some((c) => String(c?.id) === 'my');

  const orderIndex = (id) => {
    const k = String(id || '');
    // Stable rail order:
    // - If My Account exists (post-onboarding), keep it first and Checklist second.
    // - If My Account doesn't exist yet (during onboarding), Checklist stays first.
    if (hasMy) {
      return ({
        my: 0,
        checklist: 1,
        training: 2,
        documents: 3,
        submit: 4,
        payroll: 5,
        on_demand_training: 6
      })[k] ?? 999;
    }
    return ({
      checklist: 0,
      documents: 1,
      training: 2,
      submit: 3,
      payroll: 4,
      my: 5,
      on_demand_training: 6
    })[k] ?? 999;
  };

  return cards.sort((a, b) => {
    const da = orderIndex(a?.id);
    const db = orderIndex(b?.id);
    if (da !== db) return da - db;
    return String(a?.label || '').localeCompare(String(b?.label || ''));
  });
});

const TOP_CARD_COLLAPSE_KEY = 'dashboard.topCardCollapsed.v1';
const topCardCollapsed = ref(false);
const loadTopCardCollapsed = () => {
  try {
    const v = window?.localStorage?.getItem?.(TOP_CARD_COLLAPSE_KEY);
    topCardCollapsed.value = v === '1';
  } catch {
    topCardCollapsed.value = false;
  }
};
const toggleTopCardCollapsed = () => {
  topCardCollapsed.value = !topCardCollapsed.value;
  try {
    window?.localStorage?.setItem?.(TOP_CARD_COLLAPSE_KEY, topCardCollapsed.value ? '1' : '0');
  } catch {
    // ignore
  }
};

const handleCardClick = (card) => {
  if (props.previewMode) return;
  if (card.id === 'submit') {
    submitPanelView.value = 'root';
    activeTab.value = 'submit';
    loadMyAssignedSchools();
    router.replace({ query: { ...route.query, tab: 'submit' } });
    return;
  }
  if (card.id === 'on_demand_training') {
    activeTab.value = 'on_demand_training';
    router.replace({ query: { ...route.query, tab: 'on_demand_training' } });
    return;
  }
  activeTab.value = card.id;
  if (props.previewMode) return;
  if (card.id === 'my') {
    router.replace({ query: { ...route.query, tab: 'my', my: myTab.value } });
  } else {
    router.replace({ query: { ...route.query, tab: card.id } });
  }
};

const setMyTab = (tab) => {
  myTab.value = tab;
  activeTab.value = 'my';
  if (props.previewMode) return;
  router.replace({ query: { ...route.query, tab: 'my', my: tab } });
};

const syncFromQuery = () => {
  if (props.previewMode) return;
  const qTab = route.query?.tab;
  if (typeof qTab === 'string' && ['checklist', 'training', 'documents', 'my', 'payroll', 'submit', 'on_demand_training'].includes(qTab)) {
    activeTab.value = qTab;
  }

  const qMy = route.query?.my;
  if (typeof qMy === 'string' && ['account', 'credentials', 'preferences', 'payroll', 'compensation'].includes(qMy)) {
    myTab.value = qMy;
  }
};

const submitPanelView = ref('root'); // 'root' | 'in_school' | 'time'

const openTimeClaims = () => {
  submitPanelView.value = 'time';
};

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
};

const agencyFlags = computed(() => parseFeatureFlags(agencyStore.currentAgency?.feature_flags));
const inSchoolEnabled = computed(() => agencyFlags.value?.inSchoolSubmissionsEnabled !== false);
const medcancelEnabledForAgency = computed(() => inSchoolEnabled.value && agencyFlags.value?.medcancelEnabled !== false);

const assignedSchools = ref([]);
const assignedSchoolsLoading = ref(false);
const hasAssignedSchools = computed(() => (assignedSchools.value || []).length > 0);

const loadMyAssignedSchools = async () => {
  if (props.previewMode) return;
  if (!currentAgencyId.value) {
    assignedSchools.value = [];
    return;
  }
  try {
    assignedSchoolsLoading.value = true;
    const api = (await import('../services/api')).default;
    const resp = await api.get('/payroll/me/assigned-schools', { params: { agencyId: currentAgencyId.value } });
    assignedSchools.value = resp.data || [];
  } catch {
    assignedSchools.value = [];
  } finally {
    assignedSchoolsLoading.value = false;
  }
};

const openInSchoolClaims = () => {
  if (!inSchoolEnabled.value) {
    window.alert('In-School submissions are disabled for this organization.');
    return;
  }
  if (!hasAssignedSchools.value) {
    window.alert('You do not have any assigned school locations, so In-School Claims are not available.');
    return;
  }
  submitPanelView.value = 'in_school';
};

const goToSubmission = (kind) => {
  // Use My -> My Payroll as the actual submission surface (it already has the modals/forms).
  submitPanelView.value = 'root';
  setMyTab('payroll');
  router.replace({ query: { ...route.query, tab: 'my', my: 'payroll', submission: kind } });
};

const updateTrainingCount = (count) => {
  trainingCount.value = count;
};

const updateDocumentsCount = (count) => {
  documentsCount.value = count;
};

const updateChecklistCount = (count) => {
  checklistCount.value = count;
};

const fetchOnboardingStatus = async () => {
  // In preview mode, use mock data
  if (props.previewMode) {
    if (props.previewData) {
      onboardingCompletion.value = props.previewData.onboardingCompletion || 0;
      trainingCount.value = props.previewData.trainingCount || 0;
      documentsCount.value = props.previewData.documentsCount || 0;
      checklistCount.value = props.previewData.checklistCount || 0;
      daysRemaining.value = props.previewData.daysRemaining || null;
      pendingCompletionStatus.value = props.previewData.pendingCompletionStatus || null;
    }
    if (props.previewStatus) {
      userStatus.value = props.previewStatus;
      isPending.value = props.previewStatus === 'PREHIRE_OPEN' || props.previewStatus === 'PENDING_SETUP';
    }
    return;
  }
  
  try {
    const api = (await import('../services/api')).default;
    const userId = authStore.user?.id;
    if (userId) {
      const [checklistResponse, userResponse] = await Promise.all([
        api.get(`/users/${userId}/onboarding-checklist`),
        api.get(`/users/${userId}`)
      ]);
      onboardingCompletion.value = checklistResponse.data.completionPercentage || 100;
      userStatus.value = userResponse.data.status || 'ACTIVE_EMPLOYEE';
      isPending.value = userStatus.value === 'PREHIRE_OPEN' || userStatus.value === 'PENDING_SETUP' || userStatus.value === 'pending';
      
      // Fetch pending completion status if user is in pre-hire status
      if (isPending.value || userStatus.value === 'PREHIRE_REVIEW' || userStatus.value === 'ready_for_review') {
        try {
          const statusResponse = await api.get(`/users/${userId}/pending/status`);
          pendingCompletionStatus.value = statusResponse.data;
        } catch (err) {
          console.error('Error fetching pending completion status:', err);
          // If user is PREHIRE_REVIEW, set accessLocked to true
          if (userStatus.value === 'PREHIRE_REVIEW' || userStatus.value === 'ready_for_review') {
            pendingCompletionStatus.value = { accessLocked: true, allComplete: true };
          }
        }
      }
      
      // Calculate days remaining
      if (userResponse.data.status_expires_at) {
        const expiresAt = new Date(userResponse.data.status_expires_at);
        const now = new Date();
        const diffTime = expiresAt - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysRemaining.value = diffDays > 0 ? diffDays : 0;
      } else {
        daysRemaining.value = null;
      }
    }
  } catch (err) {
    // If checklist doesn't exist or error, assume complete
    onboardingCompletion.value = 100;
  }
};

const loadCurrentTier = async () => {
  if (props.previewMode) return;
  if (!isOnboardingComplete.value) return;
  if (!currentAgencyId.value) return;
  try {
    const api = (await import('../services/api')).default;
    const resp = await api.get('/payroll/me/current-tier', { params: { agencyId: currentAgencyId.value } });
    const t = resp.data?.tier || null;
    const label = String(t?.label || '').trim();
    const status = String(t?.status || '').trim().toLowerCase();
    tierBadgeText.value = label || '';
    if (!tierBadgeText.value) {
      tierBadgeKind.value = '';
      return;
    }
    tierBadgeKind.value =
      status === 'grace' ? 'tier-grace'
        : status === 'current' ? 'tier-current'
          : 'tier-ooc';
  } catch {
    tierBadgeText.value = '';
    tierBadgeKind.value = '';
  }
};

const handlePendingCompleted = () => {
  if (props.previewMode) return; // Disable in preview mode
  // Redirect to completion view
  router.push('/pending-completion');
};

const downloadOnboardingDocument = async () => {
  try {
    downloading.value = true;
    const api = (await import('../services/api')).default;
    const userId = authStore.user?.id;
    
    const response = await api.get(`/users/${userId}/onboarding-document`, {
      responseType: 'blob'
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `onboarding-document-${Date.now()}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to download onboarding document');
  } finally {
    downloading.value = false;
  }
};

// Watch for preview status/data changes
watch(() => [props.previewStatus, props.previewData], () => {
  if (props.previewMode) {
    fetchOnboardingStatus();
  }
}, { deep: true });

watch(() => [route.query?.tab, route.query?.my], () => {
  syncFromQuery();
});

const loadAgencyDashboardBanner = async () => {
  if (props.previewMode) {
    dashboardBanner.value = null;
    return;
  }
  if (!currentAgencyId.value) {
    dashboardBanner.value = null;
    return;
  }
  try {
    dashboardBannerLoading.value = true;
    dashboardBannerError.value = '';
    const resp = await api.get(`/agencies/${currentAgencyId.value}/dashboard-banner`);
    dashboardBanner.value = resp.data?.banner || null;
  } catch (e) {
    // Non-blocking; don't break dashboard if this fails.
    dashboardBanner.value = null;
    dashboardBannerError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load banner';
  } finally {
    dashboardBannerLoading.value = false;
  }
};

onMounted(async () => {
  loadTopCardCollapsed();
  await fetchOnboardingStatus();
  syncFromQuery();
  // Default to My Account → Account Info once onboarding is complete,
  // unless the URL explicitly specifies a tab.
  if (!route.query?.tab && !route.query?.my && onboardingCompletion.value >= 100 && isOnboardingComplete.value) {
    activeTab.value = 'my';
    myTab.value = 'account';
  }
  await loadCurrentTier();
  await loadAgencyDashboardBanner();
});

// If available cards change (role/status), keep activeTab on a valid content card.
watch(dashboardCards, () => {
  const cards = dashboardCards.value || [];
  const activeId = String(activeTab.value || '');
  const activeCard = cards.find((c) => String(c.id) === activeId) || null;
  if (activeCard && activeCard.kind === 'content') return;
  const firstContent = cards.find((c) => c.kind === 'content') || null;
  if (firstContent?.id) activeTab.value = firstContent.id;
}, { deep: true });

watch([currentAgencyId, isOnboardingComplete], async () => {
  await loadCurrentTier();
  await loadMyAssignedSchools();
  await loadAgencyDashboardBanner();
});
</script>

<style scoped>
/* Tighter grid for In-School Claims options */
.submit-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 720px) {
  .submit-grid-2 {
    grid-template-columns: 1fr;
  }
}
h1 {
  margin-bottom: 30px;
  color: #2c3e50;
}

.onboarding-card {
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  color: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 32px;
  box-shadow: var(--shadow-lg);
}

.onboarding-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.onboarding-header h2 {
  margin: 0;
  color: white;
  font-size: 24px;
}

.completion-badge {
  background: rgba(255, 255, 255, 0.2);
  padding: 6px 12px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 14px;
}

.onboarding-progress {
  margin-bottom: 16px;
}

.progress-bar {
  width: 100%;
  height: 12px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: white;
  transition: width 0.3s ease;
  border-radius: 6px;
}

.onboarding-description {
  margin: 0 0 16px 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
}

.onboarding-card .btn {
  background: white;
  color: var(--primary);
  border: none;
}

.onboarding-card .btn:hover {
  background: rgba(255, 255, 255, 0.9);
}

.top-snapshot-wrap {
  margin-bottom: 16px;
}
.top-snapshot-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.top-snapshot-title {
  font-weight: 800;
  color: var(--text-primary);
}

/* Split view: rail + detail */
.dashboard-shell {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  margin-bottom: 16px;
}

.dashboard-rail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: sticky;
  top: 12px;
  align-self: start;
  max-height: calc(100vh - 24px);
  overflow: auto;
  padding-right: 2px; /* avoids scrollbar overlaying focus rings */
}

.rail-card {
  text-align: left;
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.rail-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
}

.rail-card:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.rail-card.active {
  border-color: var(--accent);
  box-shadow: var(--shadow);
  background: var(--bg-alt);
}

.rail-card-submit {
  background: #ecfeff;
  border-color: #67e8f9;
}
.rail-card-submit .rail-card-title,
.rail-card-submit .rail-card-cta {
  color: #0e7490;
}

.rail-card-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.rail-card-icon {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.rail-card-icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.rail-card-text {
  min-width: 0;
}

.rail-card-title {
  font-weight: 800;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rail-card-meta {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;
}

.rail-card-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: #dc2626;
  color: white;
  font-size: 12px;
  font-weight: 800;
}

.rail-card-cta {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.dashboard-detail {
  min-width: 0;
}

.dashboard-rail.disabled {
  opacity: 0.85;
}

.dashboard-rail :deep(button:focus-visible),
.dashboard-detail :deep(button:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.dashboard-rail :deep(button:focus-visible) {
  border-radius: 12px;
}

@media (max-width: 980px) {
  .dashboard-shell {
    grid-template-columns: 1fr;
  }
  .dashboard-rail {
    position: static;
    max-height: none;
    overflow: visible;
    flex-direction: row;
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 6px;
  }
  .rail-card {
    min-width: 220px;
  }
}

.dashboard-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.dash-card {
  text-align: left;
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.dash-card-submit {
  background: #ecfeff;
  border-color: #67e8f9;
}
.dash-card-submit .dash-card-title {
  color: #0e7490;
}
.dash-card-submit .dash-card-cta {
  color: #0e7490;
}

.dash-card-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}

.dash-card-icon-img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.dash-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
}

.dash-card:disabled {
  cursor: default;
  opacity: 0.7;
}

.dash-card.active {
  border-color: var(--accent);
}

.dash-card-title {
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.dash-card-desc {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 10px;
}

.dash-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.dash-card-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: #dc2626;
  color: white;
  font-size: 12px;
  font-weight: 700;
}

.dash-card-cta {
  font-size: 12px;
  color: var(--text-secondary);
}

.card-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.my-subnav {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.my-subnav .subtab {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-primary);
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
}

.my-subnav .subtab.active {
  border-color: var(--accent);
  background: white;
}

.my-panel :deep(.container) {
  padding: 0;
}

.my-panel :deep(.page-header),
.my-panel :deep(.preferences-header) {
  margin-bottom: 16px;
  padding-bottom: 12px;
}

.status-warning-banner {
  background: #fef3c7;
  border-left: 4px solid #f59e0b;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.agency-announcement-banner {
  background: #e0f2fe;
  border-left: 4px solid #0284c7;
  border-radius: 8px;
  padding: 16px 18px;
  margin-bottom: 20px;
}

.agency-announcement-content strong {
  color: #075985;
}

.warning-content {
  flex: 1;
}

.warning-content strong {
  display: block;
  margin-bottom: 8px;
  color: #92400e;
  font-size: 16px;
}

.warning-content p {
  margin: 4px 0;
  color: #78350f;
  font-size: 14px;
}

.warning-note {
  margin-top: 12px !important;
  font-size: 12px !important;
  font-style: italic;
  color: #78350f !important;
}

.pending-completion-banner {
  background: #d1fae5;
  border-left: 4px solid #10b981;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
}

.completion-content strong {
  display: block;
  color: #065f46;
  font-size: 18px;
  margin-bottom: 12px;
}

.completion-content p {
  margin: 8px 0;
  color: #047857;
}

.ready-for-review-banner {
  background: #dbeafe;
  border-left: 4px solid #3b82f6;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
}

.review-content strong {
  display: block;
  color: #1e40af;
  font-size: 18px;
  margin-bottom: 12px;
}

.review-content p {
  margin: 8px 0;
  color: #1e3a8a;
}

.review-content em {
  color: #64748b;
  font-size: 14px;
}

.preview-tab-content {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}

.preview-text {
  font-size: 16px;
  margin: 0;
}

.dashboard-header-preview {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.dashboard-header-preview .header-content {
  display: flex;
  align-items: center;
  gap: 24px;
}

.dashboard-header-preview .dashboard-logo {
  flex-shrink: 0;
}

.dashboard-header-preview h1 {
  margin: 0;
  color: var(--primary);
}

.dashboard-header-user {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border);
}

.dashboard-header-user h1 {
  margin: 0;
  color: var(--text-primary);
}

.badge-user {
  display: inline-block;
  padding: 4px 12px;
  background: var(--bg-alt);
  color: var(--text-secondary);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge-tier {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-secondary);
}
.badge-tier.tier-current {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.35);
  color: #166534;
}
.badge-tier.tier-grace {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.35);
  color: #92400e;
}
.badge-tier.tier-ooc {
  background: rgba(239, 68, 68, 0.10);
  border-color: rgba(239, 68, 68, 0.35);
  color: #991b1b;
}

.dash-card:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
</style>
