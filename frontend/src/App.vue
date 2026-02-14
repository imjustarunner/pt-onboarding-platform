<template>
  <BrandingProvider>
    <div class="preview-root" :data-preview-viewport="effectivePreviewViewport">
      <div id="app">
      <div v-if="pageLoading" class="agency-loading-overlay" aria-label="Loading">
        <div class="agency-loading-card">
          <div class="agency-loading-logo">
            <BrandingLogo :logoUrl="loaderLogoUrl" size="xlarge" class="loader-logo" />
          </div>
          <div class="agency-loading-text">{{ loadingText }}</div>
        </div>
      </div>
      <nav v-if="isAuthenticated && !hideGlobalNavForSchoolStaff" class="navbar">
        <div class="container">
          <div class="nav-content">
            <button class="mobile-menu-toggle" @click="mobileMenuOpen = !mobileMenuOpen" aria-label="Toggle menu">
              <span class="hamburger-line" :class="{ active: mobileMenuOpen }"></span>
              <span class="hamburger-line" :class="{ active: mobileMenuOpen }"></span>
              <span class="hamburger-line" :class="{ active: mobileMenuOpen }"></span>
            </button>
            <div class="nav-brand">
              <div class="brand-switcher" @click.stop>
                <button class="brand-trigger" @click="toggleBrandMenu" :title="`Switch Brand (${currentBrandLabel})`">
                  <BrandingLogo :logoUrl="navBrandLogoUrl" size="medium" class="nav-logo" />
                  <span v-if="canSwitchBrand" class="brand-caret">▾</span>
                </button>

                <div v-if="brandMenuOpen && canSwitchBrand" class="brand-menu">
                  <div class="brand-menu-title">Switch Brand</div>

                  <button
                    v-if="brandingStore.isSuperAdmin"
                    class="brand-option"
                    :class="{ active: !agencyStore.currentAgency }"
                    @click="selectPlatformBrand"
                  >
                    Platform
                  </button>

                  <div class="brand-menu-section">Agencies</div>
                  <button
                    v-for="a in brandAgencies"
                    :key="a.id"
                    class="brand-option"
                    :class="{ active: agencyStore.currentAgency?.id === a.id }"
                    @click="selectAgencyBrand(a)"
                  >
                    {{ a.name }}
                  </button>
                </div>
              </div>
              <h1 v-if="navTitleText" class="nav-title">{{ navTitleText }}</h1>
            </div>
            <div class="nav-links-wrapper" :class="{ 'nav-menus-open': navDropdownOpen }">
              <div class="nav-links">
              <router-link :to="myDashboardTo" @click="(e) => { onMyDashboardClick(e); closeMobileMenu(); }">
                {{ isPrivilegedPortalUser ? 'My Dashboard' : 'Dashboard' }}
              </router-link>
              <!-- Minimal top-nav for non-admin users with limited access -->
              <router-link
                v-if="canSeeApplicantsTopNavLink"
                :to="orgTo('/admin/hiring')"
                @click="closeMobileMenu"
              >
                Applicants
              </router-link>
              <router-link
                v-if="canSeePayrollTopNavLink"
                :to="orgTo('/admin/payroll')"
                @click="closeMobileMenu"
              >
                Payroll
              </router-link>
              <router-link
                v-if="canShowAdminDashboardIcon"
                :to="orgTo('/admin')"
                class="nav-icon-btn"
                title="Admin dashboard"
                aria-label="Admin dashboard"
                @click="closeAllNavMenus"
              >
                <img v-if="adminDashboardIconUrl" :src="adminDashboardIconUrl" alt="" class="nav-icon-img" />
                <span v-else aria-hidden="true">🏢</span>
              </router-link>

              <!-- Portal navigation (admins must see this even if ACTIVE_EMPLOYEE) -->
              <template v-if="canSeePortalNav && canSeeFullPortalNav">

                <div class="nav-dropdown" @click.stop>
                  <button
                    type="button"
                    class="nav-dropdown-trigger"
                    :aria-expanded="peopleOpsMenuOpen ? 'true' : 'false'"
                    @click.stop="togglePeopleOpsMenu"
                  >
                    People Ops <span class="brand-caret">▾</span>
                  </button>
                  <div v-if="peopleOpsMenuOpen" class="nav-dropdown-menu">
                    <router-link v-if="hasCapability('canManageHiring')" :to="orgTo('/admin/hiring')" @click="closeAllNavMenus">Applicants</router-link>
                    <a
                      v-if="hasCapability('canManageHiring')"
                      href="#"
                      @click.prevent="openJobDescriptionsNav"
                    >Job descriptions</a>
                    <router-link v-if="showOnDemandLink" :to="orgTo('/on-demand-training')" @click="closeAllNavMenus">On-Demand Training</router-link>
                    <router-link
                      :to="orgTo('/admin/modules')"
                      v-if="isAdmin && user?.role !== 'clinical_practice_assistant' && hasCapability('canViewTraining')"
                      @click="closeAllNavMenus"
                    >Training Modules</router-link>
                    <router-link
                      :to="orgTo('/admin/documents')"
                      v-if="isAdmin && user?.role !== 'clinical_practice_assistant' && hasCapability('canSignDocuments')"
                      @click="closeAllNavMenus"
                    >Documents</router-link>
                    <router-link :to="orgTo('/admin/agency-progress')" v-if="hasCapability('canViewTraining')" @click="closeAllNavMenus">Progress</router-link>
                  </div>
                </div>

                <div class="nav-dropdown" @click.stop>
                  <button
                    type="button"
                    class="nav-dropdown-trigger"
                    :aria-expanded="directoryMenuOpen ? 'true' : 'false'"
                    @click.stop="toggleDirectoryMenu"
                  >
                    Directory <span class="brand-caret">▾</span>
                  </button>
                  <div v-if="directoryMenuOpen" class="nav-dropdown-menu">
                    <router-link :to="orgTo('/admin/schools/overview?orgType=school')" v-if="user?.role === 'super_admin' || isAdmin" @click="closeAllNavMenus">School Overview</router-link>
                    <router-link :to="orgTo('/admin/schools/overview?orgType=program')" v-if="user?.role === 'super_admin' || isAdmin" @click="closeAllNavMenus">Program Overview</router-link>
                    <router-link :to="orgTo('/admin/find-providers')" v-if="user?.role === 'super_admin' || isAdmin" @click="closeAllNavMenus">Provider Booking Interface</router-link>
                    <router-link :to="orgTo('/admin/users')" v-if="isAdmin || isSupervisor(user) || user?.role === 'clinical_practice_assistant'" @click="closeAllNavMenus">Users</router-link>
                    <router-link :to="orgTo('/admin/clients')" v-if="isAdmin || user?.role === 'provider'" @click="closeAllNavMenus">Clients</router-link>
                  </div>
                </div>

                <div class="nav-dropdown" @click.stop>
                  <button
                    type="button"
                    class="nav-dropdown-trigger"
                    :aria-expanded="managementMenuOpen ? 'true' : 'false'"
                    @click.stop="toggleManagementMenu"
                  >
                    Management <span class="brand-caret">▾</span>
                  </button>
                  <div v-if="managementMenuOpen" class="nav-dropdown-menu">
                    <router-link :to="orgTo('/admin')" v-if="isTrueAdmin" @click="closeAllNavMenus">Admin Dashboard</router-link>
                    <div class="nav-dropdown-sep" />
                    <router-link :to="orgTo('/admin/executive-report')" v-if="user?.role === 'super_admin'" @click="closeAllNavMenus">Executive Report</router-link>
                    <router-link :to="orgTo('/admin/payroll')" v-if="canSeePayrollManagement" @click="closeAllNavMenus">Payroll</router-link>
                    <router-link :to="orgTo('/admin/receivables')" v-if="canSeePayrollManagement" @click="closeAllNavMenus">Receivables</router-link>
                    <router-link :to="orgTo('/admin/learning-billing')" v-if="canSeePayrollManagement && learningBillingNavEnabled" @click="closeAllNavMenus">Learning Billing</router-link>
                    <router-link :to="orgTo('/admin/psychotherapy-compliance')" v-if="canSeePayrollManagement" @click="closeAllNavMenus">Psychotherapy Compliance</router-link>
                    <router-link :to="orgTo('/admin/compliance-corner')" v-if="isTrueAdmin" @click="closeAllNavMenus">Compliance Corner</router-link>
                    <router-link :to="orgTo('/admin/expenses')" v-if="canSeePayrollManagement" @click="closeAllNavMenus">Expense/Reimbursements</router-link>
                    <router-link :to="orgTo('/admin/revenue')" v-if="user?.role === 'super_admin'" @click="closeAllNavMenus">Revenue</router-link>

                    <div class="nav-dropdown-sep" />

                    <router-link :to="orgTo('/admin/users')" v-if="isAdmin || isSupervisor(user) || user?.role === 'clinical_practice_assistant'" @click="closeAllNavMenus">Users</router-link>
                    <router-link :to="orgTo('/admin/clients')" v-if="isAdmin || user?.role === 'provider'" @click="closeAllNavMenus">Clients</router-link>
                    <router-link :to="orgTo('/admin/note-aid')" v-if="noteAidEnabled && (isAdmin || user?.role === 'provider' || user?.role === 'staff')" @click="closeAllNavMenus">Note Aid</router-link>
                    <router-link :to="orgTo('/admin/credentialing')" v-if="isAdmin || user?.role === 'support' || user?.role === 'staff'" @click="closeAllNavMenus">Credentialing</router-link>

                    <div class="nav-dropdown-sep" />

                    <router-link :to="orgTo('/admin/settings')" v-if="(canCreateEdit || user?.role === 'support') && user?.role !== 'clinical_practice_assistant'" @click="closeAllNavMenus">Settings</router-link>
                  </div>
                </div>

                <div
                  class="nav-dropdown"
                  v-if="showEngagementMenu"
                  @click.stop
                >
                  <button
                    type="button"
                    class="nav-dropdown-trigger"
                    :aria-expanded="engagementMenuOpen ? 'true' : 'false'"
                    @click.stop="toggleEngagementMenu"
                  >
                    Engagement <span class="brand-caret">▾</span>
                  </button>
                  <div v-if="engagementMenuOpen" class="nav-dropdown-menu">
                    <router-link
                      v-if="canUseEngagementFeed"
                      :to="orgTo('/admin/communications')"
                      @click="closeAllNavMenus"
                    >Feed</router-link>
                    <router-link
                      v-if="canUseEngagementFeed"
                      :to="orgTo('/admin/communications/chats')"
                      @click="closeAllNavMenus"
                    >Chats</router-link>
                    <router-link
                      v-if="canUseAgencyCampaigns"
                      :to="orgTo('/admin/communications/campaigns')"
                      @click="closeAllNavMenus"
                    >Campaigns</router-link>
                    <router-link :to="orgTo('/notifications')" @click="closeAllNavMenus">
                      Notifications
                      <span
                        v-if="notificationsUnreadCount > 0"
                        class="nav-badge nav-badge-pulse"
                        :title="`${notificationsUnreadCount} unread notification(s)`"
                      >
                        {{ notificationsUnreadCount }}
                      </span>
                    </router-link>
                    <router-link :to="orgTo('/tickets')" @click="closeAllNavMenus">
                      Tickets
                    </router-link>
                    <router-link v-if="canShowScheduleTopNav" :to="orgTo('/schedule')" @click="closeAllNavMenus">
                      Schedule
                      <span
                        v-if="showBuildingsPendingBadge && buildingsPendingCount > 0"
                        class="nav-badge"
                        :title="`${buildingsPendingCount} pending availability request(s)`"
                      >
                        {{ buildingsPendingCount }}
                      </span>
                    </router-link>
                    <router-link v-if="user?.role === 'supervisor'" :to="orgTo('/supervisor/availability-lab')" @click="closeAllNavMenus">
                      Find Providers
                    </router-link>
                    <router-link :to="orgTo('/admin/tools-aids')" v-if="noteAidEnabled && (isAdmin || user?.role === 'provider' || user?.role === 'staff')" @click="closeAllNavMenus">Tools &amp; Aids</router-link>
                  </div>
                </div>
              </template>
              
              <div v-if="showGlobalAvailabilityToggle" class="nav-availability" @click.stop>
                <div class="nav-availability-label">Global availability</div>
                <label class="switch" :title="globalAvailabilityTitle">
                  <input type="checkbox" :checked="globalAvailabilityOpen" @change="onToggleGlobalAvailability" />
                  <span class="slider" />
                </label>
                <button class="nav-availability-info" type="button" @click="showAvailabilityHint = !showAvailabilityHint" aria-label="Availability help">
                  i
                </button>
                <div v-if="showAvailabilityHint" class="nav-availability-hint">
                  <strong>Reminder:</strong> Please ensure your schedule is open in the EHR system for the times you are available via “Extra availability”.
                </div>
              </div>
              <button
                type="button"
                class="btn btn-secondary tutorial-toggle"
                :class="{ active: tutorialStore.enabled }"
                :aria-pressed="tutorialStore.enabled ? 'true' : 'false'"
                @click="tutorialStore.setEnabled(!tutorialStore.enabled)"
              >
                Tutorial {{ tutorialStore.enabled ? 'On' : 'Off' }}
              </button>
              <button
                v-if="brandingStore.isSuperAdmin"
                type="button"
                class="btn btn-secondary"
                :aria-pressed="builderStore.panelOpen ? 'true' : 'false'"
                @click="builderStore.togglePanel()"
              >
                Builder
              </button>
              <WeatherChip />
              <router-link
                v-if="canShowScheduleIcon"
                :to="orgTo('/schedule')"
                class="nav-icon-btn"
                title="Schedule"
                aria-label="Schedule"
                @click="closeAllNavMenus"
              >
                <img v-if="scheduleIconUrl" :src="scheduleIconUrl" alt="" class="nav-icon-img" />
                <span v-else aria-hidden="true">📅</span>
              </router-link>
              <router-link
                v-if="canShowSettingsIcon"
                :to="orgTo('/admin/settings')"
                class="nav-icon-btn"
                title="Settings"
                aria-label="Settings"
                @click="closeAllNavMenus"
              >
                <img v-if="settingsIconUrl" :src="settingsIconUrl" alt="" class="nav-icon-img" />
                <span v-else aria-hidden="true">⚙</span>
              </router-link>
              <router-link
                v-if="showNotificationsObnoxiousBadge"
                :to="orgTo('/notifications')"
                class="nav-obnoxious-badge"
                :title="`${notificationsUnreadCount} unread notification(s)`"
                aria-label="Notifications"
                @click="closeAllNavMenus"
              >
                {{ notificationsUnreadCount }}
              </router-link>
              <router-link
                v-if="showNotificationsCompactBadge"
                :to="orgTo('/notifications')"
                class="nav-compact-badge nav-badge-pulse"
                :title="`${notificationsUnreadCount} unread notification(s)`"
                aria-label="Notifications"
                @click="closeAllNavMenus"
              >
                {{ notificationsUnreadCount }}
              </router-link>
              <button @click="handleLogout" class="btn btn-secondary">Logout</button>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <!-- Welcome tag (hangs under navbar) -->
      <div v-if="isAuthenticated && !hideGlobalNavForSchoolStaff" class="welcome-hang-wrap">
        <router-link
          class="welcome-hang-link"
          :to="myDashboardTo"
          aria-label="Go to My Dashboard"
          @click="onMyDashboardClick"
        >
          <span class="welcome-text">Welcome, {{ welcomeName }}</span>
          <span class="dashboard-text">My Dashboard</span>
        </router-link>
      </div>
      <!-- Mobile Sidebar (available on all screen sizes) -->
      <div
        v-if="isAuthenticated && !hideGlobalNavForSchoolStaff"
        class="mobile-sidebar"
        :class="{ open: mobileMenuOpen }"
        @click.self="mobileMenuOpen = false"
      >
        <div class="mobile-sidebar-content">
          <div class="mobile-sidebar-header">
            <BrandingLogo size="medium" class="mobile-logo" />
            <h2 v-if="navTitleText" class="mobile-title">{{ navTitleText }}</h2>
            <button class="mobile-close" @click="mobileMenuOpen = false" aria-label="Close menu">×</button>
          </div>
          <div class="mobile-nav-links">
            <router-link v-if="showOnDemandLink" :to="orgTo('/on-demand-training')" @click="closeMobileMenu" class="mobile-nav-link">On-Demand Training</router-link>
            <router-link :to="myDashboardTo" @click="(e) => { onMyDashboardClick(e); closeMobileMenu(); }" class="mobile-nav-link">
              {{ isPrivilegedPortalUser ? 'My Dashboard' : 'Dashboard' }}
            </router-link>
            <router-link
              v-if="canSeeApplicantsTopNavLink"
              :to="orgTo('/admin/hiring')"
              @click="closeMobileMenu"
              class="mobile-nav-link"
            >Applicants</router-link>
            <router-link
              v-if="canSeePayrollTopNavLink"
              :to="orgTo('/admin/payroll')"
              @click="closeMobileMenu"
              class="mobile-nav-link"
            >Payroll</router-link>
            <router-link
              v-if="hasCapability('canJoinProgramEvents')"
              :to="orgTo('/office')"
              @click="closeMobileMenu"
              class="mobile-nav-link"
            >Office</router-link>

            <template v-if="canSeePortalNav && canSeeFullPortalNav">
              <router-link :to="orgTo('/admin')" v-if="isTrueAdmin" @click="closeMobileMenu" class="mobile-nav-link">Admin Dashboard</router-link>

              <router-link
                :to="orgTo('/admin/modules')"
                v-if="isAdmin && user?.role !== 'clinical_practice_assistant' && hasCapability('canViewTraining')"
                @click="closeMobileMenu"
                class="mobile-nav-link"
              >Training</router-link>
              <router-link
                :to="orgTo('/admin/documents')"
                v-if="isAdmin && user?.role !== 'clinical_practice_assistant' && hasCapability('canSignDocuments')"
                @click="closeMobileMenu"
                class="mobile-nav-link"
              >Documents</router-link>
              <router-link :to="orgTo('/admin/users')" v-if="isAdmin || isSupervisor(user) || user?.role === 'clinical_practice_assistant'" @click="closeMobileMenu" class="mobile-nav-link">Users</router-link>
              <router-link :to="orgTo('/admin/clients')" v-if="isAdmin || user?.role === 'provider'" @click="closeMobileMenu" class="mobile-nav-link">Clients</router-link>
              <router-link :to="orgTo('/admin/note-aid')" v-if="noteAidEnabled && (isAdmin || user?.role === 'provider' || user?.role === 'staff')" @click="closeMobileMenu" class="mobile-nav-link">Note Aid</router-link>
              <router-link
                :to="orgTo('/admin/communications')"
                v-if="(isAdmin || user?.role === 'clinical_practice_assistant') && hasCapability('canUseChat')"
                @click="closeMobileMenu"
                class="mobile-nav-link"
              >Engagement (Feed)</router-link>
              <router-link
                :to="orgTo('/admin/communications/chats')"
                v-if="(isAdmin || user?.role === 'clinical_practice_assistant') && hasCapability('canUseChat')"
                @click="closeMobileMenu"
                class="mobile-nav-link"
              >Chats</router-link>
              <router-link
                :to="orgTo('/notifications')"
                v-if="(isAdmin || user?.role === 'clinical_practice_assistant')"
                @click="closeMobileMenu"
                class="mobile-nav-link mobile-nav-link-obnoxious"
              >
                Notifications
                <span class="mobile-obnoxious-badge" v-if="notificationsUnreadCount > 0">{{ notificationsUnreadCount }}</span>
              </router-link>
              <router-link
                :to="orgTo('/tickets')"
                v-if="(isAdmin || user?.role === 'staff' || user?.role === 'support' || user?.role === 'super_admin')"
                @click="closeMobileMenu"
                class="mobile-nav-link"
              >Tickets</router-link>
              <router-link
                :to="orgTo('/schedule')"
                v-if="canShowScheduleIcon || canShowScheduleTopNav"
                @click="closeMobileMenu"
                class="mobile-nav-link"
              >Schedule</router-link>
              <router-link
                :to="orgTo('/supervisor/availability-lab')"
                v-if="user?.role === 'supervisor'"
                @click="closeMobileMenu"
                class="mobile-nav-link"
              >Find Providers</router-link>
              <router-link
                :to="orgTo('/admin/tools-aids')"
                v-if="noteAidEnabled && (isAdmin || user?.role === 'provider' || user?.role === 'staff')"
                @click="closeMobileMenu"
                class="mobile-nav-link"
              >Tools &amp; Aids</router-link>
              <router-link :to="orgTo('/admin/payroll')" v-if="canSeePayrollManagement" @click="closeMobileMenu" class="mobile-nav-link">Payroll</router-link>
              <router-link :to="orgTo('/admin/receivables')" v-if="canSeePayrollManagement" @click="closeMobileMenu" class="mobile-nav-link">Receivables</router-link>
              <router-link :to="orgTo('/admin/learning-billing')" v-if="canSeePayrollManagement && learningBillingNavEnabled" @click="closeMobileMenu" class="mobile-nav-link">Learning Billing</router-link>
              <router-link :to="orgTo('/admin/expenses')" v-if="canSeePayrollManagement" @click="closeMobileMenu" class="mobile-nav-link">Expense/Reimbursements</router-link>
              <router-link :to="orgTo('/admin/revenue')" v-if="user?.role === 'super_admin'" @click="closeMobileMenu" class="mobile-nav-link">Revenue</router-link>

              <router-link :to="orgTo('/admin/settings')" v-if="(canCreateEdit || user?.role === 'support') && user?.role !== 'clinical_practice_assistant'" @click="closeMobileMenu" class="mobile-nav-link">Settings</router-link>
            </template>
            <button
              type="button"
              class="btn btn-secondary tutorial-toggle mobile-tutorial-toggle"
              :class="{ active: tutorialStore.enabled }"
              :aria-pressed="tutorialStore.enabled ? 'true' : 'false'"
              @click="tutorialStore.setEnabled(!tutorialStore.enabled)"
            >
              Tutorial {{ tutorialStore.enabled ? 'On' : 'Off' }}
            </button>
          </div>
          <div class="mobile-sidebar-footer">
            <button @click="handleLogout" class="btn btn-secondary mobile-logout">Logout</button>
          </div>
        </div>
      </div>
      <!-- Mobile Sidebar Overlay -->
      <div
        v-if="isAuthenticated && !hideGlobalNavForSchoolStaff && mobileMenuOpen"
        class="mobile-overlay"
        @click="mobileMenuOpen = false"
      ></div>
      <main :class="{ 'main-no-global-chrome': hideGlobalNavForSchoolStaff }">
        <!-- Keep legacy selector for non-super-admin users; super admins use the top-nav switcher -->
        <AgencySelector v-if="isAuthenticated && !brandingStore.isSuperAdmin && !hideGlobalNavForSchoolStaff" />
        <router-view />
      </main>
      <HelperWidget v-if="isAuthenticated" />
      <BetaFeedbackWidget v-if="isAuthenticated" />
      <SuperAdminBuilderPanel v-if="isAuthenticated && brandingStore.isSuperAdmin" />
      <TourManager v-if="isAuthenticated" />
      <PlatformChatDrawer />
      <SessionLockScreen
        v-if="isAuthenticated"
        :is-locked="sessionLockStore.isLocked"
        @unlock="onSessionUnlock"
        @logout="onSessionLockLogout"
      />
      <PoweredByFooter v-if="isAuthenticated" />
      <div
        v-if="showLoginNotificationsModal"
        class="notifications-alert-overlay"
        @click.self="dismissLoginNotifications"
      >
        <div class="notifications-alert-card" role="dialog" aria-modal="true" aria-live="polite" @click.stop>
          <div class="notifications-alert-title">
            You have {{ notificationsUnreadCount }} {{ notificationsUnreadLabel }}
          </div>
          <div class="notifications-alert-body">
            Review what needs your attention, or circle back when you are ready.
          </div>
          <div class="notifications-alert-actions">
            <button class="btn btn-primary" type="button" @click="goToNotifications">
              View notifications
            </button>
            <button class="btn btn-secondary" type="button" @click="dismissLoginNotifications">
              Dismiss for now
            </button>
          </div>
        </div>
      </div>
      <button
        v-if="showNotificationsNudge"
        class="notifications-nudge"
        type="button"
        :title="`Open notifications (${notificationsUnreadCount} unread)`"
        :aria-label="`Open notifications (${notificationsUnreadCount} unread)`"
        @click="goToNotifications"
      >
        <span class="notifications-nudge-label">Notifications</span>
        <span :class="['notifications-nudge-count', { 'notifications-nudge-flash': notificationsNudgeFlash }]">
          {{ notificationsUnreadCount }}
        </span>
      </button>
      </div>
    </div>
  </BrandingProvider>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from './store/auth';
import { useBrandingStore } from './store/branding';
import { useAgencyStore } from './store/agency';
import { useOrganizationStore } from './store/organization';
import { useTutorialStore } from './store/tutorial';
import { useSuperadminBuilderStore } from './store/superadminBuilder';
import { useNotificationStore } from './store/notifications';
import { useSessionLockStore } from './store/sessionLock';
import { useRouter, useRoute } from 'vue-router';
import { startActivityTracking, stopActivityTracking, resetActivityTimer } from './utils/activityTracker';
import { isSupervisor } from './utils/helpers.js';
import api from './services/api';
import AgencySelector from './components/AgencySelector.vue';
import PlatformChatDrawer from './components/PlatformChatDrawer.vue';
import BrandingProvider from './components/BrandingProvider.vue';
import BrandingLogo from './components/BrandingLogo.vue';
import PoweredByFooter from './components/PoweredByFooter.vue';
import TourManager from './components/TourManager.vue';
import SuperAdminBuilderPanel from './components/SuperAdminBuilderPanel.vue';
import HelperWidget from './components/HelperWidget.vue';
import BetaFeedbackWidget from './components/BetaFeedbackWidget.vue';
import WeatherChip from './components/WeatherChip.vue';
import SessionLockScreen from './components/SessionLockScreen.vue';
import { toUploadsUrl } from './utils/uploadsUrl';
import { begin as beginLoading, end as endLoading, isLoading as globalLoading, getLoadingTextRef } from './utils/pageLoader';

const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();
const organizationStore = useOrganizationStore();
const tutorialStore = useTutorialStore();
const builderStore = useSuperadminBuilderStore();
const notificationStore = useNotificationStore();
const sessionLockStore = useSessionLockStore();
const router = useRouter();
const route = useRoute();
const mobileMenuOpen = ref(false);

// Global loading overlay (tracks API calls + navigation + icon preloads)
const pageLoading = ref(true);
const loadingText = getLoadingTextRef();
let loadingStartedAt = 0;
const LOADER_MIN_MS = 250;

// Prefer the selected agency icon for the loader even before authStore hydrates.
// This avoids showing platform branding briefly during boot.
const loaderLogoUrl = computed(() => {
  const a = agencyStore.currentAgency;
  if (a?.logo_path) return toUploadsUrl(a.logo_path);
  if (a?.icon_file_path) return toUploadsUrl(a.icon_file_path);
  if (a?.logo_url) return a.logo_url;
  return brandingStore.displayLogoUrl;
});

// The top-left brand logo should reflect the *current context* (Platform vs org portal),
// even for super_admin (platform branding mode would otherwise override).
const navBrandLogoUrl = computed(() => {
  const slugFromRoute = route.params.organizationSlug;
  if (typeof slugFromRoute === 'string' && slugFromRoute) {
    // When inside a branded portal, prefer the portal theme logo, then agency icon fields.
    if (brandingStore.portalAgency?.logoUrl) return String(brandingStore.portalAgency.logoUrl);
    const a = agencyStore.currentAgency;
    if (a?.logo_path) return toUploadsUrl(a.logo_path);
    if (a?.icon_file_path) return toUploadsUrl(a.icon_file_path);
    if (a?.logo_url) return a.logo_url;
  }
  // Platform context
  return brandingStore.displayLogoUrl;
});

watch(globalLoading, (isOn) => {
  if (isOn) {
    loadingStartedAt = Date.now();
    pageLoading.value = true;
    return;
  }
  const elapsed = Date.now() - loadingStartedAt;
  const wait = Math.max(0, LOADER_MIN_MS - elapsed);
  window.setTimeout(() => {
    // Re-check in case loading restarted during the min-delay window.
    if (!globalLoading.value) pageLoading.value = false;
  }, wait);
}, { immediate: true });

// ---- Superadmin viewport preview (Desktop/Tablet/Mobile) ----
const PREVIEW_STORAGE_KEY = 'superadminPreviewViewport';

const previewViewport = ref('desktop'); // desktop | tablet | mobile

const loadPreviewViewport = () => {
  try {
    const raw = localStorage.getItem(PREVIEW_STORAGE_KEY);
    if (raw === 'mobile' || raw === 'tablet' || raw === 'desktop') {
      previewViewport.value = raw;
      return;
    }
  } catch {
    // ignore
  }
  previewViewport.value = 'desktop';
};

const applyPreviewToDocument = (viewport) => {
  try {
    // Not strictly required for scoped CSS, but useful for debugging / future global styles.
    document.documentElement.dataset.previewViewport = viewport;
    document.documentElement.dataset.previewNav = viewport === 'desktop' ? 'full' : 'hamburger';
  } catch {
    // ignore
  }
};

const isSuperAdminUser = computed(() => authStore.user?.role === 'super_admin');

const effectivePreviewViewport = computed(() => {
  if (!isSuperAdminUser.value) return 'desktop';
  return previewViewport.value;
});

const onPreviewUpdated = (e) => {
  if (!isSuperAdminUser.value) return;
  const next = e?.detail?.viewport;
  if (next === 'mobile' || next === 'tablet' || next === 'desktop') {
    previewViewport.value = next;
    applyPreviewToDocument(next);
  }
};

// Keep preview attributes in sync (and reset to desktop for non-superadmins).
watch(effectivePreviewViewport, (next) => {
  applyPreviewToDocument(next);
}, { immediate: true });

// ---- Brand switcher + nav dropdowns (top-nav) ----
const brandMenuOpen = ref(false);
const peopleOpsMenuOpen = ref(false);
const directoryMenuOpen = ref(false);
const managementMenuOpen = ref(false);
const engagementMenuOpen = ref(false);

const navDropdownOpen = computed(() => {
  return (
    peopleOpsMenuOpen.value ||
    directoryMenuOpen.value ||
    managementMenuOpen.value ||
    engagementMenuOpen.value
  );
});

const closeAllNavMenus = () => {
  brandMenuOpen.value = false;
  peopleOpsMenuOpen.value = false;
  directoryMenuOpen.value = false;
  managementMenuOpen.value = false;
  engagementMenuOpen.value = false;
};

const openJobDescriptionsNav = async () => {
  const targetPath = orgTo('/admin/hiring');
  const nowToken = String(Date.now());
  closeAllNavMenus();
  await router.push({ path: targetPath, query: { openJobs: '1', openJobsTs: nowToken } });
  // Same-route navigations can be ignored by the router; emit an explicit UI event as a fallback.
  window.dispatchEvent(new CustomEvent('open-hiring-jobs-modal'));
};

const onDocumentClick = () => closeAllNavMenus();

const canSwitchBrand = computed(() => {
  if (!isAuthenticated.value) return false;
  // Super admins can switch Platform <-> any agency.
  if (brandingStore.isSuperAdmin) return true;
  // Multi-agency admins/support can switch between their agencies.
  const list = (agencyStore.userAgencies || []).filter((a) => String(a.organization_type || 'agency').toLowerCase() === 'agency');
  return list.length > 1;
});

const brandAgencies = computed(() => {
  const list = brandingStore.isSuperAdmin ? (agencyStore.agencies || []) : (agencyStore.userAgencies || []);
  return (list || []).filter((a) => String(a.organization_type || 'agency').toLowerCase() === 'agency');
});

const currentBrandLabel = computed(() => {
  if (brandingStore.isSuperAdmin && !agencyStore.currentAgency) return 'Platform';
  return agencyStore.currentAgency?.name || 'Agency';
});

const toggleBrandMenu = async () => {
  if (!canSwitchBrand.value) return;

  // If the list is empty, refresh it (can happen after context switches).
  try {
    if (brandingStore.isSuperAdmin) {
      if (!agencyStore.agencies || agencyStore.agencies.length === 0) {
        await agencyStore.fetchAgencies();
      }
    } else {
      if (!agencyStore.userAgencies || agencyStore.userAgencies.length === 0) {
        await agencyStore.fetchUserAgencies();
      }
    }
  } catch {
    // ignore
  }

  brandMenuOpen.value = !brandMenuOpen.value;
};

const closeBrandMenu = () => {
  brandMenuOpen.value = false;
};

const togglePeopleOpsMenu = () => {
  // Only one open at a time (feels more professional + avoids overlap).
  const next = !peopleOpsMenuOpen.value;
  closeAllNavMenus();
  peopleOpsMenuOpen.value = next;
};
const toggleDirectoryMenu = () => {
  const next = !directoryMenuOpen.value;
  closeAllNavMenus();
  directoryMenuOpen.value = next;
};
const toggleManagementMenu = () => {
  const next = !managementMenuOpen.value;
  closeAllNavMenus();
  managementMenuOpen.value = next;
};
const toggleEngagementMenu = () => {
  const next = !engagementMenuOpen.value;
  closeAllNavMenus();
  engagementMenuOpen.value = next;
};

const pushWithSlug = (slug) => {
  const full = route.fullPath || '/';
  const [pathPart, queryPart] = String(full).split('?');
  const currentSlug = typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null;

  let nextPath = pathPart;
  if (currentSlug) {
    const oldPrefix = `/${currentSlug}`;
    if (nextPath === oldPrefix) nextPath = `/${slug}`;
    else if (nextPath.startsWith(`${oldPrefix}/`)) nextPath = `/${slug}${nextPath.slice(oldPrefix.length)}`;
    else nextPath = `/${slug}${nextPath}`;
  } else {
    // Prefix current route with the selected agency slug
    nextPath = `/${slug}${nextPath}`;
  }

  router.push(queryPart ? `${nextPath}?${queryPart}` : nextPath);
};

const stripSlug = () => {
  const currentSlug = typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null;
  if (!currentSlug) return;

  const full = route.fullPath || '/';
  const [pathPart, queryPart] = String(full).split('?');
  const oldPrefix = `/${currentSlug}`;

  let nextPath = pathPart;
  if (nextPath === oldPrefix) nextPath = '/';
  else if (nextPath.startsWith(`${oldPrefix}/`)) nextPath = nextPath.slice(oldPrefix.length) || '/';

  router.push(queryPart ? `${nextPath}?${queryPart}` : nextPath);
};

const selectAgencyBrand = async (a) => {
  try {
    closeBrandMenu();
    if (!a) return;
    agencyStore.setCurrentAgency(a);
    const slug = a.slug || a.portal_url;
    if (!slug) return;
    pushWithSlug(slug);
  } catch {
    // ignore
  }
};

const selectPlatformBrand = async () => {
  closeBrandMenu();
  agencyStore.setCurrentAgency(null);
  stripSlug();

  // Ensure super admins still have agency options after returning to Platform.
  if (brandingStore.isSuperAdmin) {
    try {
      await agencyStore.fetchAgencies();
    } catch {
      // ignore
    }
  }
};

const closeMobileMenu = () => {
  mobileMenuOpen.value = false;
};

// Navigation title - only show if it's not "PlotTwistCo" and there's a valid platform template name
const navTitleText = computed(() => {
  const title = brandingStore.navigationTitle || (brandingStore.displayName + ' ' + (brandingStore.peopleOpsTerm || 'People Operations'));
  // Don't show if it contains "PlotTwistCo" or if it's just the default term
  if (!title || title.includes('PlotTwistCo') || title.trim() === 'People Operations') {
    return null; // Show nothing if it's PlotTwistCo or just the default
  }
  // Only show if there's a valid organization name (not empty)
  const orgName = brandingStore.displayName || brandingStore.platformBranding?.organization_name || '';
  if (!orgName || orgName === 'PlotTwistCo') {
    return null; // Show nothing if no valid org name or it's PlotTwistCo
  }
  return title;
});

const isAuthenticated = computed(() => authStore.isAuthenticated);
const sessionSettingsKey = computed(() => {
  const raw =
    agencyStore.currentAgency?.session_settings_json ??
    agencyStore.currentAgency?.sessionSettings ??
    null;
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return '';
  }
});
const user = computed(() => authStore.user);

const hideGlobalNavForSchoolStaff = computed(() => {
  if (!isAuthenticated.value) return false;
  const role = String(user.value?.role || '').toLowerCase();
  // School staff should only use the School Portal UX (no global nav / personal dashboard).
  return role === 'school_staff';
});

const capabilities = computed(() => user.value?.capabilities || null);
const hasCapability = (key) => {
  const caps = capabilities.value;
  // Backward-compat: if capabilities are not present yet, don't hide UI.
  if (!caps || typeof caps !== 'object') return true;
  const keys = Object.keys(caps);
  if (keys.length === 0) return true;
  return !!caps?.[key];
};
const welcomeName = computed(() => {
  const first = user.value?.firstName?.trim();
  const preferred = String(user.value?.preferredName || '').trim();
  if (first && preferred) return `${first} "${preferred}"`;
  if (first) return first;
  const email = user.value?.email?.trim();
  if (!email) return 'there';
  const local = email.split('@')[0];
  return local || email;
});
const isAdmin = computed(() => {
  const role = user.value?.role;
  return role === 'admin' || role === 'super_admin' || role === 'support';
});

const isAdminLike = computed(() => {
  const role = String(user.value?.role || '').toLowerCase();
  return role === 'admin' || role === 'super_admin' || role === 'support';
});

const isTrueAdmin = computed(() => {
  const role = user.value?.role;
  return role === 'admin' || role === 'super_admin';
});

const canSeeFullPortalNav = computed(() => {
  // Keep the “full” admin dropdown navigation for backoffice roles.
  // Limited-access users (payroll/hiring/supervisors) should not see it.
  const role = user.value?.role;
  return role === 'admin' || role === 'super_admin' || role === 'support';
});

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
};

const isTruthyFlag = (v) => {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};

const currentAgencyFeatureFlags = computed(() => {
  const a = agencyStore.currentAgency;
  return parseFeatureFlags(a?.feature_flags);
});

const noteAidEnabled = computed(() => isTruthyFlag(currentAgencyFeatureFlags.value?.noteAidEnabled));
const canUseAgencyCampaigns = computed(() => {
  const enabled = isTruthyFlag(currentAgencyFeatureFlags.value?.agency_campaigns_enabled);
  if (!enabled) return false;
  return isAdmin || user?.role === 'support' || user?.role === 'staff' || user?.role === 'super_admin' || user?.role === 'clinical_practice_assistant';
});
const canUseEngagementFeed = computed(() => {
  return (isAdmin || user?.role === 'clinical_practice_assistant') && hasCapability('canUseChat');
});
const showEngagementMenu = computed(() => {
  return (
    canUseEngagementFeed.value ||
    canUseAgencyCampaigns.value ||
    canShowScheduleTopNav.value ||
    noteAidEnabled.value ||
    notificationsUnreadCount.value > 0
  );
});

const showAvailabilityHint = ref(false);
const savingAvailability = ref(false);
const showGlobalAvailabilityToggle = computed(() => {
  const role = String(user.value?.role || '').toLowerCase();
  return role === 'provider' || role === 'supervisor';
});
const globalAvailabilityOpen = computed(() => user.value?.provider_accepting_new_clients !== false);
const globalAvailabilityTitle = computed(() =>
  globalAvailabilityOpen.value ? 'Open globally for new clients' : 'Closed globally for new clients'
);

const onToggleGlobalAvailability = async (e) => {
  try {
    const nextVal = !!e?.target?.checked;
    if (!user.value?.id) return;
    savingAvailability.value = true;
    await api.put(`/users/${user.value.id}`, { providerAcceptingNewClients: nextVal });
    await authStore.refreshUser();
    showAvailabilityHint.value = true;
    // Auto-hide hint after a bit
    window.setTimeout(() => {
      showAvailabilityHint.value = false;
    }, 8000);
  } catch (err) {
    console.error('Failed to update global availability:', err);
    // revert via refresh
    try { await authStore.refreshUser(); } catch {}
    alert(err.response?.data?.error?.message || 'Failed to update global availability');
  } finally {
    savingAvailability.value = false;
  }
};

const currentAgencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const canSeePayrollManagement = computed(() => {
  if (user.value?.role === 'super_admin') return true;
  const caps = user.value?.capabilities || {};
  if (!caps.canManagePayroll) return false;
  // Only show when current agency is permitted.
  const ids = Array.isArray(user.value?.payrollAgencyIds) ? user.value.payrollAgencyIds : [];
  if (!currentAgencyId.value) return false;
  return ids.includes(currentAgencyId.value);
});
const learningBillingNavEnabled = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency || {};
  const orgType = String(a.organization_type || '').toLowerCase();
  if (orgType !== 'learning') return false;
  const flags = typeof a.feature_flags === 'string'
    ? (() => {
      try { return JSON.parse(a.feature_flags); } catch { return {}; }
    })()
    : (a.feature_flags || {});
  return flags.learningProgramBillingEnabled === true;
});

const canSeeApplicantsTopNavLink = computed(() => {
  return !canSeeFullPortalNav.value && hasCapability('canManageHiring');
});

const canSeePayrollTopNavLink = computed(() => {
  return !canSeeFullPortalNav.value && canSeePayrollManagement.value;
});

const isPrivilegedPortalUser = computed(() => {
  const role = user.value?.role;
  return role === 'admin' || role === 'super_admin' || role === 'support' || isSupervisor(user.value) || role === 'clinical_practice_assistant';
});

const isOnDemandUser = computed(() => {
  return user.value?.type === 'approved_employee' ||
    user.value?.status === 'ACTIVE_EMPLOYEE' ||
    user.value?.status === 'TERMINATED_PENDING' ||
    user.value?.status === 'active' ||
    user.value?.status === 'completed';
});

const canSeePortalNav = computed(() => {
  // Admins (and other privileged roles) must always see portal nav even if ACTIVE_EMPLOYEE.
  return isPrivilegedPortalUser.value || !isOnDemandUser.value;
});

const showOnDemandLink = computed(() => {
  return user.value?.role !== 'super_admin' && isOnDemandUser.value && hasCapability('canViewTraining');
});

const canCreateEdit = computed(() => {
  const role = user.value?.role;
  return role === 'admin' || role === 'super_admin';
});

const canShowSettingsIcon = computed(() => {
  const u = authStore.user;
  if (!u) return false;
  // Mirror Settings link: admin/support keep access regardless of supervisor (supervisor is additive).
  return (canCreateEdit.value || u?.role === 'support') && u?.role !== 'clinical_practice_assistant';
});

const canShowScheduleIcon = computed(() => {
  const u = authStore.user;
  if (!u) return false;
  const role = String(u?.role || '').toLowerCase();
  return ['admin', 'super_admin', 'clinical_practice_assistant', 'staff'].includes(role);
});

const settingsIconUrl = computed(() => {
  try {
    return brandingStore.getAdminQuickActionIconUrl('settings', agencyStore.currentAgency || null);
  } catch {
    return null;
  }
});

const scheduleIconUrl = computed(() => {
  try {
    return brandingStore.getAdminQuickActionIconUrl('schedule', agencyStore.currentAgency || null);
  } catch {
    return null;
  }
});

const canShowAdminDashboardIcon = computed(() => {
  const u = authStore.user;
  if (!u) return false;
  // Only true admins should see the admin dashboard icon.
  return isTrueAdmin.value;
});

const canShowScheduleTopNav = computed(() => {
  return isTrueAdmin.value && hasCapability('canJoinProgramEvents');
});

const adminDashboardIconUrl = computed(() => {
  try {
    // Prefer configured Company Profile icon (or fallbacks) so this stays consistent with Settings icons.
    const u = brandingStore.getAdminQuickActionIconUrl('admin_dashboard', agencyStore.currentAgency || null);
    if (u) return u;
  } catch {
    // ignore
  }
  // Fallback: organization logo icon (if configured) or branded logo.
  return brandingStore.displayLogoUrl || null;
});

const activeOrganizationSlug = computed(() => {
  const slugFromRoute = route.params.organizationSlug;
  if (typeof slugFromRoute === 'string' && slugFromRoute) return slugFromRoute;
  // Super admins should not be implicitly forced into an agency context via persisted currentAgency.
  if (String(authStore.user?.role || '').toLowerCase() === 'super_admin') return null;
  const slugFromAgency = agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url;
  if (slugFromAgency) return slugFromAgency;
  const slugFromOrg = organizationStore.organizationContext?.slug;
  if (slugFromOrg) return slugFromOrg;
  return null;
});

const orgTo = (path) => {
  const slug = activeOrganizationSlug.value;
  if (!slug) return path;
  return `/${slug}${path}`;
};

// Dashboard URL pattern by role (org slug e.g. "itsco" when user is in that agency's context):
// - Superadmin: My Dashboard = /dashboard (platform personal), Admin = /admin (nav "Admin Dashboard").
// - Admin (agency): My Dashboard = /itsco/dashboard, Admin = /itsco/admin (orgTo handles slug).
// - Staff (agency): My Dashboard = /itsco/dashboard, Agency dashboard = /itsco/agencydashboard (see orgTo('/agencydashboard') for staff nav if that route exists).
const myDashboardTo = computed(() => {
  return '/dashboard';
});

// When already on the target route, router-link does nothing; handle click so the button still does something (e.g. scroll to top).
const onMyDashboardClick = (e) => {
  const target = myDashboardTo.value;
  const current = route.path || '/';
  if (current === target) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

const handleLogout = async () => {
  stopActivityTracking();
  mobileMenuOpen.value = false;
  await authStore.logout();
};

const onSessionUnlock = () => {
  sessionLockStore.unlock();
  resetActivityTimer();
};

const onSessionLockLogout = async () => {
  sessionLockStore.unlock();
  stopActivityTracking();
  mobileMenuOpen.value = false;
  const { getLoginUrlForRedirect } = await import('./utils/loginRedirect');
  const redirectTo = getLoginUrlForRedirect(null, null, { timeout: true });
  await authStore.logout('timeout', { redirectTo });
};

// ---- Buildings pending availability badge (admin/staff/CPA) ----
const showBuildingsPendingBadge = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support' || r === 'clinical_practice_assistant' || r === 'staff';
});

const buildingsPendingCount = ref(0);
let buildingsPendingInterval = null;

const fetchBuildingsPendingCounts = async () => {
  if (!isAuthenticated.value) return;
  if (!showBuildingsPendingBadge.value) return;
  try {
    const resp = await api.get('/availability/admin/pending-counts', { skipGlobalLoading: true });
    buildingsPendingCount.value = Number(resp?.data?.total || 0);
  } catch {
    // ignore (badge is best-effort)
  }
};

// Start/stop activity tracking based on authentication status
watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    startActivityTracking({ force: true });
    fetchBuildingsPendingCounts();
    if (buildingsPendingInterval) clearInterval(buildingsPendingInterval);
    buildingsPendingInterval = setInterval(fetchBuildingsPendingCounts, 2 * 60 * 1000);
  } else {
    stopActivityTracking();
    buildingsPendingCount.value = 0;
    if (buildingsPendingInterval) clearInterval(buildingsPendingInterval);
    buildingsPendingInterval = null;
  }
}, { immediate: true });

watch(sessionSettingsKey, () => {
  if (isAuthenticated.value) {
    startActivityTracking({ force: true });
  }
});

// ---- Obnoxious notifications badge (admin/support) ----
const notificationsUnreadCount = computed(() => Number(notificationStore.unreadCount || 0));
const showNotificationsObnoxiousBadge = computed(() => {
  if (!isAuthenticated.value) return false;
  if (!isAdminLike.value) return false;
  return notificationsUnreadCount.value > 0;
});
const showNotificationsCompactBadge = computed(() => {
  if (!isAuthenticated.value) return false;
  if (hideGlobalNavForSchoolStaff.value) return false;
  if (isAdminLike.value) return false;
  return notificationsUnreadCount.value > 0;
});

const shouldUseLoginNotificationsModal = computed(() => {
  if (!isAuthenticated.value) return false;
  if (hideGlobalNavForSchoolStaff.value) return false;
  return !isAdminLike.value;
});
const isOnNotificationsRoute = computed(() => String(route.path || '').includes('/notifications'));
const notificationsUnreadLabel = computed(() => (
  notificationsUnreadCount.value === 1 ? 'notification' : 'notifications'
));
const showLoginNotificationsModal = ref(false);
const notificationsNudgeVisible = ref(false);
const notificationsNudgeFlash = ref(false);
const notificationsCountsLoadedOnce = ref(false);
const showNotificationsNudge = computed(() => {
  if (!shouldUseLoginNotificationsModal.value) return false;
  if (isOnNotificationsRoute.value) return false;
  if (notificationsUnreadCount.value <= 0) return false;
  return notificationsNudgeVisible.value;
});

const clearJustLoggedIn = () => {
  try {
    window.sessionStorage.removeItem('justLoggedIn');
  } catch {
    // ignore
  }
};

const triggerNotificationsNudgeFlash = () => {
  notificationsNudgeFlash.value = true;
  window.setTimeout(() => {
    notificationsNudgeFlash.value = false;
  }, 1800);
};

const maybeShowLoginNotificationsModal = () => {
  if (!isAuthenticated.value) return;
  if (!notificationsCountsLoadedOnce.value) return;
  let justLoggedIn = false;
  try {
    justLoggedIn = window.sessionStorage.getItem('justLoggedIn') === 'true';
  } catch {
    justLoggedIn = false;
  }
  if (!justLoggedIn) return;
  if (shouldUseLoginNotificationsModal.value && notificationsUnreadCount.value > 0 && !isOnNotificationsRoute.value) {
    showLoginNotificationsModal.value = true;
    notificationsNudgeVisible.value = false;
  }
  clearJustLoggedIn();
};

const dismissLoginNotifications = () => {
  showLoginNotificationsModal.value = false;
  if (notificationsUnreadCount.value > 0) {
    notificationsNudgeVisible.value = true;
    triggerNotificationsNudgeFlash();
  }
};

const goToNotifications = () => {
  showLoginNotificationsModal.value = false;
  notificationsNudgeVisible.value = false;
  closeAllNavMenus();
  router.push(orgTo('/notifications'));
};

let notificationsInterval = null;
const shouldFetchNotificationsCounts = computed(() => {
  if (!isAuthenticated.value) return false;
  if (hideGlobalNavForSchoolStaff.value) return false;
  return true;
});
const fetchNotificationsCounts = async () => {
  if (!shouldFetchNotificationsCounts.value) return;
  try {
    await notificationStore.fetchCounts();
    notificationsCountsLoadedOnce.value = true;
    maybeShowLoginNotificationsModal();
  } catch {
    // best-effort badge; ignore errors
  }
};

watch(shouldFetchNotificationsCounts, (enabled) => {
  if (enabled) {
    fetchNotificationsCounts();
    if (notificationsInterval) clearInterval(notificationsInterval);
    notificationsInterval = setInterval(fetchNotificationsCounts, 2 * 60 * 1000);
  } else {
    showLoginNotificationsModal.value = false;
    notificationsNudgeVisible.value = false;
    notificationsCountsLoadedOnce.value = false;
    if (notificationsInterval) clearInterval(notificationsInterval);
    notificationsInterval = null;
  }
}, { immediate: true });

watch(isOnNotificationsRoute, (onNotifications) => {
  if (onNotifications) {
    showLoginNotificationsModal.value = false;
    notificationsNudgeVisible.value = false;
  }
});

watch(notificationsUnreadCount, (next, prev) => {
  if (!shouldUseLoginNotificationsModal.value) return;
  if (next <= 0) {
    showLoginNotificationsModal.value = false;
    notificationsNudgeVisible.value = false;
    return;
  }
  if (notificationsNudgeVisible.value && next > prev) {
    triggerNotificationsNudgeFlash();
  }
});

// Watch for route changes to load organization context
watch(() => route.params.organizationSlug, async (newSlug) => {
  if (newSlug) {
    await organizationStore.fetchBySlug(newSlug);
  } else {
    organizationStore.clearOrganization();
  }
}, { immediate: true });

onMounted(async () => {
  document.addEventListener('click', onDocumentClick);
  const bootId = beginLoading('Loading…');
  try {

    // Initialize superadmin preview mode (if enabled locally).
    if (isSuperAdminUser.value) {
      loadPreviewViewport();
    }

  window.addEventListener('superadmin-preview-updated', onPreviewUpdated);

  // Load organization context if route has organization slug
  if (route.params.organizationSlug) {
    await organizationStore.fetchBySlug(route.params.organizationSlug);
  }
  // Initialize portal theme on app load (for subdomain detection)
  await brandingStore.initializePortalTheme();

  // Load agency list for brand switching (super admins are not shown the legacy selector)
  if (isAuthenticated.value) {
    try {
      if (brandingStore.isSuperAdmin) {
        await agencyStore.fetchAgencies();
      } else {
        await agencyStore.fetchUserAgencies();
      }
    } catch {
      // ignore
    }
  }
  
  if (isAuthenticated.value) {
    startActivityTracking();
    // Sync dark mode from server (in case changed on another device)
    const uid = authStore.user?.id;
    if (uid) {
      try {
        const { default: api } = await import('./services/api');
        const { setDarkMode } = await import('./utils/darkMode');
        const { useUserPreferencesStore } = await import('./store/userPreferences');
        const res = await api.get(`/users/${uid}/preferences`, { skipGlobalLoading: true });
        const data = res?.data || {};
        const dark = !!data.dark_mode;
        setDarkMode(uid, dark);
        const prefsStore = useUserPreferencesStore();
        prefsStore.setFromApi(data);
        const density = data.layout_density || 'standard';
        document.documentElement.removeAttribute('data-layout-density');
        if (density !== 'standard') document.documentElement.setAttribute('data-layout-density', density);
      } catch {
        /* ignore - use localStorage fallback */
      }
    }
    
    // Check if user role needs to be refreshed (e.g., after role change in database)
    // This helps catch cases where the database role was updated but token still has old role
    try {
      const authStore = useAuthStore();
      if (authStore.user && authStore.refreshUser) {
        await authStore.refreshUser();
        // Note: Super admin status is determined by role, not email
        // All permission checks use user.role === 'super_admin'
        // The backend enforces role-based permissions
      }
    } catch (err) {
      console.error('Error checking user role:', err);
    }
  }

  // Super admin default: Platform context unless we're on a branded (slug) route.
  // This prevents being "sent" into a random agency due to a persisted currentAgency from a prior session.
  try {
    const role = String(authStore.user?.role || '').toLowerCase();
    const slugFromRoute = route.params.organizationSlug;
    if (role === 'super_admin' && !(typeof slugFromRoute === 'string' && slugFromRoute)) {
      if (agencyStore.currentAgency) agencyStore.setCurrentAgency(null);
    }
  } catch {
    // ignore
  }

  } finally {
    endLoading(bootId);
  }
});

// Show loader during route navigations.
// The loader will remain visible until all API calls (and any tracked preloads) complete.
let navLoadId = null;
router.beforeEach((to, from, next) => {
  // Avoid flashing loader on hash-only changes / same route.
  if ((to.fullPath || '') !== (from.fullPath || '')) {
    try {
      if (navLoadId) endLoading(navLoadId);
    } catch {}
    navLoadId = beginLoading('Loading…');
  }
  next();
});
router.afterEach(() => {
  if (navLoadId) {
    const id = navLoadId;
    navLoadId = null;
    // Give the new route a tick to kick off its API calls (which will keep the loader up).
    window.setTimeout(() => {
      try { endLoading(id); } catch {}
    }, 0);
  }
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  window.removeEventListener('superadmin-preview-updated', onPreviewUpdated);
  stopActivityTracking();
  if (buildingsPendingInterval) clearInterval(buildingsPendingInterval);
  buildingsPendingInterval = null;
  if (notificationsInterval) clearInterval(notificationsInterval);
  notificationsInterval = null;
});
</script>

<style scoped>
.preview-root {
  min-height: 100vh;
}

.agency-loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.98));
  backdrop-filter: blur(4px);
}

.agency-loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 18px 22px;
  border-radius: 16px;
  background: white;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  min-width: min(420px, 90vw);
}

.agency-loading-logo {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Spin the actual logo image (when present). */
:deep(.loader-logo .logo-image) {
  animation: agencyLogoSpin 1.05s linear infinite;
  transform-origin: 50% 50%;
}

@keyframes agencyLogoSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.agency-loading-text {
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

/* Constrain app width in preview modes */
.preview-root[data-preview-viewport="tablet"] #app,
.preview-root[data-preview-viewport="mobile"] #app {
  margin: 0 auto;
  border: 1px solid rgba(0, 0, 0, 0.15);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  /* Create a containing block so `position: fixed` UI (drawer/overlay) stays inside the preview frame */
  transform: translateZ(0);
  height: 100vh;
  max-height: 100vh;
  overflow-y: auto;
  background: white;
}

.preview-root[data-preview-viewport="tablet"] #app {
  width: 768px;
  max-width: 768px;
}

.preview-root[data-preview-viewport="mobile"] #app {
  width: 390px;
  max-width: 390px;
}

/* Force hamburger-only nav in preview modes (even on wide desktop windows) */
.preview-root[data-preview-viewport="tablet"] .nav-links-wrapper,
.preview-root[data-preview-viewport="mobile"] .nav-links-wrapper {
  display: none !important;
}

/* Add some backdrop contrast in preview modes */
.preview-root[data-preview-viewport="tablet"],
.preview-root[data-preview-viewport="mobile"] {
  background: #f1f5f9;
  padding: 18px 10px;
}

.navbar {
  background-color: var(--primary);
  color: white;
  padding: 20px 0;
  box-shadow: var(--shadow-lg);
  border-bottom: 3px solid var(--accent);
}

.navbar .nav-title,
.navbar .brand-trigger,
.navbar .mobile-menu-toggle,
.navbar .nav-availability-label,
.navbar .nav-availability-info {
  color: var(--header-text-color, #fff) !important;
}

.nav-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  /* Allow dropdowns (e.g., Switch Brand) to render outside navbar row */
  overflow: visible;
  position: relative;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
  min-width: 0;
}

.brand-switcher {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.brand-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
}

.brand-caret {
  font-size: 14px;
  opacity: 0.9;
}

.brand-menu {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  min-width: 220px;
  background: white;
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  padding: 10px;
  z-index: 1100;
}

.nav-dropdown {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.nav-dropdown-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: white;
  padding: 6px 12px;
  border-radius: 6px; /* match nav links */
  font-weight: 400;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 16px;
  font-family: var(--agency-font-family, var(--font-body));
}

.nav-dropdown-trigger:hover {
  background-color: rgba(255,255,255,0.1);
}

.nav-dropdown-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  min-width: 220px;
  background: white;
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  padding: 10px;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* Match top-nav text sizing */
  font-size: 16px;
}

.nav-dropdown-sep {
  height: 1px;
  background: #e2e8f0;
  margin: 8px 4px;
}

.nav-dropdown-menu a {
  display: block;
  padding: 8px 10px;
  border-radius: 10px;
  /* IMPORTANT: override .nav-links a { color: white } */
  color: var(--text-primary) !important;
  text-decoration: none;
  /* Match top-nav link typography */
  font-size: inherit;
  font-weight: 400;
  font-family: var(--agency-font-family, var(--font-body));
}

.nav-dropdown-menu a:hover {
  background: #f8fafc;
}

.brand-menu-title {
  font-weight: 800;
  font-size: 13px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.brand-menu-section {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin: 8px 0 6px;
}

.brand-option {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 13px;
}

.brand-option:hover {
  background: #f8fafc;
  border-color: #e2e8f0;
}

.brand-option.active {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #1e3a8a;
}

.nav-logo {
  flex-shrink: 0;
}

.nav-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
}

/* Wrapper for nav-links to enable horizontal scrolling */
.nav-links-wrapper {
  flex: 1;
  min-width: 0;
  /* IMPORTANT: Dropdown menus must be able to render outside this row.
     Avoid horizontal scrolling here; use dropdowns instead. */
  overflow: visible;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: nowrap;
  flex-shrink: 1;
  min-width: 0;
}

@media (max-width: 1400px) {
  .nav-links-wrapper {
    overflow-x: auto;
    overflow-y: visible;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .nav-links-wrapper::-webkit-scrollbar {
    display: none;
  }

  .nav-links {
    min-width: max-content;
  }

  .nav-links-wrapper.nav-menus-open {
    overflow: visible;
  }
}

.nav-availability {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 10px;
  padding-left: 10px;
  border-left: 1px solid var(--border);
  position: relative;
}
.nav-availability-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 700;
}
.nav-availability-info {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 16px;
  padding: 0;
  cursor: pointer;
}
.nav-availability-hint {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: min(420px, 75vw);
  background: white;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-primary);
  z-index: 1000;
}
.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  transition: .2s;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 2px;
  background-color: white;
  transition: .2s;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0,0,0,0.18);
}
.switch input:checked + .slider {
  background-color: var(--primary);
}
.switch input:checked + .slider:before {
  transform: translateX(20px);
}

.nav-links a {
  color: white;
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 5px;
  transition: background-color 0.3s;
  white-space: nowrap;
  flex-shrink: 0;
  font-size: 16px;
}

.nav-links a:hover,
.nav-links a.router-link-active {
  background-color: rgba(255,255,255,0.1);
}

.nav-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  margin-left: 8px;
  font-size: 12px;
  font-weight: 800;
  background: var(--danger);
  color: white;
}

.nav-badge-pulse {
  animation: obnoxiousPulse 1.35s ease-in-out infinite;
}

.nav-obnoxious-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 34px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--danger);
  color: white;
  font-weight: 900;
  font-size: 16px;
  letter-spacing: -0.02em;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.25);
  animation: obnoxiousPulse 1.35s ease-in-out infinite;
  text-decoration: none;
}
.nav-obnoxious-badge:hover {
  transform: translateY(-1px);
}
@keyframes obnoxiousPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}

.nav-compact-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--danger);
  color: white;
  font-weight: 900;
  font-size: 14px;
  letter-spacing: -0.02em;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.2);
  text-decoration: none;
}
.nav-compact-badge:hover {
  transform: translateY(-1px);
}

.notifications-alert-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1600;
  padding: 20px;
}

.notifications-alert-card {
  background: white;
  border-radius: 16px;
  border: 1px solid var(--border);
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
  padding: 18px 20px;
  width: min(460px, 92vw);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notifications-alert-title {
  font-size: 18px;
  font-weight: 900;
  color: var(--text-primary);
}

.notifications-alert-body {
  font-size: 14px;
  color: var(--text-secondary);
}

.notifications-alert-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.notifications-nudge {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1500;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: white;
  color: var(--text-primary);
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.2);
  cursor: pointer;
  font-weight: 800;
}

.notifications-nudge:hover {
  transform: translateY(-1px);
}

.notifications-nudge-label {
  font-size: 14px;
}

.notifications-nudge-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--danger);
  color: white;
  font-size: 12px;
  font-weight: 900;
  box-shadow: 0 8px 16px rgba(239, 68, 68, 0.35);
}

.notifications-nudge-flash {
  animation: notificationsNudgeFlash 1.2s ease-in-out 0s 2;
}

@keyframes notificationsNudgeFlash {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
  }
  50% {
    transform: scale(1.14);
    box-shadow: 0 0 0 12px rgba(239, 68, 68, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}

.mobile-nav-link-obnoxious {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.mobile-obnoxious-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--danger);
  color: white;
  font-weight: 900;
  font-size: 14px;
  border: 2px solid rgba(255, 255, 255, 0.85);
  animation: obnoxiousPulse 1.35s ease-in-out infinite;
}

.nav-links .btn {
  white-space: nowrap;
  flex-shrink: 0;
  width: auto;
  min-width: auto;
  padding: 8px 16px;
}

.welcome-hang-wrap {
  display: flex;
  justify-content: flex-end;
  padding: 0 20px;
  margin-top: -2px; /* visually attaches to navbar bottom border */
}

.welcome-hang-link {
  display: inline-flex;
  align-items: center;
  background: white;
  color: var(--primary);
  border: 2px solid var(--accent);
  border-top: 0;
  border-radius: 0 0 10px 10px;
  padding: 8px 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
  box-shadow: var(--shadow-lg);
  max-width: 80vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  text-decoration: none;
}

.welcome-hang-link:focus {
  outline: 2px solid rgba(99, 102, 241, 0.45);
  outline-offset: 2px;
}

.welcome-text,
.dashboard-text {
  display: inline-block;
  min-width: 0;
}

.dashboard-text {
  display: none;
}

.welcome-hang-link:hover .welcome-text,
.welcome-hang-link:focus .welcome-text,
.welcome-hang-link:focus-visible .welcome-text {
  display: none;
}

.welcome-hang-link:hover .dashboard-text,
.welcome-hang-link:focus .dashboard-text,
.welcome-hang-link:focus-visible .dashboard-text {
  display: inline-block;
}

.preferences-link {
  color: #ecf0f1;
  text-decoration: none;
  padding: 8px 16px;
  border-radius: 6px;
  transition: background-color 0.2s;
  font-size: 14px;
}

.preferences-link:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

/* Mobile Menu Toggle Button (always visible, positioned on left) */
.mobile-menu-toggle {
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  width: 30px;
  height: 30px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  z-index: 1001;
  flex-shrink: 0;
  margin-right: 16px;
  order: -1; /* Place before nav-brand */
}

.hamburger-line {
  width: 100%;
  height: 3px;
  background-color: white;
  border-radius: 2px;
  transition: all 0.3s ease;
  transform-origin: center;
}

.hamburger-line.active:nth-child(1) {
  transform: rotate(45deg) translate(8px, 8px);
}

.hamburger-line.active:nth-child(2) {
  opacity: 0;
}

.hamburger-line.active:nth-child(3) {
  transform: rotate(-45deg) translate(8px, -8px);
}

/* Mobile Sidebar (available on all screen sizes) */
.mobile-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 280px;
  height: 100vh;
  background-color: var(--primary);
  color: white;
  transform: translateX(-100%);
  transition: transform 0.3s ease;
  z-index: 1000;
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.2);
  overflow-y: auto;
}

.mobile-sidebar.open {
  transform: translateX(0);
}

.mobile-sidebar-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.mobile-sidebar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.2);
  position: relative;
}

.mobile-logo {
  flex-shrink: 0;
}

.mobile-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-close {
  position: absolute;
  top: 20px;
  right: 20px;
  background: none;
  border: none;
  color: white;
  font-size: 32px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.mobile-close:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.mobile-nav-links {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 20px 0;
  overflow-y: auto;
}

.mobile-nav-link {
  color: white;
  text-decoration: none;
  padding: 16px 20px;
  transition: background-color 0.2s;
  border-left: 3px solid transparent;
  display: block;
}

.mobile-nav-link:hover,
.mobile-nav-link.router-link-active {
  background-color: rgba(255, 255, 255, 0.1);
  border-left-color: white;
}

.mobile-sidebar-footer {
  padding: 20px;
  border-top: 2px solid rgba(255, 255, 255, 0.2);
}

.mobile-logout {
  width: 100%;
}

.tutorial-toggle.active {
  background-color: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.35);
}

.mobile-tutorial-toggle {
  margin: 10px 20px 0;
}

.mobile-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 999;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.nav-icon-btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: white;
  font-weight: 900;
  line-height: 1;
}
.nav-icon-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}
.nav-icon-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
  display: block;
  filter: brightness(0) invert(1);
}

/* Responsive: Hide desktop nav on small mobile, show hamburger */
@media (max-width: 1200px) {
  /* Prevent horizontal overflow on smaller laptops by allowing wrapping. */
  .nav-content {
    align-items: flex-start;
  }

  .nav-links {
    flex-wrap: wrap;
    row-gap: 10px;
  }

  .nav-availability {
    margin-left: 0;
    padding-left: 0;
    border-left: none;
  }
}

@media (max-width: 768px) {
  .nav-links-wrapper {
    display: none;
  }

  .nav-title {
    font-size: 18px;
  }
}

/* Responsive: Adjust sidebar width on very small screens */
@media (max-width: 480px) {
  .mobile-sidebar {
    width: 100%;
    max-width: 320px;
  }
}

main {
  min-height: calc(100vh - 70px);
  padding: 20px 0;
  display: flex;
  flex-direction: column;
}

/* School staff / portal-only routes should not reserve space for global chrome. */
main.main-no-global-chrome {
  min-height: 100vh;
  padding: 0;
}

#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
</style>
