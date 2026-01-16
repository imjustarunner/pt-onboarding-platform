<template>
  <BrandingProvider>
    <div id="app">
      <nav v-if="isAuthenticated" class="navbar">
        <div class="container">
          <div class="nav-content">
            <button class="mobile-menu-toggle" @click="mobileMenuOpen = !mobileMenuOpen" aria-label="Toggle menu">
              <span class="hamburger-line" :class="{ active: mobileMenuOpen }"></span>
              <span class="hamburger-line" :class="{ active: mobileMenuOpen }"></span>
              <span class="hamburger-line" :class="{ active: mobileMenuOpen }"></span>
            </button>
            <div class="nav-brand">
              <BrandingLogo size="medium" class="nav-logo" />
              <h1 v-if="navTitleText" class="nav-title">{{ navTitleText }}</h1>
            </div>
            <div class="nav-links-wrapper">
              <div class="nav-links">
              <router-link v-if="showOnDemandLink" :to="orgTo('/on-demand-training')" @click="closeMobileMenu">On-Demand Training</router-link>
              <router-link :to="orgTo('/dashboard')" @click="closeMobileMenu">
                {{ isPrivilegedPortalUser ? 'My Dashboard' : 'Dashboard' }}
              </router-link>

              <!-- Portal navigation (admins must see this even if ACTIVE_EMPLOYEE) -->
              <template v-if="canSeePortalNav">
                <router-link :to="orgTo('/admin')" v-if="isAdmin || isSupervisor(user) || user?.role === 'clinical_practice_assistant'" @click="closeMobileMenu">Admin Dashboard</router-link>

                <router-link :to="orgTo('/admin/modules')" v-if="isAdmin && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" @click="closeMobileMenu">Training</router-link>
                <router-link :to="orgTo('/admin/documents')" v-if="isAdmin && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" @click="closeMobileMenu">Documents</router-link>
                <router-link :to="orgTo('/admin/users')" v-if="isAdmin || isSupervisor(user) || user?.role === 'clinical_practice_assistant'" @click="closeMobileMenu">Users</router-link>
                <router-link :to="orgTo('/admin/clients')" v-if="isAdmin || user?.role === 'provider'" @click="closeMobileMenu">Clients</router-link>
                <router-link :to="orgTo('/admin/communications')" v-if="isAdmin || user?.role === 'clinical_practice_assistant'" @click="closeMobileMenu">Communications</router-link>
                <router-link :to="orgTo('/admin/payroll')" v-if="isAdmin" @click="closeMobileMenu">Payroll</router-link>

                <router-link :to="orgTo('/admin/notifications')" v-if="isAdmin && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" @click="closeMobileMenu">Notifications</router-link>
                <router-link :to="orgTo('/notifications')" v-if="isSupervisor(user) || user?.role === 'clinical_practice_assistant'" @click="closeMobileMenu">Notifications</router-link>

                <router-link :to="orgTo('/admin/settings')" v-if="(canCreateEdit || user?.role === 'support') && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" @click="closeMobileMenu">Settings</router-link>
              </template>
              <router-link :to="orgTo('/schedule')" @click="closeMobileMenu" class="nav-link">Office Schedule</router-link>
              <button @click="handleLogout" class="btn btn-secondary">Logout</button>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <!-- Welcome tag (hangs under navbar) -->
      <div v-if="isAuthenticated" class="welcome-hang-wrap">
        <div class="welcome-hang">
          Welcome, {{ welcomeName }}
        </div>
      </div>
      <!-- Mobile Sidebar (available on all screen sizes) -->
      <div v-if="isAuthenticated" class="mobile-sidebar" :class="{ open: mobileMenuOpen }" @click.self="mobileMenuOpen = false">
        <div class="mobile-sidebar-content">
          <div class="mobile-sidebar-header">
            <BrandingLogo size="medium" class="mobile-logo" />
            <h2 v-if="navTitleText" class="mobile-title">{{ navTitleText }}</h2>
            <button class="mobile-close" @click="mobileMenuOpen = false" aria-label="Close menu">×</button>
          </div>
          <div class="mobile-nav-links">
            <router-link v-if="showOnDemandLink" :to="orgTo('/on-demand-training')" @click="closeMobileMenu" class="mobile-nav-link">On-Demand Training</router-link>
            <router-link :to="orgTo('/dashboard')" @click="closeMobileMenu" class="mobile-nav-link">
              {{ isPrivilegedPortalUser ? 'My Dashboard' : 'Dashboard' }}
            </router-link>
            <router-link :to="orgTo('/schedule')" @click="closeMobileMenu" class="mobile-nav-link">Office Schedule</router-link>

            <template v-if="canSeePortalNav">
              <router-link :to="orgTo('/admin')" v-if="isAdmin || isSupervisor(user) || user?.role === 'clinical_practice_assistant'" @click="closeMobileMenu" class="mobile-nav-link">Admin Dashboard</router-link>

              <router-link :to="orgTo('/admin/modules')" v-if="isAdmin && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" @click="closeMobileMenu" class="mobile-nav-link">Training</router-link>
              <router-link :to="orgTo('/admin/documents')" v-if="isAdmin && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" @click="closeMobileMenu" class="mobile-nav-link">Documents</router-link>
              <router-link :to="orgTo('/admin/users')" v-if="isAdmin || isSupervisor(user) || user?.role === 'clinical_practice_assistant'" @click="closeMobileMenu" class="mobile-nav-link">Users</router-link>
              <router-link :to="orgTo('/admin/clients')" v-if="isAdmin || user?.role === 'provider'" @click="closeMobileMenu" class="mobile-nav-link">Clients</router-link>
              <router-link :to="orgTo('/admin/communications')" v-if="isAdmin || user?.role === 'clinical_practice_assistant'" @click="closeMobileMenu" class="mobile-nav-link">Communications</router-link>
              <router-link :to="orgTo('/admin/payroll')" v-if="isAdmin" @click="closeMobileMenu" class="mobile-nav-link">Payroll</router-link>

              <router-link :to="orgTo('/admin/notifications')" v-if="isAdmin && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" @click="closeMobileMenu" class="mobile-nav-link">Notifications</router-link>
              <router-link :to="orgTo('/notifications')" v-if="isSupervisor(user) || user?.role === 'clinical_practice_assistant'" @click="closeMobileMenu" class="mobile-nav-link">Notifications</router-link>

              <router-link :to="orgTo('/admin/settings')" v-if="(canCreateEdit || user?.role === 'support') && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" @click="closeMobileMenu" class="mobile-nav-link">Settings</router-link>
            </template>
          </div>
          <div class="mobile-sidebar-footer">
            <button @click="handleLogout" class="btn btn-secondary mobile-logout">Logout</button>
          </div>
        </div>
      </div>
      <!-- Mobile Sidebar Overlay -->
      <div v-if="isAuthenticated && mobileMenuOpen" class="mobile-overlay" @click="mobileMenuOpen = false"></div>
      <main>
        <AgencySelector v-if="isAuthenticated && !brandingStore.isSuperAdmin" />
        <router-view />
      </main>
      <PoweredByFooter v-if="isAuthenticated" />
    </div>
  </BrandingProvider>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from './store/auth';
import { useBrandingStore } from './store/branding';
import { useAgencyStore } from './store/agency';
import { useOrganizationStore } from './store/organization';
import { useRouter, useRoute } from 'vue-router';
import { startActivityTracking, stopActivityTracking } from './utils/activityTracker';
import { isSupervisor } from './utils/helpers.js';
import AgencySelector from './components/AgencySelector.vue';
import BrandingProvider from './components/BrandingProvider.vue';
import BrandingLogo from './components/BrandingLogo.vue';
import PoweredByFooter from './components/PoweredByFooter.vue';

const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();
const organizationStore = useOrganizationStore();
const router = useRouter();
const route = useRoute();
const mobileMenuOpen = ref(false);

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
const user = computed(() => authStore.user);
const welcomeName = computed(() => {
  const first = user.value?.firstName?.trim();
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
  return user.value?.role !== 'super_admin' && isOnDemandUser.value;
});

const canCreateEdit = computed(() => {
  const role = user.value?.role;
  return role === 'admin' || role === 'super_admin';
});

const activeOrganizationSlug = computed(() => {
  const slugFromRoute = route.params.organizationSlug;
  if (typeof slugFromRoute === 'string' && slugFromRoute) return slugFromRoute;
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

const handleLogout = async () => {
  stopActivityTracking();
  mobileMenuOpen.value = false;
  await authStore.logout();
  router.push('/login');
};

// Start/stop activity tracking based on authentication status
watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    startActivityTracking();
  } else {
    stopActivityTracking();
  }
}, { immediate: true });

// Watch for route changes to load organization context
watch(() => route.params.organizationSlug, async (newSlug) => {
  if (newSlug) {
    await organizationStore.fetchBySlug(newSlug);
  } else {
    organizationStore.clearOrganization();
  }
}, { immediate: true });

onMounted(async () => {
  // Load organization context if route has organization slug
  if (route.params.organizationSlug) {
    await organizationStore.fetchBySlug(route.params.organizationSlug);
  }
  // Initialize portal theme on app load (for subdomain detection)
  await brandingStore.initializePortalTheme();
  
  if (isAuthenticated.value) {
    startActivityTracking();
    
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
});

onUnmounted(() => {
  stopActivityTracking();
});
</script>

<style scoped>
.navbar {
  background-color: var(--primary);
  color: white;
  padding: 20px 0;
  box-shadow: var(--shadow-lg);
  border-bottom: 3px solid var(--accent);
}

.nav-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  overflow: hidden;
  position: relative;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
  min-width: 0;
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
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
}

.nav-links-wrapper::-webkit-scrollbar {
  height: 6px;
}

.nav-links-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.nav-links-wrapper::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.nav-links-wrapper::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.5);
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: nowrap;
  flex-shrink: 0;
  min-width: max-content;
  padding-right: 10px;
}

.nav-links a {
  color: white;
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 5px;
  transition: background-color 0.3s;
  white-space: nowrap;
  flex-shrink: 0;
}

.nav-links a:hover,
.nav-links a.router-link-active {
  background-color: rgba(255,255,255,0.1);
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

.welcome-hang {
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

/* Responsive: Hide desktop nav on small mobile, show hamburger */
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

#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
</style>
